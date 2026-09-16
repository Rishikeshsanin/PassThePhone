"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { ensureAnonymousSession, getSupabase, isSupabaseConfigured } from "@/lib/supabase";

const palette = ["#8b5cf6", "#ec4899", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#3b82f6", "#a855f7", "#f97316", "#84cc16", "#e11d48", "#0ea5e9", "#6366f1", "#d946ef"];

export default function JoinRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { params.then((p) => setCode(p.code.toUpperCase())); }, [params]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !code) return;
    if (!isSupabaseConfigured()) { setError("Realtime backend is not connected yet."); return; }
    try {
      setBusy(true); setError("");
      const user = await ensureAnonymousSession();
      const supabase = getSupabase();
      const { data: room, error: roomError } = await supabase.from("rooms").select("*").eq("code", code).single();
      if (roomError || !room) throw new Error("Room not found or expired.");
      if (room.status !== "lobby") {
        const { data: existing } = await supabase.from("players").select("id").eq("room_id", room.id).eq("user_id", user.id).maybeSingle();
        if (existing) { window.location.href = `/room/${code}`; return; }
        throw new Error("This game has already started.");
      }
      const { count } = await supabase.from("players").select("id", { count: "exact", head: true }).eq("room_id", room.id);
      if ((count ?? 0) >= 15) throw new Error("This room is full (15 players max).");
      const { error: playerError } = await supabase.from("players").insert({
        room_id: room.id,
        user_id: user.id,
        name: name.trim().slice(0, 24),
        color: palette[(count ?? 0) % palette.length],
        join_order: (count ?? 0) + 1,
        connected: true,
      });
      if (playerError) {
        if (playerError.code === "23505") throw new Error("That name is already in this room.");
        throw playerError;
      }
      window.location.href = `/room/${code}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the room.");
    } finally { setBusy(false); }
  }

  return (
    <main className="app-shell">
      <div className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between"><Logo /><a href="/" className="btn btn-ghost !min-h-11 !px-3"><ArrowLeft size={17} /> Back</a></div>
        <div className="glass mt-10 rounded-[30px] p-6 sm:p-8">
          <div className="kicker">Join room</div>
          <h1 className="mt-3 text-3xl font-black tracking-[-.04em]">Room {code || "…"}</h1>
          <p className="mt-3 text-sm leading-6 text-white/48">Pick a name everyone in the room will recognize.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block text-sm font-bold text-white/80">Your name</label>
            <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
            {error && <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[.06] p-3 text-sm text-rose-100/75">{error}</div>}
            <button className="btn btn-primary w-full" disabled={!name.trim() || busy || !code}>{busy ? <Loader2 className="animate-spin" size={18} /> : <>Join room <ArrowRight size={18} /></>}</button>
          </form>
        </div>
      </div>
    </main>
  );
}
