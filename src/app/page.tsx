"use client";

import { useState } from "react";
import { ArrowRight, Gamepad2, MessageCircle, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Logo } from "@/components/logo";

export default function HomePage() {
  const [joinCode, setJoinCode] = useState("");

  const enter = (mode: "create" | "join") => {
    if (mode === "create") window.location.href = "/new";
    else if (joinCode.length === 5) window.location.href = `/join/${joinCode}`;
  };

  return (
    <main className="app-shell">
      <div className="container">
        <header className="flex items-center justify-between py-6">
          <Logo />
          <div className="rounded-full border border-white/10 bg-white/[.035] px-3 py-2 text-xs text-white/55">3–15 players</div>
        </header>

        <section className="grid gap-10 pb-16 pt-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pt-20">
          <div className="fade-up">
            <div className="kicker">The room decides who&apos;s next</div>
            <h1 className="mt-4 max-w-3xl text-5xl font-black tracking-[-.055em] sm:text-6xl lg:text-7xl">
              Pick someone.<br />
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">Pass the turn.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/58">
              One question. One choice. Everyone sees it. The person you pick gets the next turn — and the chain keeps moving until the host ends the night.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={() => enter("create")}>Create a room <ArrowRight size={18} /></button>
              <a className="btn btn-secondary" href="#join">Join a room</a>
            </div>
          </div>

          <div className="glass fade-up rounded-[30px] p-5 sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="kicker">Live example</div>
                <div className="mt-1 text-lg font-black">Question 17</div>
              </div>
              <div className="rounded-full bg-orange-400/10 px-3 py-2 text-xs font-bold text-orange-200">🔥🔥🔥 Heat 3</div>
            </div>
            <div className="rounded-[26px] border border-white/10 bg-black/20 p-6 sm:p-8">
              <div className="text-xs font-black uppercase tracking-[.16em] text-violet-300">Rishi&apos;s turn</div>
              <div className="mt-4 text-2xl font-black leading-tight sm:text-3xl">Who is most likely to accidentally get arrested?</div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {["Aryan", "Rahul", "Karthik", "Sai"].map((name, i) => (
                  <div key={name} className={`rounded-2xl border p-4 text-sm font-bold ${i === 0 ? "border-fuchsia-400/60 bg-fuchsia-500/15" : "border-white/10 bg-white/[.035]"}`}>{name}</div>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-center text-sm text-white/60">
              Rishi chooses Aryan → <span className="font-bold text-white">Aryan gets the next question.</span>
            </div>
          </div>
        </section>

        <section id="join" className="grid gap-4 border-t border-white/10 py-10 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <div className="kicker">Already invited?</div>
            <h2 className="mt-2 text-2xl font-black tracking-[-.03em]">Join in seconds.</h2>
            <p className="mt-2 text-sm text-white/45">No account. Just the room code and your name.</p>
          </div>
          <div className="flex w-full max-w-md gap-2">
            <input
              aria-label="Room code"
              className="input uppercase tracking-[.18em]"
              maxLength={5}
              placeholder="ROOM CODE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 5))}
              onKeyDown={(e) => { if (e.key === "Enter" && joinCode.length === 5) enter("join"); }}
            />
            <button className="btn btn-primary !px-4" onClick={() => enter("join")} disabled={joinCode.length !== 5}><ArrowRight /></button>
          </div>
        </section>

        <section className="grid gap-4 pb-20 md:grid-cols-4">
          {[
            [Gamepad2, "One-tap gameplay", "No rulebook. Get a question, pick a friend, pass the turn."],
            [Sparkles, "Live Heat", "Turn the questions up or down without restarting the session."],
            [MessageCircle, "Chat + reactions", "Keep the room alive with messages and instant emoji reactions."],
            [ShieldCheck, "Private room state", "Temporary sessions with app-isolated backend data."],
          ].map(([Icon, title, text]) => {
            const C = Icon as typeof Users;
            return <div key={String(title)} className="rounded-3xl border border-white/10 bg-white/[.025] p-5"><C size={20} className="text-violet-300" /><div className="mt-4 font-black">{String(title)}</div><p className="mt-2 text-sm leading-6 text-white/45">{String(text)}</p></div>;
          })}
        </section>
      </div>
    </main>
  );
}
