export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-mark" aria-hidden="true">P</div>
      {!compact && (
        <div>
          <div className="text-[15px] font-black tracking-[-0.02em]">PassThePhone</div>
          <div className="text-[11px] text-white/45">Pick someone. Pass the turn.</div>
        </div>
      )}
    </div>
  );
}
