const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
}

const gameUrl = `${SUPABASE_URL}/functions/v1/pass_the_phone-game-api`;
const restartUrl = `${SUPABASE_URL}/functions/v1/pass_the_phone-restart-api`;

async function request(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: KEY,
      "x-client-info": "passthephone-ci-smoke",
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(`${body.op ?? "restart"}: ${json.error ?? response.statusText}`);
  }
  return json.data;
}

const stamp = Date.now().toString().slice(-7);
const host = await request(gameUrl, { op: "create", name: `CI Host ${stamp}` });
const a = await request(gameUrl, { op: "join", code: host.code, name: `CI A ${stamp}` });
const b = await request(gameUrl, { op: "join", code: host.code, name: `CI B ${stamp}` });

let state = await request(gameUrl, { op: "state", code: host.code, token: host.token });
if (state.players.length !== 3) throw new Error(`expected 3 players, got ${state.players.length}`);

state = await request(gameUrl, {
  op: "configure",
  code: host.code,
  token: host.token,
  sessionLength: "20",
  categories: ["classic", "funny"],
  heat: 3,
});
if (state.room.heat !== 3 || state.room.questionLimit !== 20) throw new Error("room configuration mismatch");

state = await request(gameUrl, { op: "start", code: host.code, token: host.token });
if (state.room.status !== "active" || !state.room.currentQuestion || state.room.roundNumber !== 1) {
  throw new Error("game did not start correctly");
}

const questionBeforeHeatChange = state.room.currentQuestion.id;
state = await request(gameUrl, {
  op: "configure",
  code: host.code,
  token: host.token,
  heat: 5,
});
if (state.room.status !== "active" || state.room.heat !== 5) throw new Error("mid-game heat increase failed");
if (state.room.currentQuestion?.id !== questionBeforeHeatChange) throw new Error("mid-game heat changed the current question");
if (state.room.roundNumber !== 1 || state.choices.length !== 0) throw new Error("mid-game heat change reset game progress");

const sessions = new Map([
  [host.playerId, host],
  [a.playerId, a],
  [b.playerId, b],
]);
const actor = sessions.get(state.room.currentTurnPlayerId);
if (!actor) throw new Error("current turn player session not found");
const target = state.players.find((player) => player.id !== actor.playerId);
if (!target) throw new Error("target player not found");

state = await request(gameUrl, {
  op: "choose",
  code: host.code,
  token: actor.token,
  targetPlayerId: target.id,
});
if (state.choices.length !== 1 || state.room.roundNumber !== 2) throw new Error("choice did not advance the round");
if (state.choices[0].chosenPlayerId !== target.id) throw new Error("choice target mismatch");
if (state.room.currentQuestion?.id === state.choices[0].questionId) throw new Error("question repeated immediately");
if (state.room.heat !== 5) throw new Error("heat increase was not preserved into the next round");

const questionBeforeCoolDown = state.room.currentQuestion?.id;
state = await request(gameUrl, {
  op: "configure",
  code: host.code,
  token: host.token,
  heat: 2,
});
if (state.room.heat !== 2) throw new Error("mid-game heat decrease failed");
if (state.room.currentQuestion?.id !== questionBeforeCoolDown) throw new Error("heat decrease changed the current question");
if (state.room.roundNumber !== 2 || state.choices.length !== 1) throw new Error("heat decrease lost existing game data");

await request(gameUrl, { op: "chat_send", code: host.code, token: a.token, body: "CI smoke message" });
state = await request(gameUrl, { op: "state", code: host.code, token: b.token });
if (!state.messages.some((message) => message.body === "CI smoke message")) throw new Error("chat message did not propagate");

state = await request(gameUrl, { op: "end", code: host.code, token: host.token });
if (state.room.status !== "ended" || !state.final || state.final.questionCount !== 1) throw new Error("final results were not generated");

state = await request(restartUrl, { code: host.code, token: host.token });
if (state.room.status !== "lobby" || state.choices.length !== 0 || state.final !== null) throw new Error("replay reset failed");

console.log(`PASS: room ${host.code} completed create/join/start/live-heat/choose/chat/end/replay smoke test`);
