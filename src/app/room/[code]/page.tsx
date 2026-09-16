"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Loader2, Settings2, SkipForward, Users, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/logo";
import { CategoryChip } from "@/components/category-chip";
import { HeatControl } from "@/components/heat-control";
import { PlayerAvatar } from "@/components/player-avatar";
import { ChatDrawer } from "@/components/chat-drawer";
import { ensureAnonymousSession, getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { pickNextQuestion, sessionQuestionLimit } from "@/lib/question-engine";
import { computeAwards } from "@/lib/stats";
import type { Choice, GameCategory, Player, Room, SessionLength } from "@/types/game";

const categories: GameCategory[] = ["classic", "funny", "wholesome", "personal", "dark", "adult", "fantasy", "popular"];

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [me, setMe] = useState<Player | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revealChoice, setRevealChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (roomCode: string) => {
    if (!isSupabaseConfigured()) { setError("Realtime backend is not connected yet."); setLoading(false); return; }
    try {
      const user = await ensureAnonymousSession();
      const supabase = getSupabase();
      const { data: roomData, error: roomError } = await supabase.from("rooms").select("*").eq("code", roomCode).single();
      if (roomError || !roomData) throw new Error("Room not found or expired.");
      const [{ data: playerData }, { data: choiceData }] = await Promise.all([
        supabase.from("players").select("*").eq("room_id", roomData.id).order("join_order"),
        supabase.from("choices").select("*").eq("room_id", roomData.id).order("round_number"),
      ]);
      const list = (playerData ?? []) as Player[];
      setRoom(roomData as Room); setPlayers(list); setChoices((choiceData ?? []) as Choice[]);
      setMe(list.find((p) => p.user_id === user.id) ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load room."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { params.then(({ code: c }) => { const value = c.toUpperCase(); setCode(value); load(value); }); }, [params, load]);

  useEffect(() => {
    if (!room) return;
    const supabase = getSupabase();
    const channel = supabase.channel(`room:${room.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, (payload) => setRoom(payload.new as Room))
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` }, async () => {
        const { data } = await supabase.from("players").select("*").eq("room_id", room.id).order("join_order"); setPlayers((data ?? []) as Player[]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "choices", filter: `room_id=eq.${room.id}` }, (payload) => {
        const choice = payload.new as Choice;
        setChoices((prev) => [...prev, choice]);
        setRevealChoice(choice);
        window.setTimeout(() => setRevealChoice((current) => current?.id === choice.id ? null : current), 2800);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room?.id]);

  const isHost = Boolean(room && me && room.host_user_id === me.user_id);
  const activePlayer = players.find((p) => p.id === room?.current_turn_player_id) ?? null;
  const isMyTurn = Boolean(room?.status === "active" && me && room.current_turn_player_id === me.id);
  const maxReached = room?.question_limit ? room.round_number >= room.question_limit : false;

  async function updateRoom(patch: Partial<Room>) {
    if (!room) return;
    const { error } = await getSupabase().from("rooms").update(patch).eq("id", room.id);
    if (error) throw error;
  }

  function nextQuestion(override?: Partial<Pick<Room, "categories" | "heat">>) {
    if (!room) return null;
    return pickNextQuestion({
      categories: override?.categories ?? room.categories,
      heat: override?.heat ?? room.heat,
      usedIds: room.question_history ?? [],
    });
  }

  async function startGame() {
    if (!room || !isHost || players.length < 3) return;
    const question = nextQuestion(); if (!question) return;
    const first = players[Math.floor(Math.random() * players.length)];
    await updateRoom({ status: "active", round_number: 1, current_turn_player_id: first.id, current_question: question, question_history: [question.id] });
  }

  async function choose(player: Player) {
    if (!room || !me || !isMyTurn || !room.current_question || busy) return;
    if (!room.current_question.allowSelf && player.id === me.id) return;
    setBusy(true);
    try {
      const next = pickNextQuestion({ categories: room.categories, heat: room.heat, usedIds: room.question_history ?? [] });
      const supabase = getSupabase();
      const { error } = await supabase.rpc("make_choice", {
        p_room_id: room.id,
        p_chosen_player_id: player.id,
        p_next_question: next,
      });
      if (error) throw error;
    } catch (err) { setError(err instanceof Error ? err.message : "Could not lock choice."); }
    finally { setBusy(false); }
  }

  async function setHeat(value: number) { if (!room || !isHost) return; await updateRoom({ heat: value as Room["heat"] }); }
  async function toggleCategory(category: GameCategory) {
    if (!room || !isHost) return;
    const exists = room.categories.includes(category);
    const updated = exists ? room.categories.filter((c) => c !== category) : [...room.categories, category];
    if (!updated.length) return;
    await updateRoom({ categories: updated });
  }
  async function setLength(length: SessionLength) {
    if (!room || !isHost) return;
    await updateRoom({ session_length: length, question_limit: sessionQuestionLimit(length) });
  }
  async function skipQuestion() {
    if (!room || !isHost || room.status !== "active") return;
    const q = nextQuestion(); if (!q) return;
    await updateRoom({ current_question: q, question_history: [...(room.question_history ?? []), q.id] });
  }
  async function endGame() { if (!room || !isHost) return; await updateRoom({ status: "ended" }); }

  const awards = useMemo(() => computeAwards(choices), [choices]);
  const playerById = (id?: string) => players.find((p) => p.id === id);
  const revealChooser = playerById(revealChoice?.chooser_player_id);
  const revealChosen = playerById(revealChoice?.chosen_player_id);

  if (loading) return <main className="grid min-h-screen place-items-center"><Loader2 className="animate-spin text-violet-300" /></main>;
  if (error && !room) return <main className="grid min-h-screen place-items-center p-6"><div className="glass max-w-md rounded-3xl p-6 text-center"><div className="text-2xl font-black">Couldn&apos;t open this room</div><p className="mt-3 text-sm text-white/50">{error}</p><a href="/" className="btn btn-primary mt-6 w-full">Back home</a></div></main>;
  if (!room || !me) return <main className="grid min-h-screen place-items-center p-6"><div className="glass max-w-md rounded-3xl p-6 text-center"><div className="text-xl font-black">You&apos;re not in this room.</div><a href={`/join/${code}`} className="btn btn-primary mt-6 w-full">Join room</a></div></main>;

  if (room.status === "ended") {
    return (
      <main className="app-shell"><div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between"><Logo /><div className="rounded-full border border-white/10 bg-white/[.03] px-3 py-2 text-xs text-white/50">{choices.length} choices</div></div>
        <section className="mt-10 text-center"><div className="kicker">The night&apos;s receipts</div><h1 className="mt-4 text-4xl font-black tracking-[-.05em] sm:text-6xl">The group has spoken.</h1><p className="mx-auto mt-4 max-w-xl text-white/50">Built entirely from what happened in this room — no made-up stats.</p></section>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {awards.mostChosen && <Award title="Main character" value={playerById(awards.mostChosen.playerId)?.name ?? "—"} detail={`${awards.mostChosen.count} total picks`} emoji="👑" />}
          {awards.heatSurvivor && <Award title="Heat survivor" value={playerById(awards.heatSurvivor.playerId)?.name ?? "—"} detail={`${awards.heatSurvivor.count} picks at Heat 4–5`} emoji="🔥" />}
          {awards.strongestChain && <Award title="Strongest chain" value={`${playerById(awards.strongestChain.from)?.name ?? "—"} → ${playerById(awards.strongestChain.to)?.name ?? "—"}`} detail={`${awards.strongestChain.count} times`} emoji="🔗" />}
          {awards.categoryWinners.slice(0, 5).map((a) => <Award key={a.category} title={`${a.category} pick`} value={playerById(a.playerId)?.name ?? "—"} detail={`${a.count} selections`} emoji="🏆" />)}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3"><a href="/new" className="btn btn-primary">New room</a><a href="/" className="btn btn-secondary">Home</a></div>
      </div></main>
    );
  }

  return (
    <main className="app-shell">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:py-6">
        <header className="flex items-center justify-between gap-3"><Logo compact /><div className="flex items-center gap-2"><div className="hidden rounded-full border border-white/10 bg-white/[.03] px-3 py-2 text-xs text-white/55 sm:block">Room {code}</div>{room.chat_enabled && <ChatDrawer roomId={room.id} me={me} players={players} />}{isHost && <button className="btn btn-secondary !min-h-11 !px-3" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></button>}</div></header>

        {room.status === "lobby" ? (
          <Lobby room={room} players={players} isHost={isHost} onStart={startGame} onSettings={() => setSettingsOpen(true)} code={code} />
        ) : (
          <section className="mx-auto mt-8 max-w-3xl pb-14">
            <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-bold text-white/45"><span>QUESTION {room.round_number}</span><span>•</span><span>{players.length} PLAYERS</span></div><div className="rounded-full bg-orange-400/10 px-3 py-2 text-xs font-bold text-orange-200">{"🔥".repeat(room.heat)}<span className="ml-1 opacity-40">{"🔥".repeat(5-room.heat)}</span></div></div>
            <div className="glass rounded-[32px] p-5 sm:p-8">
              <div className="flex items-center gap-3">{activePlayer && <PlayerAvatar player={activePlayer} />}<div><div className="text-xs font-black uppercase tracking-[.15em] text-violet-300">{isMyTurn ? "Your turn" : `${activePlayer?.name ?? "Someone"} is choosing`}</div><div className="mt-1 text-sm text-white/45">{isMyTurn ? "Pick the person who fits best." : "Everyone sees the choice instantly."}</div></div></div>
              <h1 className="mt-7 text-3xl font-black leading-tight tracking-[-.04em] sm:text-5xl">{room.current_question?.text}</h1>
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {players.map((player) => {
                  const disabled = !isMyTurn || busy || (!room.current_question?.allowSelf && player.id === me.id);
                  return <button type="button" key={player.id} disabled={disabled} onClick={() => choose(player)} className="group rounded-2xl border border-white/10 bg-white/[.035] p-4 text-left transition hover:border-violet-400/35 hover:bg-violet-500/[.08] disabled:cursor-default disabled:opacity-45"><div className="flex items-center gap-3"><PlayerAvatar player={player} size={38} /><div className="min-w-0"><div className="truncate font-black">{player.name}</div><div className="text-[11px] text-white/35">Pick {player.id === me.id ? "yourself" : "them"}</div></div></div></button>;
                })}
              </div>
              {!isMyTurn && <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-center text-sm text-white/45">Waiting for <span className="font-bold text-white/80">{activePlayer?.name}</span>…</div>}
            </div>
            {isHost && <div className="mt-4 flex flex-wrap justify-between gap-2"><button className="btn btn-ghost !min-h-11" onClick={skipQuestion}><SkipForward size={17} /> Skip question</button><button className="btn btn-ghost !min-h-11 text-rose-200" onClick={endGame}>End game</button></div>}
            {maxReached && isHost && <div className="mt-4 rounded-2xl border border-violet-300/15 bg-violet-400/[.06] p-4 text-sm text-violet-100/75">You reached the selected {room.question_limit}-question session length. End now for receipts, or keep playing.</div>}
          </section>
        )}
      </div>

      {settingsOpen && <HostSettings room={room} onClose={() => setSettingsOpen(false)} onHeat={setHeat} onToggleCategory={toggleCategory} onLength={setLength} />}

      {revealChoice && revealChooser && revealChosen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#08080d]/95 p-5 backdrop-blur-xl">
          <div className="w-full max-w-lg text-center fade-up">
            <div className="kicker">Choice locked</div>
            <div className="mt-8 flex items-center justify-center gap-4 sm:gap-7"><PlayerAvatar player={revealChooser} size={72} /><div className="text-3xl font-black text-white/30">→</div><PlayerAvatar player={revealChosen} size={72} /></div>
            <div className="mt-7 text-3xl font-black tracking-[-.04em] sm:text-5xl"><span style={{ color: revealChooser.color }}>{revealChooser.name}</span> chose <span style={{ color: revealChosen.color }}>{revealChosen.name}</span></div>
            <div className="mx-auto mt-5 max-w-md text-sm leading-6 text-white/48">{revealChoice.question_text}</div>
            <div className="mt-8 text-sm font-bold text-violet-200">{revealChosen.name} gets the next turn.</div>
          </div>
        </div>
      )}
    </main>
  );
}

function Award({ title, value, detail, emoji }: { title: string; value: string; detail: string; emoji: string }) {
  return <div className="glass rounded-3xl p-5"><div className="text-2xl">{emoji}</div><div className="mt-4 text-xs font-black uppercase tracking-[.13em] text-white/40">{title}</div><div className="mt-2 text-2xl font-black">{value}</div><div className="mt-1 text-sm text-white/40">{detail}</div></div>;
}

function Lobby({ room, players, isHost, onStart, onSettings, code }: { room: Room; players: Player[]; isHost: boolean; onStart: () => void; onSettings: () => void; code: string }) {
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : "";
  return <section className="mx-auto mt-8 max-w-3xl pb-14"><div className="grid gap-4 md:grid-cols-[1fr_230px]"><div className="glass rounded-[30px] p-5 sm:p-7"><div className="kicker">Lobby</div><div className="mt-2 flex items-end justify-between gap-3"><div><h1 className="text-4xl font-black tracking-[-.05em]">Room {code}</h1><p className="mt-2 text-sm text-white/45">Share the code. Up to 15 friends can join.</p></div><div className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-white/60"><Users className="mr-1 inline" size={14} /> {players.length}/15</div></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{players.map((p) => <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"><PlayerAvatar player={p} /><div className="min-w-0 flex-1"><div className="truncate font-black">{p.name}</div><div className="text-xs text-white/35">{p.user_id === room.host_user_id ? "Host" : "Ready"}</div></div>{p.user_id === room.host_user_id && <Crown size={17} className="text-amber-300" />}</div>)}</div>{isHost ? <div className="mt-6 flex flex-col gap-2 sm:flex-row"><button className="btn btn-primary flex-1" disabled={players.length < 3} onClick={onStart}>Start game</button><button className="btn btn-secondary" onClick={onSettings}><Settings2 size={17} /> Game settings</button></div> : <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-center text-sm text-white/45">Waiting for the host to start…</div>}{players.length < 3 && isHost && <div className="mt-3 text-center text-xs text-white/35">Need at least 3 players.</div>}</div><div className="glass flex flex-col items-center justify-center rounded-[30px] p-5 text-center"><div className="rounded-2xl bg-white p-3">{joinUrl && <QRCodeSVG value={joinUrl} size={155} />}</div><div className="mt-4 text-sm font-black">Scan to join</div><div className="mt-1 text-xs text-white/40">or enter {code}</div></div></div></section>;
}

function HostSettings({ room, onClose, onHeat, onToggleCategory, onLength }: { room: Room; onClose: () => void; onHeat: (value: number) => void; onToggleCategory: (value: GameCategory) => void; onLength: (value: SessionLength) => void }) {
  return <div className="fixed inset-0 z-40 bg-black/65 p-3 backdrop-blur-sm" onClick={onClose}><section className="glass mx-auto mt-4 w-full max-w-2xl rounded-[30px] p-5 sm:p-7" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><div className="kicker">Host controls</div><h2 className="mt-2 text-2xl font-black">Shape the room.</h2></div><button className="btn btn-ghost !min-h-10 !w-10 !p-0" onClick={onClose}><X size={18} /></button></div><div className="mt-7 border-t border-white/10 pt-6"><div className="flex items-center justify-between gap-4"><div><div className="font-black">Heat</div><div className="mt-1 text-xs text-white/40">Higher heat means bolder questions inside the chosen categories.</div></div><HeatControl compact value={room.heat} onChange={onHeat} /></div></div><div className="mt-7 border-t border-white/10 pt-6"><div className="font-black">Categories</div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{categories.map((c) => <CategoryChip key={c} category={c} selected={room.categories.includes(c)} onClick={() => onToggleCategory(c)} />)}</div></div><div className="mt-7 border-t border-white/10 pt-6"><div className="font-black">Session length</div><div className="mt-3 grid grid-cols-4 gap-2">{(["20","30","40","unlimited"] as SessionLength[]).map((v) => <button key={String(v)} className={`rounded-2xl border px-3 py-3 text-sm font-black ${room.session_length === v ? "border-violet-400/60 bg-violet-500/15" : "border-white/10 bg-white/[.03] text-white/55"}`} onClick={() => onLength(v)}>{v === "unlimited" ? "∞" : v}{v === "30" && <span className="block text-[9px] font-bold text-white/35">POPULAR</span>}</button>)}</div></div><button className="btn btn-primary mt-7 w-full" onClick={onClose}>Done</button></section></div>;
}
