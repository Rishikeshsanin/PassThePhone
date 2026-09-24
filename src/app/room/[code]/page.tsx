"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Crown,
  Flame,
  Home,
  Infinity as InfinityIcon,
  Loader2,
  Play,
  RotateCcw,
  Settings2,
  Share2,
  SkipForward,
  Sparkles,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/logo";
import { CategoryChip } from "@/components/category-chip";
import { HeatControl } from "@/components/heat-control";
import { PlayerAvatar } from "@/components/player-avatar";
import { ChatDrawer } from "@/components/chat-drawer";
import { configureRoom, getRoomState, heartbeat, roomAction } from "@/lib/api";
import { clearSession, loadSession } from "@/lib/session";
import { subscribeToRoom, type RoomReaction } from "@/lib/realtime";
import type { Choice, GameCategory, Player, RoomState, SessionLength } from "@/types/game";

const CATEGORIES: GameCategory[] = ["classic", "funny", "wholesome", "personal", "dark", "adult", "fantasy", "popular"];
const REACTIONS = ["😂", "❤️", "💀", "😭", "🔥", "👀", "🤡"];
const LENGTHS: Array<{ id: SessionLength; label: string; sub: string }> = [
  { id: "20", label: "20", sub: "Quick" },
  { id: "30", label: "30", sub: "Recommended" },
  { id: "40", label: "40", sub: "Long" },
  { id: "unlimited", label: "∞", sub: "Until host ends" },
];

function nameFor(players: Player[], id: string | null | undefined) {
  if (!id) return "Someone";
  return players.find((player) => player.id === id)?.name ?? "Someone";
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    classic: "Classic",
    funny: "Funny",
    wholesome: "Wholesome",
    personal: "Personal",
    dark: "Dark",
    adult: "18+",
    fantasy: "Fantasy",
    popular: "Popular",
  };
  return labels[category] ?? category;
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [state, setState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [hostPanel, setHostPanel] = useState(false);
  const [origin, setOrigin] = useState("");
  const [reveal, setReveal] = useState<Choice | null>(null);
  const [reactions, setReactions] = useState<Array<RoomReaction & { offset: number }>>([]);
  const initializedRef = useRef(false);
  const lastChoiceRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    params.then((value) => {
      const nextCode = value.code.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5);
      setCode(nextCode);
      const session = loadSession(nextCode);
      if (!session?.token) {
        window.location.replace(`/join/${nextCode}`);
        return;
      }
      setToken(session.token);
    });
  }, [params]);

  const applyState = useCallback((next: RoomState) => {
    const latest = next.choices[next.choices.length - 1] ?? null;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastChoiceRef.current = latest?.id ?? null;
    } else if (latest && latest.id !== lastChoiceRef.current) {
      lastChoiceRef.current = latest.id;
      setReveal(latest);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = setTimeout(() => setReveal(null), latest.turnShuffled ? 4200 : 3000);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([35, 30, 60]);
    }
    setState(next);
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!code || !token || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const next = await getRoomState(code, token);
      applyState(next);
      if (!quiet) setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load this room.";
      if (/session|rejoin/i.test(message)) {
        clearSession(code);
        window.location.replace(`/join/${code}`);
        return;
      }
      if (!quiet) setError(message);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [applyState, code, token]);

  useEffect(() => {
    if (!code || !token) return;
    void refresh();
    const unsubscribe = subscribeToRoom(code, {
      onChange: () => void refresh(true),
      onReaction: (reaction) => {
        const item = { ...reaction, offset: Math.round(Math.random() * 54 - 27) };
        setReactions((current) => [...current.slice(-8), item]);
        setTimeout(() => setReactions((current) => current.filter((value) => value.id !== item.id)), 2200);
      },
    });
    const poll = window.setInterval(() => void refresh(true), 2600);
    const beat = window.setInterval(async () => {
      try {
        const next = await heartbeat(code, token);
        applyState(next);
      } catch {
        // Polling will surface a persistent issue without interrupting play.
      }
    }, 20_000);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
      window.clearInterval(beat);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [applyState, code, refresh, token]);

  const run = useCallback(async (op: string, data: Record<string, unknown> = {}) => {
    if (!code || !token || busy) return;
    try {
      setBusy(true);
      setError("");
      const next = await roomAction<RoomState>(code, token, op, data);
      applyState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [applyState, busy, code, token]);

  const configure = useCallback(async (patch: Parameters<typeof configureRoom>[2]) => {
    if (!code || !token || settingsBusy) return;
    try {
      setSettingsBusy(true);
      setError("");
      const next = await configureRoom(code, token, patch);
      applyState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that setting.");
    } finally {
      setSettingsBusy(false);
    }
  }, [applyState, code, settingsBusy, token]);

  const players = state?.players ?? [];
  const me = state?.me ?? null;
  const room = state?.room ?? null;
  const currentPlayer = useMemo(
    () => players.find((player) => player.id === room?.currentTurnPlayerId) ?? null,
    [players, room?.currentTurnPlayerId],
  );
  const isMyTurn = Boolean(me && room?.currentTurnPlayerId === me.id && room.status === "active");
  const joinUrl = origin && code ? `${origin}/join/${code}` : "";
  const latestChoice = state?.choices[state.choices.length - 1] ?? null;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      setError("Could not copy the room code.");
    }
  }

  async function react(emoji: string) {
    if (!code || !token) return;
    try {
      await roomAction<{ sent: true }>(code, token, "reaction", { emoji });
    } catch {
      // Reactions should never interrupt the game.
    }
  }

  function toggleCategory(category: GameCategory) {
    if (!room || !me?.isHost) return;
    const exists = room.categories.includes(category);
    if (exists && room.categories.length === 1) {
      setError("Keep at least one category enabled.");
      return;
    }
    const categories = exists ? room.categories.filter((value) => value !== category) : [...room.categories, category];
    void configure({ categories });
  }

  async function shareResults() {
    if (!state?.final) return;
    const final = state.final;
    const text = [
      "PassThePhone — tonight's receipts",
      final.mostChosen ? `Main character: ${final.mostChosen.playerName} (${final.mostChosen.count} picks)` : "",
      ...final.awardWinners.slice(0, 4).map((award) => `${award.title}: ${award.playerName}`),
    ].filter(Boolean).join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "PassThePhone", text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1300);
      }
    } catch {
      // Cancelled share sheet is not an error worth surfacing.
    }
  }

  if (loading || !code || !token) {
    return (
      <main className="app-shell grid min-h-screen place-items-center px-4">
        <div className="text-center"><Loader2 className="mx-auto animate-spin text-violet-300" /><div className="mt-4 text-sm text-white/45">Joining the room…</div></div>
      </main>
    );
  }

  if (!state || !room || !me) {
    return (
      <main className="app-shell grid min-h-screen place-items-center px-4">
        <div className="glass max-w-md rounded-[28px] p-7 text-center">
          <div className="text-2xl font-black">Couldn&apos;t open this room.</div>
          <p className="mt-3 text-sm leading-6 text-white/50">{error || "The room may have expired."}</p>
          <a className="btn btn-primary mt-6" href="/">Back home</a>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell min-h-screen pb-28">
      <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            className="absolute bottom-20 left-1/2 animate-[floatUp_2.2s_ease-out_forwards] text-4xl"
            style={{ transform: `translateX(calc(-50% + ${reaction.offset}px))` }}
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#08070d]/80 backdrop-blur-xl">
        <div className="container flex min-h-16 items-center justify-between gap-3 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-full border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-black tracking-[.12em] text-white/75" onClick={copyCode}>
              {copied ? <span className="flex items-center gap-1"><Check size={13} /> COPIED</span> : <span className="flex items-center gap-1.5"><Copy size={13} /> {code}</span>}
            </button>
            {room.chatEnabled && <ChatDrawer code={code} token={token} me={me} players={players} messages={state.messages} onSent={() => void refresh(true)} />}
            {me.isHost && room.status === "active" && (
              <button type="button" className="btn btn-secondary !min-h-11 !px-3" onClick={() => setHostPanel(true)}><Settings2 size={18} /><span className="hidden sm:inline">Host</span></button>
            )}
          </div>
        </div>
      </header>

      <div className="container py-6 sm:py-9">
        {error && (
          <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-rose-400/15 bg-rose-400/[.07] px-4 py-3 text-sm text-rose-100/80">
            <span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button>
          </div>
        )}

        {room.status === "lobby" && (
          <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
            <section className="glass rounded-[30px] p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="kicker">Room {code}</div>
                  <h1 className="mt-2 text-3xl font-black tracking-[-.04em]">Get the group in.</h1>
                  <p className="mt-3 max-w-md text-sm leading-6 text-white/48">Scan the QR or share the code. The game supports 3–15 friends.</p>
                </div>
                <div className="rounded-2xl bg-white p-2.5">{joinUrl && <QRCodeSVG value={joinUrl} size={104} bgColor="#ffffff" fgColor="#0a0910" />}</div>
              </div>

              <div className="mt-7 flex items-center justify-between">
                <div className="flex items-center gap-2"><Users size={17} className="text-violet-300" /><span className="font-black">{players.length}/15 joined</span></div>
                <button type="button" className="text-xs font-bold text-violet-200/80 hover:text-violet-100" onClick={copyCode}>Copy code</button>
              </div>
              <div className="mt-3 space-y-2">
                {players.map((player) => (
                  <div key={player.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-3">
                    <PlayerAvatar player={player} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate font-bold">{player.name}{player.isHost && <Crown size={14} className="text-amber-300" />}{player.id === me.id && <span className="text-xs font-medium text-white/35">you</span>}</div>
                      <div className="mt-0.5 text-xs text-white/35">{player.connected ? "Connected" : "Reconnecting…"}</div>
                    </div>
                    {me.isHost && !player.isHost && (
                      <button type="button" className="btn btn-ghost !min-h-9 !w-9 !p-0 text-white/40 hover:text-rose-200" aria-label={`Remove ${player.name}`} disabled={busy} onClick={() => void run("kick", { playerId: player.id })}><UserMinus size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="glass rounded-[30px] p-5 sm:p-7">
              {me.isHost ? (
                <>
                  <div className="kicker">Host setup</div>
                  <h2 className="mt-2 text-2xl font-black tracking-[-.03em]">Set tonight&apos;s vibe.</h2>

                  <div className="mt-7">
                    <div className="mb-3 flex items-end justify-between"><div><div className="text-sm font-black">Game length</div><div className="mt-1 text-xs text-white/40">No repeats in the same session.</div></div></div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {LENGTHS.map((length) => (
                        <button key={length.id} type="button" disabled={settingsBusy} onClick={() => void configure({ sessionLength: length.id })} className={`rounded-2xl border p-3 text-center transition ${room.sessionLength === length.id ? "border-violet-400/55 bg-violet-500/15" : "border-white/10 bg-white/[.025] hover:bg-white/[.05]"}`}>
                          <div className="text-xl font-black">{length.id === "unlimited" ? <InfinityIcon className="mx-auto" /> : length.label}</div>
                          <div className="mt-1 text-[11px] text-white/40">{length.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-7">
                    <div className="mb-3"><div className="text-sm font-black">Categories</div><div className="mt-1 text-xs text-white/40">Pick one or mix several.</div></div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CATEGORIES.map((category) => <CategoryChip key={category} category={category} selected={room.categories.includes(category)} onClick={() => toggleCategory(category)} />)}
                    </div>
                    {room.categories.includes("adult") && <div className="mt-3 rounded-2xl border border-rose-300/10 bg-rose-300/[.04] p-3 text-xs leading-5 text-rose-100/60">18+ uses mature dating and relationship prompts. It stays non-explicit.</div>}
                  </div>

                  <div className="mt-7 flex flex-col gap-4 rounded-[24px] border border-white/10 bg-black/15 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><div className="flex items-center gap-2 text-sm font-black"><Flame size={16} className="text-orange-300" /> Starting Heat</div><div className="mt-1 text-xs text-white/40">Raise it later without restarting.</div></div>
                    <HeatControl value={room.heat} onChange={(heat) => void configure({ heat })} />
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={settingsBusy} onClick={() => void configure({ allowSelf: !room.allowSelf })} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.025] p-4 text-left">
                      <div><div className="text-sm font-black">Self-picks</div><div className="mt-1 text-xs text-white/40">Allow picking yourself.</div></div><div className={`h-6 w-11 rounded-full p-1 transition ${room.allowSelf ? "bg-violet-500" : "bg-white/10"}`}><div className={`h-4 w-4 rounded-full bg-white transition ${room.allowSelf ? "translate-x-5" : ""}`} /></div>
                    </button>
                    <button type="button" disabled={settingsBusy} onClick={() => void configure({ chatEnabled: !room.chatEnabled })} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.025] p-4 text-left">
                      <div><div className="text-sm font-black">Room chat</div><div className="mt-1 text-xs text-white/40">Messages during the game.</div></div><div className={`h-6 w-11 rounded-full p-1 transition ${room.chatEnabled ? "bg-violet-500" : "bg-white/10"}`}><div className={`h-4 w-4 rounded-full bg-white transition ${room.chatEnabled ? "translate-x-5" : ""}`} /></div>
                    </button>
                  </div>

                  <button type="button" className="btn btn-primary mt-7 w-full" disabled={players.length < 3 || busy || settingsBusy} onClick={() => void run("start")}>
                    {busy ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />} Start game
                  </button>
                  {players.length < 3 && <div className="mt-3 text-center text-xs text-white/35">Waiting for {3 - players.length} more player{3 - players.length === 1 ? "" : "s"}.</div>}
                </>
              ) : (
                <div className="grid min-h-[430px] place-items-center text-center">
                  <div>
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-violet-400/15 bg-violet-500/10"><Sparkles className="text-violet-300" /></div>
                    <h2 className="mt-5 text-2xl font-black">Waiting for {nameFor(players, room ? players.find((player) => player.isHost)?.id : null)}.</h2>
                    <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/45">The host is choosing the categories, heat and game length. Keep this screen open.</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">{room.categories.map((category) => <span key={category} className="rounded-full border border-white/10 bg-white/[.03] px-3 py-2 text-xs font-bold text-white/60">{categoryLabel(category)}</span>)}</div>
                    <div className="mt-4 text-sm text-white/45">Heat {room.heat}/5 · {room.sessionLength === "unlimited" ? "Unlimited" : `${room.sessionLength} questions`}</div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {room.status === "active" && (
          <div className="mx-auto max-w-5xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-white/45"><span className="rounded-full border border-white/10 bg-white/[.03] px-3 py-2 font-bold text-white/65">Question {room.roundNumber}{room.questionLimit ? ` / ${room.questionLimit}` : ""}</span><span className="rounded-full border border-orange-300/10 bg-orange-300/[.05] px-3 py-2">{"🔥".repeat(room.heat)}</span></div>
              <div className="flex flex-wrap gap-1.5">{room.categories.slice(0, 4).map((category) => <span key={category} className="rounded-full bg-white/[.035] px-2.5 py-1.5 text-[11px] font-bold text-white/40">{categoryLabel(category)}</span>)}</div>
            </div>

            <section className="glass overflow-hidden rounded-[32px]">
              <div className="border-b border-white/10 p-5 sm:p-7">
                <div className="flex items-center gap-3">
                  {currentPlayer && <PlayerAvatar player={currentPlayer} size={46} />}
                  <div><div className="text-xs font-black uppercase tracking-[.14em] text-violet-300">{isMyTurn ? "Your turn" : `${currentPlayer?.name ?? "Someone"}'s turn`}</div><div className="mt-1 text-sm text-white/40">{isMyTurn ? "Pick the friend who fits this best." : "Everyone sees the choice when they make it."}</div></div>
                </div>
                <h1 className="mt-6 text-3xl font-black leading-[1.12] tracking-[-.04em] sm:text-4xl lg:text-5xl">{room.currentQuestion?.text ?? "Loading the next question…"}</h1>
              </div>

              {isMyTurn ? (
                <div className="p-5 sm:p-7">
                  <div className="mb-3 text-xs font-black uppercase tracking-[.14em] text-white/35">Choose one</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {players.map((player) => {
                      const blocked = !room.allowSelf && player.id === me.id;
                      return (
                        <button key={player.id} type="button" disabled={blocked || busy} onClick={() => void run("choose", { targetPlayerId: player.id })} className={`group flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left transition ${blocked ? "cursor-not-allowed border-white/[.05] bg-white/[.015] opacity-35" : "border-white/10 bg-white/[.035] hover:-translate-y-0.5 hover:border-violet-400/40 hover:bg-violet-500/10"}`}>
                          <PlayerAvatar player={player} size={44} />
                          <div className="min-w-0 flex-1"><div className="truncate font-black">{player.name}</div><div className="mt-1 text-xs text-white/35">{player.id === me.id ? (blocked ? "Self-pick disabled" : "That’s you") : "Pick & pass the turn"}</div></div>
                          {!blocked && <ArrowRight size={17} className="text-white/20 transition group-hover:translate-x-0.5 group-hover:text-violet-300" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid min-h-56 place-items-center p-7 text-center">
                  <div>
                    <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-violet-400/15 bg-violet-500/[.07] px-4 py-2 text-sm font-bold text-violet-100/75"><span className="h-2 w-2 animate-pulse rounded-full bg-violet-300" /> {currentPlayer?.name ?? "Someone"} is choosing…</div>
                    <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-white/38">No secret voting. Their pick will be revealed to the entire room.</p>
                  </div>
                </div>
              )}
            </section>

            {latestChoice && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.025] px-4 py-3 text-sm text-white/45">
                Last pick: <span className="font-bold text-white/75">{nameFor(players, latestChoice.chooserPlayerId)} → {nameFor(players, latestChoice.chosenPlayerId)}</span>
                {latestChoice.turnShuffled && <span className="ml-2 text-violet-300">· turn shuffled to {nameFor(players, latestChoice.nextTurnPlayerId)}</span>}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="mr-1 text-xs font-bold uppercase tracking-[.13em] text-white/25">React</span>
              {REACTIONS.map((emoji) => <button key={emoji} type="button" className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[.03] text-xl transition hover:-translate-y-0.5 hover:bg-white/[.07]" onClick={() => void react(emoji)}>{emoji}</button>)}
            </div>
          </div>
        )}

        {room.status === "ended" && (
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <div className="kicker">The room has spoken</div>
              <h1 className="mt-3 text-4xl font-black tracking-[-.05em] sm:text-6xl">Tonight&apos;s receipts.</h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/45">Built from {state.final?.questionCount ?? state.choices.length} completed question{(state.final?.questionCount ?? state.choices.length) === 1 ? "" : "s"}. No fake stats.</p>
            </div>

            {state.final?.mostChosen && (
              <div className="glass mx-auto mt-8 max-w-2xl rounded-[32px] p-7 text-center sm:p-9">
                <div className="text-xs font-black uppercase tracking-[.16em] text-violet-300">👑 Main Character</div>
                <div className="mt-3 text-4xl font-black tracking-[-.04em]">{state.final.mostChosen.playerName}</div>
                <div className="mt-2 text-sm text-white/45">Picked {state.final.mostChosen.count} times across the session.</div>
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {state.final?.awardWinners.map((award) => (
                <div key={award.category} className="rounded-[24px] border border-white/10 bg-white/[.03] p-5">
                  <div className="text-xs font-black uppercase tracking-[.13em] text-white/35">{award.title}</div>
                  <div className="mt-3 text-2xl font-black">{award.playerName}</div>
                  <div className="mt-2 text-xs text-white/35">{award.count} category pick{award.count === 1 ? "" : "s"}</div>
                </div>
              ))}
              {state.final?.strongestChain && state.final.strongestChain.count >= 2 && (
                <div className="rounded-[24px] border border-fuchsia-400/15 bg-fuchsia-500/[.06] p-5">
                  <div className="text-xs font-black uppercase tracking-[.13em] text-fuchsia-200/60">🔗 Strongest Chain</div>
                  <div className="mt-3 text-xl font-black">{state.final.strongestChain.fromName} ↔ {state.final.strongestChain.toName}</div>
                  <div className="mt-2 text-xs text-white/35">{state.final.strongestChain.count} picks between them</div>
                </div>
              )}
              {state.final?.heatSurvivor && (
                <div className="rounded-[24px] border border-orange-400/15 bg-orange-500/[.05] p-5">
                  <div className="text-xs font-black uppercase tracking-[.13em] text-orange-200/65">🔥 Heat Survivor</div>
                  <div className="mt-3 text-xl font-black">{state.final.heatSurvivor.playerName}</div>
                  <div className="mt-2 text-xs text-white/35">{state.final.heatSurvivor.count} high-heat pick{state.final.heatSurvivor.count === 1 ? "" : "s"}</div>
                </div>
              )}
            </div>

            {(state.final?.receipts.length ?? 0) > 0 && (
              <section className="glass mt-5 rounded-[30px] p-5 sm:p-7">
                <div className="kicker">The receipts</div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {state.final?.receipts.map((receipt, index) => <div key={`${receipt}-${index}`} className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-white/65">{receipt}</div>)}
                </div>
              </section>
            )}

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => void shareResults()}><Share2 size={17} /> {copied ? "Copied" : "Share results"}</button>
              {me.isHost ? (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run("restart")}><RotateCcw size={17} /> Play again</button>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[.025] px-4 py-3 text-sm text-white/45">Waiting for the host to start another.</div>
              )}
              <a href="/" className="btn btn-ghost"><Home size={17} /> Home</a>
            </div>
          </div>
        )}
      </div>

      {hostPanel && (
        <div className="fixed inset-0 z-50 bg-black/65 p-3 backdrop-blur-md" onClick={() => setHostPanel(false)}>
          <section className="glass ml-auto h-full w-full max-w-lg overflow-y-auto rounded-[28px] p-5 sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3"><div><div className="kicker">Host controls</div><h2 className="mt-2 text-2xl font-black">Control the vibe.</h2></div><button type="button" className="btn btn-ghost !min-h-10 !w-10 !p-0" onClick={() => setHostPanel(false)}><X size={18} /></button></div>

            <div className="mt-7 rounded-[24px] border border-white/10 bg-black/15 p-4">
              <div className="mb-4"><div className="text-sm font-black">Live Heat</div><div className="mt-1 text-xs text-white/40">Changes apply to upcoming questions.</div></div>
              <HeatControl value={room.heat} onChange={(heat) => void configure({ heat })} />
            </div>

            <div className="mt-6">
              <div className="mb-3"><div className="text-sm font-black">Categories</div><div className="mt-1 text-xs text-white/40">Turn categories on or off mid-session.</div></div>
              <div className="grid grid-cols-2 gap-2">{CATEGORIES.map((category) => <CategoryChip key={category} category={category} selected={room.categories.includes(category)} onClick={() => toggleCategory(category)} />)}</div>
            </div>

            <div className="mt-7 grid gap-2">
              <button type="button" className="btn btn-secondary w-full" disabled={busy} onClick={() => { setHostPanel(false); void run("skip"); }}><SkipForward size={17} /> Skip this question</button>
              <button type="button" className="btn w-full border border-rose-400/20 bg-rose-500/[.08] text-rose-100 hover:bg-rose-500/[.13]" disabled={busy} onClick={() => { if (window.confirm("End the game and show the receipts now?")) { setHostPanel(false); void run("end"); } }}>End game & show receipts</button>
            </div>
          </section>
        </div>
      )}

      {reveal && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[#08070d]/95 p-5 text-center backdrop-blur-xl">
          <div className="max-w-2xl">
            <div className="kicker">The pick is in</div>
            <div className="mt-6 text-xl font-bold text-white/55">{nameFor(players, reveal.chooserPlayerId)} chose…</div>
            <div className="mt-3 bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-5xl font-black tracking-[-.055em] text-transparent sm:text-7xl">{nameFor(players, reveal.chosenPlayerId)}</div>
            <div className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/50">for “{reveal.questionText}”</div>
            {reveal.turnShuffled ? (
              <div className="mx-auto mt-7 max-w-md rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm text-violet-100/75"><span className="font-black">TURN SHUFFLE</span><br />The chain was looping, so {nameFor(players, reveal.nextTurnPlayerId)} gets the next turn.</div>
            ) : (
              <div className="mt-7 text-sm font-bold text-white/35">{nameFor(players, reveal.chosenPlayerId)} gets the next question.</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
