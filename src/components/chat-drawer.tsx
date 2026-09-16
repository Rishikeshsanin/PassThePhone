"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import type { ChatMessage, Player } from "@/types/game";

export function ChatDrawer({ roomId, me, players }: { roomId: string; me: Player; players: Player[] }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.from("chat_messages").select("*").eq("room_id", roomId).order("created_at", { ascending: true }).limit(80).then(({ data }) => setMessages((data ?? []) as ChatMessage[]));
    const channel = supabase.channel(`chat:${roomId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
      setMessages((prev) => [...prev.slice(-79), payload.new as ChatMessage]);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim().slice(0, 280);
    if (!body) return;
    setText("");
    await getSupabase().from("chat_messages").insert({ room_id: roomId, player_id: me.id, body });
  }

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "Player";
  return (
    <>
      <button type="button" className="btn btn-secondary !min-h-11 !px-3" onClick={() => setOpen(true)}><MessageCircle size={18} /> Chat</button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 p-3 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <section className="glass ml-auto flex h-full w-full max-w-md flex-col rounded-[26px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 p-4"><div><div className="font-black">Room chat</div><div className="text-xs text-white/40">Keep it quick. The game stays center stage.</div></div><button type="button" className="btn btn-ghost !min-h-10 !w-10 !p-0" onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && <div className="mt-10 text-center text-sm text-white/35">No messages yet. Somebody start the drama.</div>}
              {messages.map((m) => <div key={m.id} className={m.player_id === me.id ? "ml-10 rounded-2xl bg-violet-500/18 p-3" : "mr-10 rounded-2xl bg-white/[.05] p-3"}><div className="text-[11px] font-bold text-white/40">{nameFor(m.player_id)}</div><div className="mt-1 text-sm text-white/85">{m.body}</div></div>)}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-4"><input className="input" maxLength={280} placeholder="Message the room…" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn btn-primary !w-12 !px-0" disabled={!text.trim()}><Send size={18} /></button></form>
          </section>
        </div>
      )}
    </>
  );
}
