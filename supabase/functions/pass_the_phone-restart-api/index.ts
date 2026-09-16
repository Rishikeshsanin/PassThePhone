import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const db = supabase.schema("pass_the_phone");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function broadcast(code: string) {
  try {
    const channel = supabase.channel(`pass_the_phone:room:${code}`, { config: { broadcast: { self: true } } });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 650);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await channel.send({ type: "broadcast", event: "state_changed", payload: {} });
    await supabase.removeChannel(channel);
  } catch {
    // Clients also poll, so realtime is best-effort.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5) : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (code.length !== 5 || token.length < 20) return json({ ok: false, error: "Invalid room session." }, 401);

    const { data: room } = await db.from("rooms").select("*").eq("code", code).maybeSingle();
    if (!room) return json({ ok: false, error: "Room not found or expired." }, 404);

    const tokenHash = await sha256(token);
    const { data: player } = await db.from("players")
      .select("*")
      .eq("room_id", room.id)
      .eq("session_token_hash", tokenHash)
      .eq("kicked", false)
      .maybeSingle();
    if (!player) return json({ ok: false, error: "Your room session is no longer valid." }, 401);
    if (!player.is_host || room.host_player_id !== player.id) return json({ ok: false, error: "Only the host can replay this room." }, 403);

    await db.from("choices").delete().eq("room_id", room.id);
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const { error } = await db.from("rooms").update({
      status: "lobby",
      round_number: 0,
      current_turn_player_id: null,
      current_question: null,
      question_history: [],
      final_results: null,
      updated_at: now,
      last_activity_at: now,
      expires_at: expires,
    }).eq("id", room.id);
    if (error) throw error;

    await broadcast(code);

    const [{ data: nextRoom }, { data: players }, { data: messages }] = await Promise.all([
      db.from("rooms").select("*").eq("id", room.id).single(),
      db.from("players").select("*").eq("room_id", room.id).eq("kicked", false).order("join_order"),
      db.from("chat_messages").select("id,player_id,body,created_at").eq("room_id", room.id).order("created_at", { ascending: false }).limit(100),
    ]);

    const publicPlayers = (players ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      initial: p.initial,
      isHost: Boolean(p.is_host),
      joinOrder: Number(p.join_order),
      connected: true,
    }));

    return json({
      ok: true,
      data: {
        room: {
          code: nextRoom.code,
          status: nextRoom.status,
          categories: nextRoom.categories,
          heat: Number(nextRoom.heat),
          sessionLength: nextRoom.session_length,
          questionLimit: nextRoom.question_limit,
          allowSelf: Boolean(nextRoom.allow_self),
          chatEnabled: Boolean(nextRoom.chat_enabled),
          roundNumber: Number(nextRoom.round_number),
          currentTurnPlayerId: nextRoom.current_turn_player_id,
          currentQuestion: nextRoom.current_question,
          questionHistoryCount: 0,
          createdAt: nextRoom.created_at,
        },
        me: publicPlayers.find((p) => p.id === player.id),
        players: publicPlayers,
        choices: [],
        messages: (messages ?? []).reverse().map((m) => ({ id: m.id, playerId: m.player_id, body: m.body, createdAt: m.created_at })),
        final: null,
        serverTime: now,
      },
    });
  } catch (error) {
    console.error("pass_the_phone-restart-api", error);
    return json({ ok: false, error: "Could not restart this room." }, 500);
  }
});
