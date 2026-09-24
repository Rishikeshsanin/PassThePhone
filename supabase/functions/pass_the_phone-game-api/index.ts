import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { pickQuestion, validCategories, type GameCategory, type Question } from "./questions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_DB_URL) {
  throw new Error("Supabase runtime credentials are unavailable.");
}

// Direct Postgres is intentional: PassThePhone stays in its private Project Hub
// schema and does not need that schema added to the project-wide Data API.
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
const COLORS = [
  "#8b5cf6", "#ec4899", "#06b6d4", "#22c55e", "#f59e0b",
  "#ef4444", "#14b8a6", "#3b82f6", "#a855f7", "#f97316",
  "#84cc16", "#e11d48", "#0ea5e9", "#6366f1", "#d946ef",
];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REACTIONS = new Set(["😂", "❤️", "💀", "😭", "🔥", "👀", "🤡", "👏", "😮", "🙌"]);
const SESSION_LENGTHS = new Set(["20", "30", "40", "unlimited"]);

type DbRoom = Record<string, any>;
type DbPlayer = Record<string, any>;
type DbChoice = Record<string, any>;
type Context = { code: string; room: DbRoom; player: DbPlayer };

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
function ok(data: unknown) { return response({ ok: true, data }); }
function nowIso() { return new Date().toISOString(); }
function asIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : String(value ?? "");
}
function randomCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => CODE_CHARS[value % CODE_CHARS.length]).join("");
}
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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
function dbCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
}

async function touchRoom(roomId: string) {
  await sql`
    update pass_the_phone.rooms
    set last_activity_at = now(), updated_at = now(), expires_at = now() + interval '6 hours'
    where id = ${roomId}::uuid
  `;
}

async function broadcast(code: string, event = "state_changed", payload: Record<string, unknown> = {}) {
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
    await channel.send({ type: "broadcast", event, payload });
    await realtime.removeChannel(channel);
  } catch {
    // Every client also polls, so broadcast is a latency optimization, not a dependency.
  }
}

async function authenticate(codeInput: unknown, tokenInput: unknown): Promise<Context> {
  const code = cleanCode(codeInput);
  if (typeof tokenInput !== "string" || tokenInput.length < 20) {
    throw new ApiError("This room session is missing. Rejoin the room.", 401, "SESSION_REQUIRED");
  }
  const roomRows = await sql<DbRoom[]>`select * from pass_the_phone.rooms where code = ${code} limit 1`;
  const room = roomRows[0];
  if (!room) throw new ApiError("Room not found or expired.", 404, "ROOM_NOT_FOUND");
  if (Date.parse(asIso(room.expires_at)) < Date.now()) throw new ApiError("This room has expired.", 410, "ROOM_EXPIRED");
  const hash = await sha256(tokenInput);
  const playerRows = await sql<DbPlayer[]>`
    select * from pass_the_phone.players
    where room_id = ${room.id}::uuid and session_token_hash = ${hash} and kicked = false limit 1
  `;
  const player = playerRows[0];
  if (!player) throw new ApiError("Your room session is no longer valid.", 401, "SESSION_INVALID");
  return { code, room, player };
}

function publicPlayer(player: DbPlayer) {
  const seen = Date.parse(asIso(player.last_seen_at));
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
    createdAt: asIso(choice.created_at),
  };
}

async function roomState(ctx: Context) {
  const roomRows = await sql<DbRoom[]>`select * from pass_the_phone.rooms where id = ${ctx.room.id}::uuid limit 1`;
  const room = roomRows[0];
  if (!room) throw new ApiError("Room not found.", 404, "ROOM_NOT_FOUND");
  const players = await sql<DbPlayer[]>`select * from pass_the_phone.players where room_id = ${room.id}::uuid and kicked = false order by join_order`;
  const choices = await sql<DbChoice[]>`select * from pass_the_phone.choices where room_id = ${room.id}::uuid order by round_number asc`;
  const messages = await sql<Record<string, any>[]>`
    select id, player_id, body, created_at from (
      select id, player_id, body, created_at from pass_the_phone.chat_messages
      where room_id = ${room.id}::uuid order by created_at desc limit 100
    ) recent order by created_at asc
  `;
  const me = players.find((player) => player.id === ctx.player.id) ?? ctx.player;
  return {
    room: {
      code: room.code,
      status: room.status,
      categories: room.categories,
      heat: Number(room.heat),
      sessionLength: room.session_length,
      questionLimit: room.question_limit === null ? null : Number(room.question_limit),
      allowSelf: Boolean(room.allow_self),
      chatEnabled: Boolean(room.chat_enabled),
      roundNumber: Number(room.round_number),
      currentTurnPlayerId: room.current_turn_player_id,
      currentQuestion: room.current_question,
      questionHistoryCount: Array.isArray(room.question_history) ? room.question_history.length : 0,
      createdAt: asIso(room.created_at),
    },
    me: publicPlayer(me),
    players: players.map(publicPlayer),
    choices: choices.map(publicChoice),
    messages: messages.map((message) => ({ id: message.id, playerId: message.player_id, body: message.body, createdAt: asIso(message.created_at) })),
    final: room.final_results ?? null,
    serverTime: nowIso(),
  };
}

function requireHost(ctx: Context) {
  if (!ctx.player.is_host || ctx.room.host_player_id !== ctx.player.id) throw new ApiError("Only the host can do that.", 403, "HOST_ONLY");
}
function questionLimit(length: string) { return length === "unlimited" ? null : Number(length); }
function awardTitle(category: string) {
  const titles: Record<string, string> = {
    support: "The Motivator", success: "Future CEO", romance: "Rom-Com Lead", survival: "Last One Standing",
    trust: "The Vault", humour: "Comedy Department", responsibility: "The Responsible One", leadership: "Group Captain",
    adventure: "Adventure Magnet", "main-character": "Main Character", chaos: "Chaos Magnet", predictable: "Most Predictable",
    social: "Social Butterfly", loyalty: "The Real One", care: "Heart of the Group", mystery: "Wild Card",
    overthinker: "Professional Overthinker", hero: "Hero Energy",
  };
  return titles[category] ?? category.replaceAll("-", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function computeFinal(choices: DbChoice[], players: DbPlayer[]) {
  const nameById = new Map(players.map((player) => [player.id, player.name]));
  const selected = new Map<string, number>();
  const hot = new Map<string, number>();
  const categories = new Map<string, Map<string, number>>();
  const pairs = new Map<string, number>();
  for (const choice of choices) {
    selected.set(choice.chosen_player_id, (selected.get(choice.chosen_player_id) ?? 0) + 1);
    if (Number(choice.intensity) >= 4) hot.set(choice.chosen_player_id, (hot.get(choice.chosen_player_id) ?? 0) + 1);
    if (choice.award_category) {
      const map = categories.get(choice.award_category) ?? new Map<string, number>();
      map.set(choice.chosen_player_id, (map.get(choice.chosen_player_id) ?? 0) + 1);
      categories.set(choice.award_category, map);
    }
    const [a, b] = [choice.chooser_player_id, choice.chosen_player_id].sort();
    const key = `${a}::${b}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  const top = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const most = top(selected);
  const heat = top(hot);
  const pair = top(pairs);
  const awardWinners = [...categories.entries()].flatMap(([category, map]) => {
    const winner = top(map);
    return winner ? [{ category, title: awardTitle(category), playerId: winner[0], playerName: nameById.get(winner[0]) ?? "Player", count: winner[1] }] : [];
  }).sort((a, b) => b.count - a.count).slice(0, 7);
  const mostChosen = most ? { playerId: most[0], playerName: nameById.get(most[0]) ?? "Player", count: most[1] } : null;
  const heatSurvivor = heat ? { playerId: heat[0], playerName: nameById.get(heat[0]) ?? "Player", count: heat[1] } : null;
  const strongestChain = pair ? (() => {
    const [from, to] = pair[0].split("::");
    return { from, fromName: nameById.get(from) ?? "Player", to, toName: nameById.get(to) ?? "Player", count: pair[1] };
  })() : null;
  const receipts: string[] = [];
  if (mostChosen) receipts.push(`${mostChosen.playerName} was picked ${mostChosen.count} time${mostChosen.count === 1 ? "" : "s"} — certified main-character energy.`);
  if (strongestChain && strongestChain.count >= 2) receipts.push(`${strongestChain.fromName} ↔ ${strongestChain.toName} formed the strongest chain with ${strongestChain.count} picks between them.`);
  if (heatSurvivor) receipts.push(`${heatSurvivor.playerName} took ${heatSurvivor.count} pick${heatSurvivor.count === 1 ? "" : "s"} at Heat 4–5.`);
  for (const award of awardWinners.slice(0, 3)) receipts.push(`${award.playerName} owned the “${award.title}” category with ${award.count} pick${award.count === 1 ? "" : "s"}.`);
  return { questionCount: choices.length, mostChosen, heatSurvivor, strongestChain, awardWinners, receipts: receipts.slice(0, 6) };
}

function chooseNextTurn(chosenId: string, chooserId: string, players: DbPlayer[], recent: DbChoice[]) {
  let nextTurnPlayerId = chosenId;
  let turnShuffled = false;
  if (players.length >= 4 && recent.length >= 3) {
    const [a, b, c] = recent;
    const pingPong = a.chooser_player_id === chosenId && a.chosen_player_id === chooserId && b.chooser_player_id === chooserId && b.chosen_player_id === chosenId && c.chooser_player_id === chosenId && c.chosen_player_id === chooserId;
    if (pingPong) {
      const counts = new Map(players.map((player) => [player.id, 0]));
      for (const choice of recent) counts.set(choice.chooser_player_id, (counts.get(choice.chooser_player_id) ?? 0) + 1);
      const candidates = players.filter((player) => player.id !== chooserId && player.id !== chosenId);
      if (candidates.length) {
        const minimum = Math.min(...candidates.map((player) => counts.get(player.id) ?? 0));
        const leastUsed = candidates.filter((player) => (counts.get(player.id) ?? 0) === minimum);
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
    try {
      const created = await sql.begin(async (tx) => {
        const roomRows = await tx<DbRoom[]>`
          insert into pass_the_phone.rooms (code, status, categories, heat, session_length, question_limit, allow_self, chat_enabled, expires_at)
          values (${code}, 'lobby', array['classic']::text[], 2, '30', 30, true, true, now() + interval '6 hours') returning *
        `;
        const room = roomRows[0];
        const playerRows = await tx<DbPlayer[]>`
          insert into pass_the_phone.players (room_id, name, name_key, color, initial, session_token_hash, is_host, join_order)
          values (${room.id}::uuid, ${name}, ${name.toLocaleLowerCase()}, ${COLORS[0]}, ${name.slice(0, 1).toUpperCase()}, ${hash}, true, 1) returning *
        `;
        const player = playerRows[0];
        await tx`update pass_the_phone.rooms set host_player_id = ${player.id}::uuid where id = ${room.id}::uuid`;
        return { player };
      });
      return { code, playerId: created.player.id, token, name };
    } catch (error) {
      if (dbCode(error) === "23505") continue;
      console.error("createRoom", error);
      throw new ApiError("Could not create the room.", 500, "CREATE_ROOM_FAILED");
    }
  }
  throw new ApiError("Could not generate a room code. Try again.", 503, "ROOM_CODE_RETRY");
}

async function joinRoom(codeInput: unknown, nameInput: unknown) {
  const code = cleanCode(codeInput);
  const name = cleanName(nameInput);
  const token = randomToken();
  const hash = await sha256(token);
  try {
    const player = await sql.begin(async (tx) => {
      const roomRows = await tx<DbRoom[]>`select * from pass_the_phone.rooms where code = ${code} for update`;
      const room = roomRows[0];
      if (!room) throw new ApiError("Room not found or expired.", 404, "ROOM_NOT_FOUND");
      if (room.status !== "lobby") throw new ApiError("This game has already started.", 409, "GAME_ALREADY_STARTED");
      if (Date.parse(asIso(room.expires_at)) < Date.now()) throw new ApiError("This room has expired.", 410, "ROOM_EXPIRED");
      const players = await tx<DbPlayer[]>`select id, name_key, join_order from pass_the_phone.players where room_id = ${room.id}::uuid and kicked = false order by join_order`;
      if (players.length >= 15) throw new ApiError("This room is full (15 players max).", 409, "ROOM_FULL");
      const key = name.toLocaleLowerCase();
      if (players.some((item) => item.name_key === key)) throw new ApiError("That name is already in this room.", 409, "DUPLICATE_NAME");
      const used = new Set(players.map((item) => Number(item.join_order)));
      let joinOrder = 1;
      while (used.has(joinOrder) && joinOrder <= 15) joinOrder += 1;
      const rows = await tx<DbPlayer[]>`
        insert into pass_the_phone.players (room_id, name, name_key, color, initial, session_token_hash, is_host, join_order)
        values (${room.id}::uuid, ${name}, ${key}, ${COLORS[(joinOrder - 1) % COLORS.length]}, ${name.slice(0, 1).toUpperCase()}, ${hash}, false, ${joinOrder}) returning *
      `;
      await tx`update pass_the_phone.rooms set last_activity_at = now(), updated_at = now(), expires_at = now() + interval '6 hours' where id = ${room.id}::uuid`;
      return rows[0];
    });
    await broadcast(code);
    return { code, playerId: player.id, token, name };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (dbCode(error) === "23505") throw new ApiError("That name is already in this room.", 409, "DUPLICATE_NAME");
    console.error("joinRoom", error);
    throw new ApiError("Could not join this room.", 500, "JOIN_FAILED");
  }
}

async function handleAuthenticated(body: Record<string, unknown>) {
  const ctx = await authenticate(body.code, body.token);
  const op = String(body.op ?? "state");
  if (op === "state") return roomState(ctx);
  if (op === "heartbeat") {
    await sql`update pass_the_phone.players set last_seen_at = now() where id = ${ctx.player.id}::uuid`;
    await touchRoom(ctx.room.id);
    return roomState(ctx);
  }
  if (op === "configure") {
    requireHost(ctx);
    if (ctx.room.status === "ended") throw new ApiError("This game has ended.", 409, "GAME_ENDED");
    const categories = body.categories === undefined ? ctx.room.categories : validCategories(body.categories);
    const heat = body.heat === undefined ? Number(ctx.room.heat) : Math.max(1, Math.min(5, Math.round(Number(body.heat) || 1)));
    const chatEnabled = body.chatEnabled === undefined ? Boolean(ctx.room.chat_enabled) : Boolean(body.chatEnabled);
    let length = String(ctx.room.session_length);
    let limit = ctx.room.question_limit === null ? null : Number(ctx.room.question_limit);
    let allowSelf = Boolean(ctx.room.allow_self);
    if (ctx.room.status === "lobby") {
      if (body.sessionLength !== undefined) {
        length = String(body.sessionLength);
        if (!SESSION_LENGTHS.has(length)) throw new ApiError("Invalid game length.");
        limit = questionLimit(length);
      }
      if (body.allowSelf !== undefined) allowSelf = Boolean(body.allowSelf);
    }
    await sql`
      update pass_the_phone.rooms set categories = string_to_array(${categories.join(",")}, ','), heat = ${heat},
        session_length = ${length}, question_limit = ${limit}, allow_self = ${allowSelf}, chat_enabled = ${chatEnabled},
        updated_at = now(), last_activity_at = now(), expires_at = now() + interval '6 hours'
      where id = ${ctx.room.id}::uuid
    `;
    await broadcast(ctx.code);
    return roomState(ctx);
  }
  if (op === "start") {
    requireHost(ctx);
    await sql.begin(async (tx) => {
      const roomRows = await tx<DbRoom[]>`select * from pass_the_phone.rooms where id = ${ctx.room.id}::uuid for update`;
      const room = roomRows[0];
      if (!room || room.status !== "lobby") throw new ApiError("The game has already started.", 409, "GAME_ALREADY_STARTED");
      const players = await tx<DbPlayer[]>`select * from pass_the_phone.players where room_id = ${room.id}::uuid and kicked = false order by join_order`;
      if (players.length < 3) throw new ApiError("You need at least 3 players to start.", 409, "NOT_ENOUGH_PLAYERS");
      const question = pickQuestion({ categories: room.categories as GameCategory[], heat: Number(room.heat), usedIds: [] });
      if (!question) throw new ApiError("No questions are available for these settings.", 409, "NO_QUESTIONS");
      const first = players[Math.floor(Math.random() * players.length)];
      await tx`
        update pass_the_phone.rooms set status = 'active', round_number = 1, current_turn_player_id = ${first.id}::uuid,
          current_question = ${JSON.stringify(question)}::jsonb, question_history = array[${question.id}]::text[],
          updated_at = now(), last_activity_at = now(), expires_at = now() + interval '6 hours'
        where id = ${room.id}::uuid
      `;
    });
    await broadcast(ctx.code);
    return roomState(ctx);
  }
  if (op === "skip") {
    requireHost(ctx);
    await sql.begin(async (tx) => {
      const roomRows = await tx<DbRoom[]>`select * from pass_the_phone.rooms where id = ${ctx.room.id}::uuid for update`;
      const room = roomRows[0];
      if (!room || room.status !== "active") throw new ApiError("The game is not active.", 409, "GAME_NOT_ACTIVE");
      const used = Array.isArray(room.question_history) ? room.question_history : [];
      const next = pickQuestion({ categories: room.categories as GameCategory[], heat: Number(room.heat), usedIds: used });
      if (!next) throw new ApiError("There are no unused questions left in this session.", 409, "QUESTION_POOL_EXHAUSTED");
      await tx`
        update pass_the_phone.rooms set current_question = ${JSON.stringify(next)}::jsonb,
          question_history = array_append(question_history, ${next.id}), updated_at = now(), last_activity_at = now(), expires_at = now() + interval '6 hours'
        where id = ${room.id}::uuid
      `;
    });
    await broadcast(ctx.code);
    return roomState(ctx);
  }
  if (op === "choose") {
    await sql.begin(async (tx) => {
      const roomRows = await tx<DbRoom[]>`select * from pass_the_phone.rooms where id = ${ctx.room.id}::uuid for update`;
      const room = roomRows[0];
      if (!room || room.status !== "active") throw new ApiError("The game is not active.", 409, "GAME_NOT_ACTIVE");
      if (room.current_turn_player_id !== ctx.player.id) throw new ApiError("It is not your turn yet.", 403, "NOT_YOUR_TURN");
      const targetId = typeof body.targetPlayerId === "string" ? body.targetPlayerId : "";
      const players = await tx<DbPlayer[]>`select * from pass_the_phone.players where room_id = ${room.id}::uuid and kicked = false order by join_order`;
      const target = players.find((player) => player.id === targetId);
      if (!target) throw new ApiError("Choose someone who is still in this room.", 400, "INVALID_TARGET");
      if (!room.allow_self && target.id === ctx.player.id) throw new ApiError("Self-picks are disabled for this room.", 409, "SELF_PICK_DISABLED");
      const question = room.current_question as Question | null;
      if (!question) throw new ApiError("The current question is unavailable.", 409, "QUESTION_MISSING");
      const recent = await tx<DbChoice[]>`select * from pass_the_phone.choices where room_id = ${room.id}::uuid order by round_number desc limit 20`;
      const turn = chooseNextTurn(target.id, ctx.player.id, players, recent);
      try {
        await tx`
          insert into pass_the_phone.choices (room_id, round_number, question_id, question_text, category, intensity, award_category,
            chooser_player_id, chosen_player_id, next_turn_player_id, turn_shuffled)
          values (${room.id}::uuid, ${Number(room.round_number)}, ${question.id}, ${question.text}, ${question.category}, ${question.intensity},
            ${question.awardCategory}, ${ctx.player.id}::uuid, ${target.id}::uuid, ${turn.nextTurnPlayerId}::uuid, ${turn.turnShuffled})
        `;
      } catch (error) {
        if (dbCode(error) === "23505") throw new ApiError("This turn was already submitted.", 409, "TURN_ALREADY_SUBMITTED");
        throw error;
      }
      const allChoices = await tx<DbChoice[]>`select * from pass_the_phone.choices where room_id = ${room.id}::uuid order by round_number asc`;
      const hitLimit = room.question_limit !== null && Number(room.round_number) >= Number(room.question_limit);
      const used = Array.isArray(room.question_history) ? room.question_history : [];
      const nextQuestion = hitLimit ? null : pickQuestion({ categories: room.categories as GameCategory[], heat: Number(room.heat), usedIds: used });
      if (hitLimit || !nextQuestion) {
        const final = computeFinal(allChoices, players);
        await tx`
          update pass_the_phone.rooms set status = 'ended', current_question = null, current_turn_player_id = null,
            final_results = ${JSON.stringify(final)}::jsonb, updated_at = now(), last_activity_at = now(), expires_at = now() + interval '6 hours'
          where id = ${room.id}::uuid
        `;
      } else {
        await tx`
          update pass_the_phone.rooms set round_number = ${Number(room.round_number) + 1}, current_turn_player_id = ${turn.nextTurnPlayerId}::uuid,
            current_question = ${JSON.stringify(nextQuestion)}::jsonb, question_history = array_append(question_history, ${nextQuestion.id}),
            updated_at = now(), last_activity_at = now(), expires_at = now() + interval '6 hours'
          where id = ${room.id}::uuid
        `;
      }
    });
    await broadcast(ctx.code);
    return roomState(ctx);
  }
  if (op === "end") {
    requireHost(ctx);
    await sql.begin(async (tx) => {
      const roomRows = await tx<DbRoom[]>`select * from pass_the_phone.rooms where id = ${ctx.room.id}::uuid for update`;
      const room = roomRows[0];
      if (!room || room.status === "ended") return;
      const players = await tx<DbPlayer[]>`select * from pass_the_phone.players where room_id = ${room.id}::uuid and kicked = false order by join_order`;
      const choices = await tx<DbChoice[]>`select * from pass_the_phone.choices where room_id = ${room.id}::uuid order by round_number asc`;
      const final = computeFinal(choices, players);
      await tx`
        update pass_the_phone.rooms set status = 'ended', current_question = null, current_turn_player_id = null,
          final_results = ${JSON.stringify(final)}::jsonb, updated_at = now(), last_activity_at = now(), expires_at = now() + interval '6 hours'
        where id = ${room.id}::uuid
      `;
    });
    await broadcast(ctx.code);
    return roomState(ctx);
  }
  if (op === "kick") {
    requireHost(ctx);
    if (ctx.room.status !== "lobby") throw new ApiError("Players can only be removed before the game starts.", 409, "LOBBY_ONLY");
    const targetId = typeof body.playerId === "string" ? body.playerId : "";
    if (!targetId || targetId === ctx.player.id) throw new ApiError("The host cannot remove themselves.", 400, "INVALID_TARGET");
    await sql`update pass_the_phone.players set kicked = true, last_seen_at = now() where room_id = ${ctx.room.id}::uuid and id = ${targetId}::uuid and is_host = false`;
    await touchRoom(ctx.room.id);
    await broadcast(ctx.code);
    return roomState(ctx);
  }
  if (op === "chat_send") {
    if (!ctx.room.chat_enabled) throw new ApiError("Chat is disabled for this room.", 409, "CHAT_DISABLED");
    const text = typeof body.body === "string" ? body.body.trim().replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 280) : "";
    if (!text) throw new ApiError("Write a message first.");
    await sql`insert into pass_the_phone.chat_messages (room_id, player_id, body) values (${ctx.room.id}::uuid, ${ctx.player.id}::uuid, ${text})`;
    await touchRoom(ctx.room.id);
    await broadcast(ctx.code);
    return { sent: true };
  }
  if (op === "reaction") {
    const emoji = typeof body.emoji === "string" ? body.emoji : "";
    if (!REACTIONS.has(emoji)) throw new ApiError("That reaction is not available.");
    await broadcast(ctx.code, "reaction", { id: crypto.randomUUID(), emoji, playerId: ctx.player.id, playerName: ctx.player.name, at: Date.now() });
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
    if (error instanceof ApiError) return response({ ok: false, error: error.message, code: error.code }, error.status);
    console.error("pass_the_phone-game-api", error);
    return response({ ok: false, error: "Something went wrong. Try again.", code: "INTERNAL_ERROR" }, 500);
  }
});
