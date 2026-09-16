import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-public";

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

export type RoomReaction = {
  id: string;
  emoji: string;
  playerId: string;
  playerName: string;
  at: number;
};

export function subscribeToRoom(
  code: string,
  handlers: { onChange: () => void; onReaction?: (reaction: RoomReaction) => void },
): () => void {
  const supabase = getClient();
  let channel: RealtimeChannel | null = supabase.channel(`pass_the_phone:room:${code.toUpperCase()}`, {
    config: { private: false, broadcast: { self: false } },
  });
  channel
    .on("broadcast", { event: "state_changed" }, () => handlers.onChange())
    .on("broadcast", { event: "reaction" }, ({ payload }) => {
      const reaction = payload as RoomReaction;
      if (reaction?.emoji && reaction?.playerId) handlers.onReaction?.(reaction);
    })
    .subscribe();
  return () => {
    if (channel) void supabase.removeChannel(channel);
    channel = null;
  };
}

export async function sendRoomReaction(code: string, reaction: RoomReaction) {
  const supabase = getClient();
  const channel = supabase.channel(`pass_the_phone:room:${code.toUpperCase()}`, {
    config: { private: false, broadcast: { self: true } },
  });
  await channel.subscribe();
  await channel.send({ type: "broadcast", event: "reaction", payload: reaction });
  await supabase.removeChannel(channel);
}
