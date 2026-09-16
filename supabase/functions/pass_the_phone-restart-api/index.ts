import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_DB_URL) throw new Error("Supabase runtime credentials are unavailable.");

const sql = postgres(SUPABASE_DB_URL, { prepare: false, max: 1, idle_timeout: 20 });
const realtime = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}
function asIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : String(value ?? "");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function broadcast(code: string) {
  try {
    const channel = realtime.channel(`pass_the_phone:room:${code}`, { config: { broadcast: { self: true } } });
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const timer = setTimeout(finish, 650);
      channel.subscribe((status) => {
        if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          clearTimeout(timer);
          finish();
        }
      });
    });
    await channel.send({ type: "broadcast", event: "state_changed", payload: {} });
    await realtime.removeChannel(channel);
  } catch {
    // Polling remains the fallback.
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

    const roomRows = await sql<Record<string, any>[]>`select * from pass_the_phone.rooms where code = ${code} limit 1`;
    const room = roomRows[0];
    if (!room) return json({ ok: false, error: "Room not found or expired." }, 404);

    const tokenHash = await sha256(token);
    const playerRows = await sql<Record<string, any>[]>`
      select * from pass_the_phone.players
      where room_id = ${room.id}::uuid and session_token_hash = ${tokenHash} and kicked = false limit 1
    `;
    const player = playerRows[0];
    if (!player) return json({ ok: false, error: "Your room session is no longer valid." }, 401);
    if (!player.is_host || room.host_player_id !== player.id) return json({ ok: false, error: "Only the host can replay this room." }, 403);

    await sql.begin(async (tx) => {
      const locked = await tx<Record<string, any>[]>`select id from pass_the_phone.rooms where id = ${room.id}::uuid for update`;
      if (!locked[0]) throw new Error("Room disappeared during replay reset.");
      await tx`delete from pass_the_phone.choices where room_id = ${room.id}::uuid`;
      await tx`
        update pass_the_phone.rooms set
          status = 'lobby', round_number = 0, current_turn_player_id = null, current_question = null,
          question_history = '{}'::text[], final_results = null,
          updated_at = now(), last_activity_at = now(), expires_at = now() + interval '6 hours'
        where id = ${room.id}::uuid
      `;
    });

    await broadcast(code);

    const nextRoomRows = await sql<Record<string, any>[]>`select * from pass_the_phone.rooms where id = ${room.id}::uuid limit 1`;
    const nextRoom = nextRoomRows[0];
    const players = await sql<Record<string, any>[]>`select * from pass_the_phone.players where room_id = ${room.id}::uuid and kicked = false order by join_order`;
    const messages = await sql<Record<string, any>[]>`
      select id, player_id, body, created_at from (
        select id, player_id, body, created_at from pass_the_phone.chat_messages
        where room_id = ${room.id}::uuid order by created_at desc limit 100
      ) recent order by created_at asc
    `;
    const publicPlayers = players.map((item) => ({
      id: item.id,
      name: item.name,
      color: item.color,
      initial: item.initial,
      isHost: Boolean(item.is_host),
      joinOrder: Number(item.join_order),
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
          questionLimit: nextRoom.question_limit === null ? null : Number(nextRoom.question_limit),
          allowSelf: Boolean(nextRoom.allow_self),
          chatEnabled: Boolean(nextRoom.chat_enabled),
          roundNumber: 0,
          currentTurnPlayerId: null,
          currentQuestion: null,
          questionHistoryCount: 0,
          createdAt: asIso(nextRoom.created_at),
        },
        me: publicPlayers.find((item) => item.id === player.id),
        players: publicPlayers,
        choices: [],
        messages: messages.map((message) => ({ id: message.id, playerId: message.player_id, body: message.body, createdAt: asIso(message.created_at) })),
        final: null,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("pass_the_phone-restart-api", error);
    return json({ ok: false, error: "Could not restart this room." }, 500);
  }
});
