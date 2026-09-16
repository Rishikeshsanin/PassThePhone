import { Minus, Plus } from "lucide-react";

export function HeatControl({
  value,
  onChange,
  compact = false,
}: {
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  const set = (next: number) => onChange(Math.max(1, Math.min(5, next)));
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      <button type="button" aria-label="Decrease heat" className="btn btn-secondary !min-h-11 !w-11 !p-0" onClick={() => set(value - 1)} disabled={value <= 1}>
        <Minus size={18} />
      </button>
      <div className="min-w-[120px] text-center">
        <div className="text-lg tracking-[.12em]" aria-label={`Heat level ${value} of 5`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={i < value ? "opacity-100" : "opacity-20"}>🔥</span>
          ))}
        </div>
        {!compact && <div className="mt-1 text-xs text-white/45">Heat {value}/5</div>}
      </div>
      <button type="button" aria-label="Increase heat" className="btn btn-secondary !min-h-11 !w-11 !p-0" onClick={() => set(value + 1)} disabled={value >= 5}>
        <Plus size={18} />
      </button>
    </div>
  );
}
