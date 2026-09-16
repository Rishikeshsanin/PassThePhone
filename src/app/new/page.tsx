"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { ensureAnonymousSession, getSupabase, isSupabaseConfigured } from "@/lib/supabase";

const colors = ["#8b5cf6", "#ec4899", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444"];

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function NewRoomPage() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isSupabaseConfigured()) {
      setError("Realtime backend setup is the only remaining requirement before rooms can go live.");
      return;
    }
    try {
      setBusy(true); setError("");
      const user = await ensureAnonymousSession();
      const supabase = getSupabase();
      const code = roomCode();
      const { data: room, error: roomError } = await supabase.from("rooms").insert({
        code,
        host_user_id: user.id,
        status: "lobby",
        categories: ["classic"],
        heat: 2,
        session_length: "30",
        question_limit: 30,
        allow_self: true,
        chat_enabled: true,
      }).select().single();
      if (roomError) throw roomError;
      const { error: playerError } = await supabase.from("players").insert({
        room_id: room.id,
        user_id: user.id,
        name: name.trim().slice(0, 24),
        color: colors[Math.floor(Math.random() * colors.length)],
        join_order: 1,
        connected: true,
      });
      if (playerError) throw playerError;
      window.location.href = `/room/${code}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the room.");
    } finally { setBusy(false); }
  }

  return (
    <main className="app-shell">
      <div className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between"><Logo /><a href="/" className="btn btn-ghost !min-h-11 !px-3"><ArrowLeft size={17} /> Back</a></div>
        <div className="glass mt-10 rounded-[30px] p-6 sm:p-8">
          <div className="kicker">Create a room</div>
          <h1 className="mt-3 text-3xl font-black tracking-[-.04em]">Start the chain.</h1>
          <p className="mt-3 text-sm leading-6 text-white/48">You&apos;ll become the host. Friends can join with a short code or QR.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block text-sm font-bold text-white/80">Your name</label>
            <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Rishi" autoFocus />
            {error && <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[.06] p-3 text-sm text-rose-100/75">{error}</div>}
            <button className="btn btn-primary w-full" disabled={!name.trim() || busy}>{busy ? <Loader2 className="animate-spin" size={18} /> : <>Create room <ArrowRight size={18} /></>}</button>
          </form>
        </div>
      </div>
    </main>
  );
}
