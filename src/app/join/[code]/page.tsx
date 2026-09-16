"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { joinRoom } from "@/lib/api";
import { loadSession, saveSession } from "@/lib/session";

export default function JoinRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    params.then((p) => {
      const clean = p.code.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5);
      setCode(clean);
      const existing = loadSession(clean);
      if (existing?.token) window.location.replace(`/room/${clean}`);
    });
  }, [params]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || code.length !== 5 || busy) return;
    try {
      setBusy(true);
      setError("");
      const session = await joinRoom(code, name.trim());
      saveSession(session);
      window.location.href = `/room/${session.code}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the room.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between">
          <Logo />
          <a href="/" className="btn btn-ghost !min-h-11 !px-3"><ArrowLeft size={17} /> Back</a>
        </div>
        <div className="glass mt-10 rounded-[30px] p-6 sm:p-8">
          <div className="kicker">Join room</div>
          <h1 className="mt-3 text-3xl font-black tracking-[-.04em]">Room {code || "…"}</h1>
          <p className="mt-3 text-sm leading-6 text-white/50">Pick a name everyone in the room will recognize.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block text-sm font-bold text-white/80" htmlFor="player-name">Your name</label>
            <input
              id="player-name"
              className="input"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="nickname"
              autoFocus
            />
            {error && <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[.06] p-3 text-sm text-rose-100/80">{error}</div>}
            <button className="btn btn-primary w-full" disabled={!name.trim() || busy || code.length !== 5}>
              {busy ? <Loader2 className="animate-spin" size={18} /> : <>Join room <ArrowRight size={18} /></>}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
