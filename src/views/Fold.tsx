import type { ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

/** Sezione a fisarmonica: una riga col titolo, il contenuto si apre al tocco (chiuso di partenza), una sola aperta per volta. */
export function Fold({ id, title, hint, icon: Icon, children }: { id?: string; title: string; hint?: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    // One open section at a time: opening one closes the others in the same list.
    <details id={id} className="dashboard-fold group scroll-mt-[calc(var(--nav-h)+5rem)]" onToggle={(e) => {
      const el = e.currentTarget;
      if (!el.open) return;
      el.parentElement?.querySelectorAll<HTMLDetailsElement>(":scope > details.dashboard-fold[open]").forEach((other) => { if (other !== el) other.open = false; });
    }}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm font-semibold shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate">{title}{hint && <span className="font-normal text-muted-foreground"> {hint}</span>}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="dashboard-fold-body mt-2 grid gap-3 sm:gap-4">{children}</div>
    </details>
  );
}
