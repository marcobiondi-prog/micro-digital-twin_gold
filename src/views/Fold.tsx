import { Children, isValidElement, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Panels, TabRow } from "@/views/v8/console";
import { useTabSwipe } from "@/lib/use-tab-swipe";

type FoldProps = { id?: string; title: string; hint?: string; icon?: LucideIcon; children: ReactNode };

/** One section of a FoldTabs group: its title becomes a pill, its children the panel. */
export function Fold({ children }: FoldProps) {
  return <>{children}</>;
}

/** v8: the sections of a page as PS pill tabs, one open at a time (the first to start). */
export function FoldTabs({ children, label = "Altre sezioni", className }: { children: ReactNode; label?: string; className?: string }) {
  const folds = Children.toArray(children).filter((c): c is React.ReactElement<FoldProps> => isValidElement(c) && c.type === Fold).map((c, i) => ({ id: String(i), ...c.props }));
  const [open, setOpen] = useState("0");
  // A sideways swipe inside the sections turns them like slides; past the first or last it moves the page's tabs.
  const area = useRef<HTMLDivElement>(null);
  const swipe = useTabSwipe(folds.map((f) => f.id), open, setOpen, area);
  return (
    <div ref={area} className={className}>
      <TabRow label={label} items={folds.map((f) => ({ id: f.id, label: f.title, ...(f.icon ? { icon: f.icon } : {}) }))} value={open} onChange={setOpen} />
      <div ref={swipe.ref} className="dashboard-fold-body relative mt-3 grid gap-3 sm:gap-4" style={swipe.style}>
        <Panels value={open} peek={swipe.peek} peekSide={swipe.peekSide} peekTop={swipe.peekTop} panels={folds.map((f) => ({ id: f.id, content: <div className="grid gap-3 sm:gap-4">{f.children}</div> }))} />
      </div>
    </div>
  );
}
