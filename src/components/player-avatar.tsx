import type { Player } from "@/types/game";

export function PlayerAvatar({ player, size = 44 }: { player: Pick<Player, "name" | "color">; size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-2xl font-black text-white shadow-lg"
      style={{ width: size, height: size, background: player.color }}
      title={player.name}
      aria-label={player.name}
    >
      {player.name.trim().slice(0, 2).toUpperCase()}
    </div>
  );
}
