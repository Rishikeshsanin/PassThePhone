"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { roomAction } from "@/lib/api";
import type { ChatMessage, Player } from "@/types/game";

export function ChatDrawer({
  code,
  token,
  me,
  players,
  messages,
  onSent,
}: {
  code: string;
  token: string;
  me: Player;
  players: Player[];
  messages: ChatMessage[];
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim().slice(0, 280);
    if (!body || busy) return;
    try {
      setBusy(true);
      setError("");
      await roomAction(code, token, "chat_send", { body });
      setText("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setBusy(false);
    }
  }

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "Player";

  return (
    <>
      <button type="button" className="btn btn-secondary !min-h-11 !px-3" onClick={() => setOpen(true)}>
        <MessageCircle size={18} /> <span className="hidden sm:inline">Chat</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 p-3 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <section className="glass ml-auto flex h-full w-full max-w-md flex-col rounded-[26px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div>
                <div className="font-black">Room chat</div>
                <div className="text-xs text-white/40">Quick messages, maximum drama.</div>
              </div>
              <button type="button" aria-label="Close chat" className="btn btn-ghost !min-h-10 !w-10 !p-0" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && <div className="mt-10 text-center text-sm text-white/35">No messages yet. Somebody start the drama.</div>}
              {messages.map((m) => (
                <div key={m.id} className={m.playerId === me.id ? "ml-10 rounded-2xl bg-violet-500/18 p-3" : "mr-10 rounded-2xl bg-white/[.05] p-3"}>
                  <div className="text-[11px] font-bold text-white/40">{nameFor(m.playerId)}</div>
                  <div className="mt-1 break-words text-sm text-white/85">{m.body}</div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="border-t border-white/10 p-4">
              {error && <div className="mb-2 text-xs text-rose-200/80">{error}</div>}
              <div className="flex gap-2">
                <input className="input" maxLength={280} placeholder="Message the room…" value={text} onChange={(e) => setText(e.target.value)} />
                <button className="btn btn-primary !w-12 !px-0" disabled={!text.trim() || busy} aria-label="Send message"><Send size={18} /></button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
