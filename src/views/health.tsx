import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Ring({ value, max = 100, size = 120, stroke = 12, color = "var(--primary)", children }: { value: number; max?: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    setAnimatedPct(0);
    let targetFrame = 0;
    const resetFrame = window.requestAnimationFrame(() => {
      targetFrame = window.requestAnimationFrame(() => setAnimatedPct(pct));
    });
    return () => {
      window.cancelAnimationFrame(resetFrame);
      window.cancelAnimationFrame(targetFrame);
    };
  }, [pct]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`Indicatore circolare: ${Math.round(pct * 100)}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--muted)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - animatedPct)} className="ring-progress" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card-soft p-5", className)}>{children}</div>;
}

export function Metric({ label, value, unit, color, hint, children }: { label: string; value: ReactNode; unit?: string; color?: string; hint?: string; children?: ReactNode }) {
  return (
    <Card className="lift">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-3xl font-semibold" style={{ color }}>{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      {children}
    </Card>
  );
}

const levelMap: Record<string, string> = {
  basso: "bg-ok/15 text-ok", bassa: "bg-ok/15 text-ok", breve: "bg-ok/15 text-ok", ok: "bg-ok/15 text-ok",
  moderato: "bg-warn/20 text-warn", medio: "bg-warn/20 text-warn", media: "bg-warn/20 text-warn",
  elevato: "bg-danger/15 text-danger", alto: "bg-danger/15 text-danger", alta: "bg-danger/15 text-danger", lungo: "bg-danger/15 text-danger",
};
export function StatusBadge({ level, children }: { level: string; children?: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", levelMap[level] ?? "bg-muted text-muted-foreground")}>
    <span className="size-1.5 rounded-full bg-current" />{children ?? level}
  </span>;
}

export function levelColor(v: number) {
  return v < 35 ? "var(--ok)" : v < 65 ? "var(--warn)" : "var(--danger)";
}

export function SectionTitle({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="mb-6">
      <div className="text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</div>
      <h2 className="mt-1 text-3xl font-semibold md:text-4xl">{title}</h2>
      {desc && <p className="mt-2 max-w-2xl text-muted-foreground">{desc}</p>}
    </div>
  );
}

export function Pills<T extends string>({ options, value, onChange, className }: { options: readonly T[]; value: T; onChange: (v: T) => void; className?: string }) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [value]);

  return (
    <div className={cn("no-scrollbar flex w-full max-w-full snap-x snap-mandatory flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-muted p-1 touch-pan-x sm:w-fit dark:gap-3 dark:bg-transparent dark:p-0", className)}>
      {options.map((o) => (
        <Button key={o} ref={value === o ? activeRef : undefined} type="button" variant="ghost" onClick={() => onChange(o)}
          className={cn("h-auto shrink-0 snap-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium shadow-none transition-all", value === o ? "bg-card text-foreground shadow-sm hover:bg-card dark:bg-secondary dark:hover:bg-secondary" : "text-muted-foreground hover:text-foreground dark:text-foreground", "dark:px-5 dark:py-2 dark:font-semibold")}>
          {o}
        </Button>
      ))}
    </div>
  );
}
