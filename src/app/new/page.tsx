"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { createRoom } from "@/lib/api";
import { saveSession } from "@/lib/session";

export default function NewRoomPage() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    try {
      setBusy(true);
      setError("");
      const session = await createRoom(clean);
      saveSession(session);
      window.location.href = `/room/${session.code}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the room.");
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
          <div className="kicker">Create a room</div>
          <h1 className="mt-3 text-3xl font-black tracking-[-.04em]">Start the chain.</h1>
          <p className="mt-3 text-sm leading-6 text-white/50">
            You&apos;ll become the host. Friends join with a short code or QR — no accounts, no setup.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block text-sm font-bold text-white/80" htmlFor="host-name">Your name</label>
            <input
              id="host-name"
              className="input"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rishi"
              autoComplete="nickname"
              autoFocus
            />
            {error && <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[.06] p-3 text-sm text-rose-100/80">{error}</div>}
            <button className="btn btn-primary w-full" disabled={!name.trim() || busy}>
              {busy ? <Loader2 className="animate-spin" size={18} /> : <>Create room <ArrowRight size={18} /></>}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
