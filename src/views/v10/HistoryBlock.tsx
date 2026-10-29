import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, Building2, Clock3, Cloud, Smartphone, Grape, History, Play, Trash2 } from "lucide-react";
import { currentMedia, useLabMedia, type MediaItem } from "@/models/lab-media-store";
import { mediaTime } from "@/models/media-time";
import { TabRow } from "@/views/v8/console";
import { useTabSwipe } from "@/lib/use-tab-swipe";
import { DashCard, DashSection } from "@/views/v10/Dashboard";
import { clearHistory, useHistory } from "@/lib/use-history";
import { groupByMonth, whenLabel, type HistoryEntry, type HistoryFlow, type HistorySource } from "@/models/intervention-history";

const day = (e: HistoryEntry) => new Date(e.at).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
/** When the intervention was made, on this device's clock: "09:12". */
const time = (e: HistoryEntry) => new Date(e.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

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

/** Recorded signed in (kept in the account) or without signing in (kept on this device). */
export function SourceChip({ source }: { source: HistorySource }) {
  const account = source === "account";
  const Icon = account ? Cloud : Smartphone;
  return (
    <span className={`mt-1.5 inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ${account ? "bg-brand-turquoise/15 text-brand-turquoise" : "bg-foreground/[0.08] text-muted-foreground"}`}>
      <Icon className="size-3.5" aria-hidden="true" />{account ? "Con accesso · account" : "Senza accesso · dispositivo"}
    </span>
  );
}

type Filter = "tutti" | HistoryFlow;
const FILTERS = [
  { id: "tutti", label: "Tutti", icon: History },
  { id: "piazza", label: "Piazza", icon: Building2 },
  { id: "vigneto", label: "Vigneto", icon: Grape },
] as const;
const OF: Record<HistoryFlow, string> = { piazza: "della piazza", vigneto: "del vigneto" };
/** On Benvenuto: the latest interventions and photos only; the Cronologia page shows them all. */
const COMPACT_ENTRIES = 5, COMPACT_SHOTS = 6;

/**
 * The history of the interventions (and the photos and videos of the simulations), shared by Benvenuto (compact: the
 * latest few, then "Apri la cronologia") and the Cronologia page (all of it, filtered by place, with "Cancella cronologia").
 * Each entry offers "Apri", which opens it on its own page to read (/cronologia/$id). Signed in it lives in the account, otherwise on this device.
 */
export function HistoryBlock({ compact = false }: { compact?: boolean }) {
  const { entries: all, where, loading, failed, reload } = useHistory();
  const [filter, setFilter] = useState<Filter>("tutti");
  // Only the full page has the filter to swipe: on Benvenuto the swipe listens to a ref that stays empty.
  const area = useRef<HTMLDivElement>(null), none = useRef<HTMLDivElement>(null);
  const track = useTabSwipe(FILTERS.map((f) => f.id), filter, setFilter, compact ? none : area);
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  useEffect(() => { setConfirm(false); }, [filter]);
  const urban = useLabMedia("urban"), vineyard = useLabMedia("vineyard");
  useEffect(() => { void currentMedia("urban"); void currentMedia("vineyard"); }, []);
  const allShots = useMemo<Shot[]>(() => [
    ...urban.map((m): Shot => ({ ...m, flow: "piazza", at: mediaTime(m) })),
    ...vineyard.map((m): Shot => ({ ...m, flow: "vigneto", at: mediaTime(m) })),
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)), [urban, vineyard]);
  const shown = (flow: HistoryFlow) => compact || filter === "tutti" || filter === flow;
  const entries = all.filter((e) => shown(e.flow));
  const shots = allShots.filter((s) => shown(s.flow));
  const groups = groupByMonth(compact ? entries.slice(0, COMPACT_ENTRIES) : entries);
  const visibleShots = compact ? shots.slice(0, COMPACT_SHOTS) : shots;
  const more = compact && (all.length > COMPACT_ENTRIES || allShots.length > COMPACT_SHOTS || all.length > 0);
  const clear = async () => {
    setClearing(true);
    const ok = await clearHistory(filter === "tutti" ? undefined : filter);
    setClearing(false);
    setConfirm(false);
    reload();
    if (ok) toast.success(filter === "tutti" ? "Cronologia cancellata" : `Cronologia ${OF[filter]} cancellata`);
    else toast.error("Cancellata da questo dispositivo, non dal tuo account: riprova più tardi");
  };
  return (
    <DashSection title={compact ? "Cronologia" : "Tutti gli interventi"} hint={where === "account" ? (all.some((e) => e.source === "device") ? "Account e questo dispositivo" : "Salvata nel tuo account") : "Salvata su questo dispositivo"}>
      <div ref={area} className="space-y-3">
      {!compact && <TabRow label="Luogo" items={FILTERS} value={filter} onChange={(v) => setFilter(v as Filter)} />}
      {/* Tutti · Piazza · Vigneto turn with a sideways swipe on the list, like the tutorial's screens. */}
      <div style={track} className="space-y-3">
      {failed && <DashCard><p className="text-sm text-muted-foreground">Non riesco a leggere la cronologia del tuo account. Vedi solo quella di questo dispositivo.</p></DashCard>}
      {visibleShots.length > 0 && (
        <div className="space-y-2">
          <h3 className="px-1 text-sm font-medium text-muted-foreground">Foto e video{compact && shots.length > visibleShots.length ? ` · ultimi ${visibleShots.length} di ${shots.length}` : ""}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">{visibleShots.map((s) => <Thumb key={`${s.flow}-${s.id}`} s={s} />)}</div>
        </div>
      )}
      {groups.length === 0 ? visibleShots.length > 0 ? null : (
        <DashCard className="flex flex-col items-center gap-2 py-8 text-center">
          <History className="size-7 text-muted-foreground" aria-hidden="true" />
          <p className="text-[15px] font-medium">{loading ? "Carico la cronologia…" : filter === "tutti" ? "Ancora nessun intervento" : `Ancora nessun intervento ${filter === "piazza" ? "nella piazza" : "nel vigneto"}`}</p>
          {!loading && <p className="max-w-xs text-sm text-muted-foreground">Quando cambi alberi, prato, ombra o irrigazione nella simulazione, l’intervento si registra da solo e lo trovi qui, con foto e video.</p>}
        </DashCard>
      ) : groups.map((g) => (
        <div key={g.key} className="space-y-2">
          <h3 className="px-1 text-sm font-medium capitalize text-muted-foreground">{g.label}</h3>
          <DashCard className="divide-y divide-foreground/10 py-1 sm:py-1">
            {g.items.map((e) => (
              <div key={e.id} className="flex gap-3 py-3">
                <span className="flex w-14 shrink-0 flex-col text-sm tabular-nums text-muted-foreground">
                  <span>{day(e)}</span>
                  <span className="text-xs" aria-label={`alle ${time(e)}`}>{time(e)}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[15px] leading-snug">{e.text}</p>
                  {whenLabel(e) && <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground/80"><Clock3 className="size-3.5" aria-hidden="true" />Simulato: {whenLabel(e)}</p>}
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.flow === "piazza" ? "Piazza" : "Vigneto"}{e.place ? ` · ${e.place}` : ""}</p>
                  <SourceChip source={e.source} />
                </div>
                <Link to="/cronologia/$id" params={{ id: e.id }} aria-label={`Apri: ${e.text}`}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 self-center rounded-full bg-foreground/[0.08] pl-3.5 pr-3 text-sm font-semibold outline-none hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring">
                  Apri<ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            ))}
          </DashCard>
        </div>
      ))}
      {more && (
        <Link to="/cronologia" className="flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Apri la cronologia{all.length > 0 ? ` · ${all.length} ${all.length === 1 ? "intervento" : "interventi"}` : ""}<ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
      {!compact && entries.length > 0 && (
        // Only where this tab lists interventions, and it empties just those (all of them on Tutti).
        // Asks once in place (no browser dialog): the account's history is gone for good.
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2" role={confirm ? "alertdialog" : undefined} aria-label={confirm ? "Cancellare la cronologia?" : undefined}>
          {confirm ? (
            <>
              <span className="w-full text-center text-sm text-muted-foreground">{`Cancello ${filter === "tutti" ? "tutta la cronologia" : `la cronologia ${OF[filter]}`}${where === "account" ? ", anche dal tuo account" : " di questo dispositivo"}?`}</span>
              <button type="button" onClick={() => setConfirm(false)} disabled={clearing} className="inline-flex h-10 items-center rounded-full bg-foreground/[0.08] px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Annulla</button>
              <button type="button" onClick={() => void clear()} disabled={clearing} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-danger px-4 text-sm font-semibold text-danger-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                <Trash2 className="size-4" aria-hidden="true" />{clearing ? "Cancello…" : "Cancella"}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <Trash2 className="size-4" aria-hidden="true" />{filter === "tutti" ? "Cancella cronologia" : `Cancella cronologia ${OF[filter]}`}
            </button>
          )}
        </div>
      )}
      </div>
      </div>
    </DashSection>
  );
}
