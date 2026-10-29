import { createContext, useContext, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { openAccount } from "@/lib/camera-dock";

/** The account panel's pages. */
export type InfoPath = "/piani" | "/chi-siamo" | "/faq" | "/contatti" | "/privacy/cookie" | "/privacy/informativa" | "/privacy/preferenze" | "/legale/licenze" | "/legale/termini";

/**
 * Set by the account panel when it shows a page inside itself: back returns to the panel's list (the panel stays open)
 * and links between pages open the other page in place.
 */
export const InfoNav = createContext<{ back: () => void; open: (to: InfoPath) => void } | null>(null);

/** A link to another account page: inside the panel it opens there, on its own route it navigates. */
export function PageLink({ to, children }: { to: InfoPath; children: ReactNode }) {
  const nav = useContext(InfoNav);
  const cls = "font-semibold underline underline-offset-4";
  return nav ? <button type="button" onClick={() => nav.open(to)} className={cls}>{children}</button> : <Link to={to} className={cls}>{children}</Link>;
}

/**
 * A plain reading page opened from the account panel (FAQ, privacy, legal): a back arrow and a title on top,
 * then the text in cards. The arrow goes back to the page it came from (the welcome page when opened directly) with the account panel open.
 */
export function InfoPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  const nav = useContext(InfoNav);
  // These pages are opened from the account panel: the arrow goes back and opens the panel again, to pick another one.
  const back = nav ? nav.back : () => {
    if ((window.history.state?.__TSR_index ?? 0) > 0) window.history.back();
    else void navigate({ to: "/benvenuto", replace: true });
    window.setTimeout(openAccount, 350);
  };
  return (
    <article className={nav ? "space-y-4" : "mx-auto max-w-2xl space-y-4"}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={back} aria-label="Indietro" className="grid size-11 shrink-0 place-items-center rounded-full outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="size-6" aria-hidden="true" />
        </button>
        <h1 className={nav ? "min-w-0 font-display text-2xl font-light tracking-tight" : "min-w-0 font-display text-3xl font-light tracking-tight sm:text-4xl"}>{title}</h1>
      </div>
      {intro && <p className="text-[15.5px] leading-relaxed text-muted-foreground">{intro}</p>}
      {children}
    </article>
  );
}

/** One card of text with a bold heading. */
export function InfoCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-3xl bg-foreground/[0.05] p-5 text-[15.5px] leading-relaxed">
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      <div className="space-y-3 text-foreground/85 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{children}</div>
    </section>
  );
}

/** A question that opens in place (native details, so it works with the keyboard and screen readers). */
export function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-3xl bg-foreground/[0.05] [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-3xl px-5 py-3 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1">{q}</span>
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-lg leading-none transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden="true">+</span>
      </summary>
      <div className="space-y-2 px-5 pb-5 text-[15.5px] leading-relaxed text-foreground/85 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
    </details>
  );
}
