import type { GameCategory } from "@/types/game";

const labels: Record<GameCategory, { label: string; emoji: string }> = {
  classic: { label: "Classic", emoji: "⭐" },
  funny: { label: "Funny", emoji: "😂" },
  wholesome: { label: "Wholesome", emoji: "❤️" },
  personal: { label: "Personal", emoji: "👀" },
  dark: { label: "Dark", emoji: "💀" },
  adult: { label: "18+", emoji: "🔞" },
  fantasy: { label: "Fantasy", emoji: "🌌" },
  popular: { label: "Popular", emoji: "🔥" },
};

export function CategoryChip({
  category,
  selected,
  onClick,
}: {
  category: GameCategory;
  selected?: boolean;
  onClick?: () => void;
}) {
  const value = labels[category];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition ${
        selected
          ? "border-violet-400/60 bg-violet-500/15 text-white"
          : "border-white/10 bg-white/[.035] text-white/70 hover:bg-white/[.06]"
      }`}
    >
      <span className="mr-2">{value.emoji}</span>
      <span className="font-bold">{value.label}</span>
    </button>
  );
}
