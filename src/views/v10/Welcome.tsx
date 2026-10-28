import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Grape, History, Play } from "lucide-react";
import { currentMedia, useLabMedia, type MediaItem } from "@/models/lab-media-store";
import { mediaTime } from "@/models/media-time";
import { Ambient, PageHero, openSimTab } from "@/views/v8/console";
import { DashCard, DashSection } from "@/views/v10/Dashboard";
import { useHistory } from "@/lib/use-history";
import { groupByMonth, type HistoryEntry } from "@/models/intervention-history";

const TONE = "rgb(40 130 120 / 0.40)";

const day = (e: HistoryEntry) => new Date(e.at).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

type Shot = MediaItem & { flow: "piazza" | "vigneto"; at: number | null };

function Thumb({ s }: { s: Shot }) {
  const when = s.at ? new Date(s.at).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "";
  return (
    <a href={s.url} target="_blank" rel="noreferrer" aria-label={`${s.kind === "video" ? "Video" : "Foto"} ${s.flow}${when ? `, ${when}` : ""}`} className="relative block aspect-square overflow-hidden rounded-2xl bg-foreground/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {s.kind === "video" ? <video src={s.url} preload="metadata" muted playsInline className="size-full object-cover" /> : <img src={s.url} alt="" loading="lazy" className="size-full object-cover" />}
      {s.kind === "video" && <span className="absolute inset-0 grid place-items-center"><Play className="size-7 text-white drop-shadow" aria-hidden="true" /></span>}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-5 text-xs text-white">{s.flow === "piazza" ? "Piazza" : "Vigneto"}{when ? ` · ${when}` : ""}</span>
    </a>
  );
}

function Start({ to, icon: Icon, title, text }: { to: "/urbano" | "/vigneto"; icon: typeof Building2; title: string; text: string }) {
  return (
    <Link to={to} onClick={() => openSimTab(to === "/urbano" ? "urban" : "vineyard", "simula")} className="group flex min-h-24 min-w-0 flex-1 flex-col justify-between gap-3 rounded-3xl bg-foreground/[0.05] p-4 outline-none transition-colors hover:bg-foreground/[0.09] focus-visible:ring-2 focus-visible:ring-ring">
      <Icon className="size-6" aria-hidden="true" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-base font-semibold">{title}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
        <span className="block text-sm text-muted-foreground">{text}</span>
      </span>
    </Link>
  );
}

/** The page after the intro: where to start, then every intervention recorded so far. */
export function Welcome() {
  const { entries, where, loading, failed } = useHistory();
  const urban = useLabMedia("urban"), vineyard = useLabMedia("vineyard");
  useEffect(() => { void currentMedia("urban"); void currentMedia("vineyard"); }, []);
  const shots = useMemo<Shot[]>(() => [
    ...urban.map((m): Shot => ({ ...m, flow: "piazza", at: mediaTime(m) })),
    ...vineyard.map((m): Shot => ({ ...m, flow: "vigneto", at: mediaTime(m) })),
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)), [urban, vineyard]);
  const groups = groupByMonth(entries);
  return (
    <div className="space-y-6">
      <Ambient tone={TONE} />
      <PageHero kicker="Micro Digital Twin" title="Benvenuto" />
      <p className="text-[15px] leading-relaxed text-muted-foreground">Scegli da dove partire. Qui sotto trovi tutti gli interventi che hai registrato.</p>
      <div className="flex gap-3">
        <Start to="/urbano" icon={Building2} title="Piazza" text="Prova gli interventi in città" />
        <Start to="/vigneto" icon={Grape} title="Vigneto" text="Prova gli interventi in vigna" />
      </div>
      <DashSection title="Cronologia" hint={where === "account" ? "Salvata nel tuo account" : "Salvata su questo dispositivo"}>
        {failed && <DashCard><p className="text-sm text-muted-foreground">Non riesco a leggere la cronologia del tuo account. Vedi solo quella di questo dispositivo.</p></DashCard>}
        {shots.length > 0 && (
          <div className="space-y-2">
            <h3 className="px-1 text-sm font-medium text-muted-foreground">Foto e video</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">{shots.map((s) => <Thumb key={`${s.flow}-${s.id}`} s={s} />)}</div>
          </div>
        )}
        {groups.length === 0 ? shots.length > 0 ? null : (
          <DashCard className="flex flex-col items-center gap-2 py-8 text-center">
            <History className="size-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-[15px] font-medium">{loading ? "Carico la cronologia…" : "Ancora nessun intervento"}</p>
            {!loading && <p className="max-w-xs text-sm text-muted-foreground">Quando cambi alberi, prato, ombra o irrigazione nella simulazione, l’intervento si registra da solo e lo trovi qui, con foto e video.</p>}
          </DashCard>
        ) : groups.map((g) => (
          <div key={g.key} className="space-y-2">
            <h3 className="px-1 text-sm font-medium capitalize text-muted-foreground">{g.label}</h3>
            <DashCard className="divide-y divide-foreground/10 py-1 sm:py-1">
              {g.items.map((e) => (
                <div key={e.id} className="flex gap-3 py-3">
                  <span className="w-14 shrink-0 text-sm tabular-nums text-muted-foreground">{day(e)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] leading-snug">{e.text}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.flow === "piazza" ? "Piazza" : "Vigneto"}{e.place ? ` · ${e.place}` : ""}</p>
                  </div>
                </div>
              ))}
            </DashCard>
          </div>
        ))}
      </DashSection>
    </div>
  );
}
