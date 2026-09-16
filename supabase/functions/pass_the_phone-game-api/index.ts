import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { pickQuestion, validCategories, type GameCategory, type Question } from "./questions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Supabase runtime credentials are unavailable.");
}

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

const COLORS = [
  "#8b5cf6", "#ec4899", "#06b6d4", "#22c55e", "#f59e0b",
  "#ef4444", "#14b8a6", "#3b82f6", "#a855f7", "#f97316",
  "#84cc16", "#e11d48", "#0ea5e9", "#6366f1", "#d946ef",
];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REACTIONS = new Set(["😂", "❤️", "💀", "😭", "🔥", "👀", "🤡", "👏", "😮", "🙌"]);
const SESSION_LENGTHS = new Set(["20", "30", "40", "unlimited"]);

class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function ok(data: unknown) {
  return response({ ok: true, data });
}

function randomCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => CODE_CHARS[value % CODE_CHARS.length]).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanName(input: unknown) {
  if (typeof input !== "string") throw new ApiError("Enter your name.");
  const value = input.trim().replace(/\s+/g, " ").slice(0, 24);
  if (!value) throw new ApiError("Enter your name.");
  return value;
}

function cleanCode(input: unknown) {
  if (typeof input !== "string") throw new ApiError("Enter a valid room code.");
  const code = input.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5);
  if (code.length !== 5) throw new ApiError("Enter a valid 5-character room code.");
  return code;
}

function nowIso() {
  return new Date().toISOString();
}

function expiresIso() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
}

async function touchRoom(roomId: string) {
  await db.from("rooms").update({
    last_activity_at: nowIso(),
    updated_at: nowIso(),
    expires_at: expiresIso(),
  }).eq("id", roomId);
}

async function broadcast(code: string, event = "state_changed", payload: Record<string, unknown> = {}) {
  try {
    const channel = supabase.channel(`pass_the_phone:room:${code}`, {
      config: { broadcast: { self: true } },
    });
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timer = setTimeout(finish, 650);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          finish();
        }
      });
    });
    await channel.send({ type: "broadcast", event, payload });
    await supabase.removeChannel(channel);
  } catch {
    // Polling is a deliberate fallback, so realtime delivery is best-effort.
  }
}

type DbRoom = Record<string, any>;
type DbPlayer = Record<string, any>;
type DbChoice = Record<string, any>;

type Context = {
  code: string;
  room: DbRoom;
  player: DbPlayer;
};

async function authenticate(codeInput: unknown, tokenInput: unknown): Promise<Context> {
  const code = cleanCode(codeInput);
  if (typeof tokenInput !== "string" || tokenInput.length < 20) {
    throw new ApiError("This room session is missing. Rejoin the room.", 401, "SESSION_REQUIRED");
  }
  const { data: room, error: roomError } = await db.from("rooms").select("*").eq("code", code).maybeSingle();
  if (roomError) throw new ApiError("Could not load this room.", 500, "ROOM_LOOKUP_FAILED");
  if (!room) throw new ApiError("Room not found or expired.", 404, "ROOM_NOT_FOUND");
  if (Date.parse(room.expires_at) < Date.now()) throw new ApiError("This room has expired.", 410, "ROOM_EXPIRED");

  const tokenHash = await sha256(tokenInput);
  const { data: player, error: playerError } = await db.from("players")
    .select("*")
    .eq("room_id", room.id)
    .eq("session_token_hash", tokenHash)
    .eq("kicked", false)
    .maybeSingle();
  if (playerError) throw new ApiError("Could not verify this room session.", 500, "SESSION_LOOKUP_FAILED");
  if (!player) throw new ApiError("Your room session is no longer valid.", 401, "SESSION_INVALID");
  return { code, room, player };
}

function publicPlayer(player: DbPlayer) {
  const seen = Date.parse(player.last_seen_at ?? 0);
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    initial: player.initial,
    isHost: Boolean(player.is_host),
    joinOrder: Number(player.join_order),
    connected: !player.kicked && Number.isFinite(seen) && seen > Date.now() - 45_000,
  };
}

function publicChoice(choice: DbChoice) {
  return {
    id: choice.id,
    roundNumber: Number(choice.round_number),
    questionId: choice.question_id,
    questionText: choice.question_text,
    category: choice.category,
    intensity: Number(choice.intensity),
    awardCategory: choice.award_category ?? null,
    chooserPlayerId: choice.chooser_player_id,
    chosenPlayerId: choice.chosen_player_id,
    nextTurnPlayerId: choice.next_turn_player_id,
    turnShuffled: Boolean(choice.turn_shuffled),
    createdAt: choice.created_at,
  };
}

async function roomState(ctx: Context) {
  const [{ data: room }, { data: players }, { data: choices }, { data: messages }] = await Promise.all([
    db.from("rooms").select("*").eq("id", ctx.room.id).single(),
    db.from("players").select("*").eq("room_id", ctx.room.id).eq("kicked", false).order("join_order"),
    db.from("choices").select("*").eq("room_id", ctx.room.id).order("round_number", { ascending: true }),
    db.from("chat_messages").select("id,player_id,body,created_at").eq("room_id", ctx.room.id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!room) throw new ApiError("Room not found.", 404, "ROOM_NOT_FOUND");
  const me = (players ?? []).find((p) => p.id === ctx.player.id) ?? ctx.player;
  return {
    room: {
      code: room.code,
      status: room.status,
      categories: room.categories,
      heat: Number(room.heat),
      sessionLength: room.session_length,
      questionLimit: room.question_limit,
      allowSelf: Boolean(room.allow_self),
      chatEnabled: Boolean(room.chat_enabled),
      roundNumber: Number(room.round_number),
      currentTurnPlayerId: room.current_turn_player_id,
      currentQuestion: room.current_question,
      questionHistoryCount: Array.isArray(room.question_history) ? room.question_history.length : 0,
      createdAt: room.created_at,
    },
    me: publicPlayer(me),
    players: (players ?? []).map(publicPlayer),
    choices: (choices ?? []).map(publicChoice),
    messages: (messages ?? []).reverse().map((message) => ({
      id: message.id,
      playerId: message.player_id,
      body: message.body,
      createdAt: message.created_at,
    })),
    final: room.final_results ?? null,
    serverTime: nowIso(),
  };
}

function requireHost(ctx: Context) {
  if (!ctx.player.is_host || ctx.room.host_player_id !== ctx.player.id) {
    throw new ApiError("Only the host can do that.", 403, "HOST_ONLY");
  }
}

function questionLimit(length: string) {
  return length === "unlimited" ? null : Number(length);
}

function awardTitle(category: string) {
  const titles: Record<string, string> = {
    support: "The Motivator",
    success: "Future CEO",
    romance: "Rom-Com Lead",
    survival: "Last One Standing",
    trust: "The Vault",
    humour: "Comedy Department",
    responsibility: "The Responsible One",
    leadership: "Group Captain",
    adventure: "Adventure Magnet",
    "main-character": "Main Character",
    chaos: "Chaos Magnet",
    predictable: "Most Predictable",
    social: "Social Butterfly",
    loyalty: "The Real One",
    care: "Heart of the Group",
    mystery: "Wild Card",
    overthinker: "Professional Overthinker",
    hero: "Hero Energy",
  };
  return titles[category] ?? category.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function computeFinal(choices: DbChoice[], players: DbPlayer[]) {
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const selected = new Map<string, number>();
  const hot = new Map<string, number>();
  const categoryMaps = new Map<string, Map<string, number>>();
  const pairs = new Map<string, number>();

  for (const choice of choices) {
    selected.set(choice.chosen_player_id, (selected.get(choice.chosen_player_id) ?? 0) + 1);
    if (Number(choice.intensity) >= 4) hot.set(choice.chosen_player_id, (hot.get(choice.chosen_player_id) ?? 0) + 1);
    if (choice.award_category) {
      const map = categoryMaps.get(choice.award_category) ?? new Map<string, number>();
      map.set(choice.chosen_player_id, (map.get(choice.chosen_player_id) ?? 0) + 1);
      categoryMaps.set(choice.award_category, map);
    }
    const [a, b] = [choice.chooser_player_id, choice.chosen_player_id].sort();
    const key = `${a}::${b}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }

  const top = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const mostChosenEntry = top(selected);
  const heatEntry = top(hot);
  const pairEntry = top(pairs);
  const categoryWinners = [...categoryMaps.entries()].flatMap(([category, map]) => {
    const winner = top(map);
    if (!winner) return [];
    return [{
      category,
      title: awardTitle(category),
      playerId: winner[0],
      playerName: nameById.get(winner[0]) ?? "Player",
      count: winner[1],
    }];
  }).sort((a, b) => b.count - a.count).slice(0, 7);

  const mostChosen = mostChosenEntry ? {
    playerId: mostChosenEntry[0],
    playerName: nameById.get(mostChosenEntry[0]) ?? "Player",
    count: mostChosenEntry[1],
  } : null;
  const heatSurvivor = heatEntry ? {
    playerId: heatEntry[0],
    playerName: nameById.get(heatEntry[0]) ?? "Player",
    count: heatEntry[1],
  } : null;
  const strongestChain = pairEntry ? (() => {
    const [from, to] = pairEntry[0].split("::");
    return {
      from,
      fromName: nameById.get(from) ?? "Player",
      to,
      toName: nameById.get(to) ?? "Player",
      count: pairEntry[1],
    };
  })() : null;

  const receipts: string[] = [];
  if (mostChosen) receipts.push(`${mostChosen.playerName} was picked ${mostChosen.count} time${mostChosen.count === 1 ? "" : "s"} — certified main-character energy.`);
  if (strongestChain && strongestChain.count >= 2) receipts.push(`${strongestChain.fromName} ↔ ${strongestChain.toName} formed the strongest chain with ${strongestChain.count} picks between them.`);
  if (heatSurvivor) receipts.push(`${heatSurvivor.playerName} took ${heatSurvivor.count} pick${heatSurvivor.count === 1 ? "" : "s"} at Heat 4–5.`);
  for (const award of categoryWinners.slice(0, 3)) {
    receipts.push(`${award.playerName} owned the “${award.title}” category with ${award.count} pick${award.count === 1 ? "" : "s"}.`);
  }

  return {
    questionCount: choices.length,
    mostChosen,
    heatSurvivor,
    strongestChain,
    awardWinners: categoryWinners,
    receipts: receipts.slice(0, 6),
  };
}

async function chooseNextTurn(chosenId: string, chooserId: string, players: DbPlayer[], recent: DbChoice[]) {
  let nextTurnPlayerId = chosenId;
  let turnShuffled = false;
  if (players.length >= 4 && recent.length >= 3) {
    const [a, b, c] = recent;
    const pingPong =
      a.chooser_player_id === chosenId && a.chosen_player_id === chooserId &&
      b.chooser_player_id === chooserId && b.chosen_player_id === chosenId &&
      c.chooser_player_id === chosenId && c.chosen_player_id === chooserId;
    if (pingPong) {
      const turnCounts = new Map(players.map((p) => [p.id, 0]));
      for (const choice of recent) {
        turnCounts.set(choice.chooser_player_id, (turnCounts.get(choice.chooser_player_id) ?? 0) + 1);
      }
      const candidates = players.filter((p) => p.id !== chooserId && p.id !== chosenId);
      if (candidates.length) {
        const min = Math.min(...candidates.map((p) => turnCounts.get(p.id) ?? 0));
        const leastUsed = candidates.filter((p) => (turnCounts.get(p.id) ?? 0) === min);
        nextTurnPlayerId = leastUsed[Math.floor(Math.random() * leastUsed.length)].id;
        turnShuffled = true;
      }
    }
  }
  return { nextTurnPlayerId, turnShuffled };
}

async function createRoom(nameInput: unknown) {
  const name = cleanName(nameInput);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const token = randomToken();
    const hash = await sha256(token);
    const { data: room, error: roomError } = await db.from("rooms").insert({
      code,
      status: "lobby",
      categories: ["classic"],
      heat: 2,
      session_length: "30",
      question_limit: 30,
      allow_self: true,
      chat_enabled: true,
      expires_at: expiresIso(),
    }).select("*").single();
    if (roomError) {
      if (roomError.code === "23505") continue;
      throw new ApiError("Could not create the room.", 500, "CREATE_ROOM_FAILED");
    }
    const { data: player, error: playerError } = await db.from("players").insert({
      room_id: room.id,
      name,
      name_key: name.toLocaleLowerCase(),
      color: COLORS[0],
      initial: name.slice(0, 1).toUpperCase(),
      session_token_hash: hash,
      is_host: true,
      join_order: 1,
    }).select("*").single();
    if (playerError || !player) {
      await db.from("rooms").delete().eq("id", room.id);
      throw new ApiError("Could not create the host player.", 500, "CREATE_HOST_FAILED");
    }
    const { error: hostError } = await db.from("rooms").update({ host_player_id: player.id }).eq("id", room.id);
    if (hostError) {
      await db.from("rooms").delete().eq("id", room.id);
      throw new ApiError("Could not finish creating the room.", 500, "CREATE_ROOM_FAILED");
    }
    return { code, playerId: player.id, token, name };
  }
  throw new ApiError("Could not generate a room code. Try again.", 503, "ROOM_CODE_RETRY");
}

async function joinRoom(codeInput: unknown, nameInput: unknown) {
  const code = cleanCode(codeInput);
  const name = cleanName(nameInput);
  const { data: room } = await db.from("rooms").select("*").eq("code", code).maybeSingle();
  if (!room) throw new ApiError("Room not found or expired.", 404, "ROOM_NOT_FOUND");
  if (room.status !== "lobby") throw new ApiError("This game has already started.", 409, "GAME_ALREADY_STARTED");
  if (Date.parse(room.expires_at) < Date.now()) throw new ApiError("This room has expired.", 410, "ROOM_EXPIRED");

  const { data: players, error: playersError } = await db.from("players").select("id,name_key,join_order").eq("room_id", room.id).eq("kicked", false).order("join_order");
  if (playersError) throw new ApiError("Could not join this room.", 500, "JOIN_LOOKUP_FAILED");
  if ((players ?? []).length >= 15) throw new ApiError("This room is full (15 players max).", 409, "ROOM_FULL");
  const key = name.toLocaleLowerCase();
  if ((players ?? []).some((p) => p.name_key === key)) throw new ApiError("That name is already in this room.", 409, "DUPLICATE_NAME");

  const token = randomToken();
  const hash = await sha256(token);
  const usedSlots = new Set((players ?? []).map((p) => Number(p.join_order)));
  let joinOrder = 1;
  while (usedSlots.has(joinOrder) && joinOrder <= 15) joinOrder += 1;
  const { data: player, error } = await db.from("players").insert({
    room_id: room.id,
    name,
    name_key: key,
    color: COLORS[(joinOrder - 1) % COLORS.length],
    initial: name.slice(0, 1).toUpperCase(),
    session_token_hash: hash,
    is_host: false,
    join_order: joinOrder,
  }).select("*").single();
  if (error || !player) {
    if (error?.code === "23505") throw new ApiError("That name is already in this room.", 409, "DUPLICATE_NAME");
    throw new ApiError("Could not join this room.", 500, "JOIN_FAILED");
  }
  await touchRoom(room.id);
  await broadcast(code);
  return { code, playerId: player.id, token, name };
}

async function handleAuthenticated(body: Record<string, unknown>) {
  const ctx = await authenticate(body.code, body.token);
  const op = String(body.op ?? "state");

  if (op === "state") {
    return roomState(ctx);
  }

  if (op === "heartbeat") {
    await Promise.all([
      db.from("players").update({ last_seen_at: nowIso() }).eq("id", ctx.player.id),
      touchRoom(ctx.room.id),
    ]);
    return roomState(ctx);
  }

  if (op === "configure") {
    requireHost(ctx);
    if (ctx.room.status === "ended") throw new ApiError("This game has ended.", 409, "GAME_ENDED");
    const patch: Record<string, unknown> = {};
    if (body.categories !== undefined) patch.categories = validCategories(body.categories);
    if (body.heat !== undefined) patch.heat = Math.max(1, Math.min(5, Math.round(Number(body.heat) || 1)));
    if (body.chatEnabled !== undefined) patch.chat_enabled = Boolean(body.chatEnabled);
    if (ctx.room.status === "lobby") {
      if (body.sessionLength !== undefined) {
        const length = String(body.sessionLength);
        if (!SESSION_LENGTHS.has(length)) throw new ApiError("Invalid game length.");
        patch.session_length = length;
        patch.question_limit = questionLimit(length);
      }
      if (body.allowSelf !== undefined) patch.allow_self = Boolean(body.allowSelf);
    }
    patch.updated_at = nowIso();
    patch.last_activity_at = nowIso();
    patch.expires_at = expiresIso();
    const { error } = await db.from("rooms").update(patch).eq("id", ctx.room.id);
    if (error) throw new ApiError("Could not update room settings.", 500, "CONFIGURE_FAILED");
    await broadcast(ctx.code);
    return roomState(ctx);
  }

  if (op === "start") {
    requireHost(ctx);
    if (ctx.room.status !== "lobby") throw new ApiError("The game has already started.", 409, "GAME_ALREADY_STARTED");
    const { data: players } = await db.from("players").select("*").eq("room_id", ctx.room.id).eq("kicked", false).order("join_order");
    if ((players ?? []).length < 3) throw new ApiError("You need at least 3 players to start.", 409, "NOT_ENOUGH_PLAYERS");
    const question = pickQuestion({ categories: ctx.room.categories as GameCategory[], heat: Number(ctx.room.heat), usedIds: [] });
    if (!question) throw new ApiError("No questions are available for these settings.", 409, "NO_QUESTIONS");
    const first = players![Math.floor(Math.random() * players!.length)];
    const { error } = await db.from("rooms").update({
      status: "active",
      round_number: 1,
      current_turn_player_id: first.id,
      current_question: question,
      question_history: [question.id],
      updated_at: nowIso(),
      last_activity_at: nowIso(),
      expires_at: expiresIso(),
    }).eq("id", ctx.room.id);
    if (error) throw new ApiError("Could not start the game.", 500, "START_FAILED");
    await broadcast(ctx.code);
    return roomState(ctx);
  }

  if (op === "skip") {
    requireHost(ctx);
    if (ctx.room.status !== "active") throw new ApiError("The game is not active.", 409, "GAME_NOT_ACTIVE");
    const used = Array.isArray(ctx.room.question_history) ? ctx.room.question_history : [];
    const next = pickQuestion({ categories: ctx.room.categories as GameCategory[], heat: Number(ctx.room.heat), usedIds: used });
    if (!next) throw new ApiError("There are no unused questions left in this session.", 409, "QUESTION_POOL_EXHAUSTED");
    const { error } = await db.from("rooms").update({
      current_question: next,
      question_history: [...used, next.id],
      updated_at: nowIso(),
      last_activity_at: nowIso(),
      expires_at: expiresIso(),
    }).eq("id", ctx.room.id);
    if (error) throw new ApiError("Could not skip this question.", 500, "SKIP_FAILED");
    await broadcast(ctx.code);
    return roomState(ctx);
  }

  if (op === "choose") {
    if (ctx.room.status !== "active") throw new ApiError("The game is not active.", 409, "GAME_NOT_ACTIVE");
    if (ctx.room.current_turn_player_id !== ctx.player.id) throw new ApiError("It is not your turn yet.", 403, "NOT_YOUR_TURN");
    const targetId = typeof body.targetPlayerId === "string" ? body.targetPlayerId : "";
    const { data: players } = await db.from("players").select("*").eq("room_id", ctx.room.id).eq("kicked", false).order("join_order");
    const target = (players ?? []).find((p) => p.id === targetId);
    if (!target) throw new ApiError("Choose someone who is still in this room.", 400, "INVALID_TARGET");
    const question = ctx.room.current_question as Question | null;
    if (!question) throw new ApiError("The current question is unavailable.", 409, "QUESTION_MISSING");
    if (!ctx.room.allow_self && target.id === ctx.player.id) throw new ApiError("Self-picks are disabled for this room.", 409, "SELF_PICK_DISABLED");

    const { data: existing } = await db.from("choices").select("id").eq("room_id", ctx.room.id).eq("round_number", ctx.room.round_number).maybeSingle();
    if (existing) throw new ApiError("This turn was already submitted.", 409, "TURN_ALREADY_SUBMITTED");
    const { data: recent } = await db.from("choices").select("*").eq("room_id", ctx.room.id).order("round_number", { ascending: false }).limit(20);
    const turn = await chooseNextTurn(target.id, ctx.player.id, players ?? [], recent ?? []);

    const { data: inserted, error: choiceError } = await db.from("choices").insert({
      room_id: ctx.room.id,
      round_number: ctx.room.round_number,
      question_id: question.id,
      question_text: question.text,
      category: question.category,
      intensity: question.intensity,
      award_category: question.awardCategory,
      chooser_player_id: ctx.player.id,
      chosen_player_id: target.id,
      next_turn_player_id: turn.nextTurnPlayerId,
      turn_shuffled: turn.turnShuffled,
    }).select("*").single();
    if (choiceError || !inserted) {
      if (choiceError?.code === "23505") throw new ApiError("This turn was already submitted.", 409, "TURN_ALREADY_SUBMITTED");
      throw new ApiError("Could not submit this choice.", 500, "CHOICE_FAILED");
    }

    const { data: allChoices } = await db.from("choices").select("*").eq("room_id", ctx.room.id).order("round_number", { ascending: true });
    const hitLimit = ctx.room.question_limit !== null && Number(ctx.room.round_number) >= Number(ctx.room.question_limit);
    const used = Array.isArray(ctx.room.question_history) ? ctx.room.question_history : [];
    const nextQuestion = hitLimit ? null : pickQuestion({
      categories: ctx.room.categories as GameCategory[],
      heat: Number(ctx.room.heat),
      usedIds: used,
    });

    if (hitLimit || !nextQuestion) {
      const final = computeFinal(allChoices ?? [], players ?? []);
      const { error } = await db.from("rooms").update({
        status: "ended",
        current_question: null,
        current_turn_player_id: null,
        final_results: final,
        updated_at: nowIso(),
        last_activity_at: nowIso(),
        expires_at: expiresIso(),
      }).eq("id", ctx.room.id);
      if (error) throw new ApiError("Could not finish the game.", 500, "END_FAILED");
    } else {
      const { error } = await db.from("rooms").update({
        round_number: Number(ctx.room.round_number) + 1,
        current_turn_player_id: turn.nextTurnPlayerId,
        current_question: nextQuestion,
        question_history: [...used, nextQuestion.id],
        updated_at: nowIso(),
        last_activity_at: nowIso(),
        expires_at: expiresIso(),
      }).eq("id", ctx.room.id);
      if (error) throw new ApiError("Could not advance the turn.", 500, "ADVANCE_FAILED");
    }
    await broadcast(ctx.code);
    return roomState(ctx);
  }

  if (op === "end") {
    requireHost(ctx);
    if (ctx.room.status === "ended") return roomState(ctx);
    const [{ data: players }, { data: choices }] = await Promise.all([
      db.from("players").select("*").eq("room_id", ctx.room.id).eq("kicked", false).order("join_order"),
      db.from("choices").select("*").eq("room_id", ctx.room.id).order("round_number", { ascending: true }),
    ]);
    const final = computeFinal(choices ?? [], players ?? []);
    const { error } = await db.from("rooms").update({
      status: "ended",
      current_question: null,
      current_turn_player_id: null,
      final_results: final,
      updated_at: nowIso(),
      last_activity_at: nowIso(),
      expires_at: expiresIso(),
    }).eq("id", ctx.room.id);
    if (error) throw new ApiError("Could not end the game.", 500, "END_FAILED");
    await broadcast(ctx.code);
    return roomState(ctx);
  }

  if (op === "kick") {
    requireHost(ctx);
    if (ctx.room.status !== "lobby") throw new ApiError("Players can only be removed before the game starts.", 409, "LOBBY_ONLY");
    const targetId = typeof body.playerId === "string" ? body.playerId : "";
    if (!targetId || targetId === ctx.player.id) throw new ApiError("The host cannot remove themselves.", 400, "INVALID_TARGET");
    const { error } = await db.from("players").update({ kicked: true, last_seen_at: nowIso() }).eq("room_id", ctx.room.id).eq("id", targetId).eq("is_host", false);
    if (error) throw new ApiError("Could not remove that player.", 500, "KICK_FAILED");
    await broadcast(ctx.code);
    return roomState(ctx);
  }

  if (op === "chat_send") {
    if (!ctx.room.chat_enabled) throw new ApiError("Chat is disabled for this room.", 409, "CHAT_DISABLED");
    const bodyText = typeof body.body === "string" ? body.body.trim().replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 280) : "";
    if (!bodyText) throw new ApiError("Write a message first.");
    const { error } = await db.from("chat_messages").insert({
      room_id: ctx.room.id,
      player_id: ctx.player.id,
      body: bodyText,
    });
    if (error) throw new ApiError("Could not send that message.", 500, "CHAT_FAILED");
    await touchRoom(ctx.room.id);
    await broadcast(ctx.code);
    return { sent: true };
  }

  if (op === "reaction") {
    const emoji = typeof body.emoji === "string" ? body.emoji : "";
    if (!REACTIONS.has(emoji)) throw new ApiError("That reaction is not available.");
    await broadcast(ctx.code, "reaction", {
      id: crypto.randomUUID(),
      emoji,
      playerId: ctx.player.id,
      playerName: ctx.player.name,
      at: Date.now(),
    });
    return { sent: true };
  }

  throw new ApiError("Unknown game action.", 400, "UNKNOWN_ACTION");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return response({ ok: false, error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const op = String(body.op ?? "");
    if (op === "create") return ok(await createRoom(body.name));
    if (op === "join") return ok(await joinRoom(body.code, body.name));
    return ok(await handleAuthenticated(body));
  } catch (error) {
    if (error instanceof ApiError) {
      return response({ ok: false, error: error.message, code: error.code }, error.status);
    }
    console.error("pass_the_phone-game-api", error);
    return response({ ok: false, error: "Something went wrong. Try again.", code: "INTERNAL_ERROR" }, 500);
  }
});
