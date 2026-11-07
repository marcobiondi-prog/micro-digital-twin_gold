import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, Download, KeyRound, Pencil, Plus, Radio, Trash2 } from "lucide-react";
import { Card } from "@/views/health";
import { Button } from "@/components/ui/button";
import { addManualReading, addMySensor, removeMySensor, renewSensorKey } from "@/controllers/sensors.functions";
import { setSensorPrefill, useMySensors, useSensorPrefill } from "@/lib/use-my-sensors";
import { KIND_LIST, SENSOR_KINDS, ageText, isFresh, valueText, type SensorFlow, type SensorKind, type SensorRow } from "@/models/sensor-devices";
import { useLab } from "@/models/lab-store";
import { drawnAreaFor } from "@/models/drawn-area";
import { ringCentroid } from "@/models/place-area";
import { cn } from "@/lib/utils";
import { CODE_FILE, curlCode, esp32Code, pythonCode, type CodeKind } from "@/models/sensor-code";

const ENDPOINT_PATH = "/api/public/sensor-readings";

/**
 * The key shown once, with the code a device needs already written with the app's address and this key: a test
 * command, an ESP32 sketch (the Wi-Fi name and password typed here go into it, never saved) and a Python script for a
 * Raspberry Pi — each to copy or download straight from the app.
 */
function KeyBox({ token, kind, onDone }: { token: string; kind: SensorKind; onDone: () => void }) {
  const url = typeof location !== "undefined" ? `${location.origin}${ENDPOINT_PATH}` : ENDPOINT_PATH;
  const [tab, setTab] = useState<CodeKind>("esp32");
  const [wifi, setWifi] = useState({ name: "", password: "" });
  const code = tab === "curl" ? curlCode(url, token, kind) : tab === "esp32" ? esp32Code(url, token, kind, wifi) : pythonCode(url, token, kind);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (what: string, text: string) => { void navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1500); }); };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
    a.download = CODE_FILE[tab];
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast.success(`${CODE_FILE[tab]} salvato in Download`);
  };
  const TABS: Array<[CodeKind, string]> = [["esp32", "ESP32"], ["python", "Raspberry Pi"], ["curl", "Prova veloce"]];
  return (
    <div className="space-y-2.5 rounded-xl border border-primary/40 bg-primary/5 p-3 text-xs">
      <p className="font-semibold text-foreground">Chiave del sensore · si vede solo ora</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-background/60 px-2 py-1.5 font-mono text-[11px]">{token}</code>
        <Button size="sm" variant="secondary" className="shrink-0 rounded-full" onClick={() => copy("key", token)}>{copied === "key" ? <Check className="size-4" /> : <Copy className="size-4" />}<span className="sr-only">Copia la chiave</span></Button>
      </div>
      <p className="font-semibold text-foreground">Il codice per il tuo sensore, già pronto</p>
      <p className="text-muted-foreground">Indirizzo dell’app e chiave sono già scritti dentro: scegli il dispositivo, poi copialo o scaricalo.</p>
      <div role="radiogroup" aria-label="Dispositivo" className="flex gap-1.5 overflow-x-auto" data-map-gestures>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={tab === k} onClick={() => setTab(k)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === k ? "bg-foreground text-background" : "bg-foreground/[0.08] text-foreground")}>{label}</button>
        ))}
      </div>
      {tab === "esp32" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-muted-foreground">Nome della rete Wi-Fi</span>
            <input value={wifi.name} onChange={(e) => setWifi((w) => ({ ...w, name: e.target.value }))} autoComplete="off" className="h-9 w-full rounded-lg border bg-background/60 px-2 text-xs" /></label>
          <label className="space-y-1"><span className="text-muted-foreground">Password del Wi-Fi</span>
            <input value={wifi.password} onChange={(e) => setWifi((w) => ({ ...w, password: e.target.value }))} type="password" autoComplete="off" className="h-9 w-full rounded-lg border bg-background/60 px-2 text-xs" /></label>
          <p className="text-muted-foreground sm:col-span-2">Servono solo a scriverle nel codice: l’app non le salva.</p>
        </div>
      )}
      <pre className="max-h-64 overflow-auto whitespace-pre rounded-lg bg-background/60 p-2 font-mono text-[10.5px] leading-snug" data-map-gestures>{code}</pre>
      <p className="text-muted-foreground">{tab === "esp32" ? "Apri Arduino IDE, incolla il codice (o apri il file scaricato), collega l’ESP32 e premi Carica. Nel Monitor seriale a 115200 vedi le letture inviate." : tab === "python" ? "Copia il file sul Raspberry (o su un computer, per la prova) e lancialo con python3: le istruzioni sono in cima al file." : "Incolla il comando nel Terminale del computer: se risponde \"ok\": true, il sensore nell’app diventa verde."}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" className="rounded-full" onClick={() => copy("code", code)}>{copied === "code" ? <><Check className="size-4" /> Copiato</> : <><Copy className="size-4" /> Copia il codice</>}</Button>
        <Button size="sm" variant="secondary" className="rounded-full" onClick={download}><Download className="size-4" /> Scarica</Button>
        <Button size="sm" className="rounded-full" onClick={onDone}>Fatto</Button>
      </div>
      <p className="text-muted-foreground">Dopo Fatto la chiave non si rivede: se serve di nuovo, tocca «Nuova chiave» sul sensore.</p>
    </div>
  );
}

function SensorItem({ s, onChanged }: { s: SensorRow; onChanged: () => void }) {
  const remove = useServerFn(removeMySensor), renew = useServerFn(renewSensorKey), manual = useServerFn(addManualReading);
  const [ask, setAsk] = useState<"delete" | "renew" | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const r = s.latest[s.kind] ?? Object.entries(s.latest).map(([k, v]) => ({ k: k as SensorKind, ...v! })).sort((a, b) => b.at.localeCompare(a.at))[0];
  const shownKind = (r && "k" in r ? r.k : s.kind) as SensorKind;
  const fresh = isFresh(s.last_seen_at);
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await f(); toast.success(ok); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "Non riuscito: controlla la connessione"); }
    setBusy(false);
  };
  return (
    <li className="rounded-xl bg-muted p-3 text-sm">
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", fresh ? "bg-emerald-400" : "bg-muted-foreground/40")} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{s.name}</p>
          <p className="text-xs text-muted-foreground">{SENSOR_KINDS[s.kind].label}{s.zone != null ? ` · Zona ${s.zone + 1}` : ""} · {fresh ? "in linea" : s.last_seen_at ? `ultima lettura ${ageText(s.last_seen_at)}` : "nessuna lettura ancora"}</p>
        </div>
        <span className="shrink-0 font-mono text-base font-semibold tabular-nums">{r ? valueText(shownKind, r.value) : "—"}</span>
      </div>
      {Object.keys(s.latest).length > 1 && (
        <p className="mt-1 pl-4 text-xs text-muted-foreground">{(Object.entries(s.latest) as Array<[SensorKind, { value: number; at: string }]>).map(([k, v]) => `${SENSOR_KINDS[k].label.split(" (")[0]} ${valueText(k, v.value)}`).join(" · ")}</p>
      )}
      {token && <div className="mt-2"><KeyBox token={token} kind={s.kind} onDone={() => setToken(null)} /></div>}
      {editing && (
        <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const v = Number(val.replace(",", ".")); if (!Number.isFinite(v)) return; void run(() => manual({ data: { id: s.id, kind: s.kind, value: v } }), "Lettura salvata").then(() => { setEditing(false); setVal(""); }); }}>
          <label className="sr-only" htmlFor={`m-${s.id}`}>Valore in {SENSOR_KINDS[s.kind].unit}</label>
          <input id={`m-${s.id}`} inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={`Valore (${SENSOR_KINDS[s.kind].unit})`} className="h-9 min-w-0 flex-1 rounded-full border border-input bg-background px-3 text-sm" autoFocus />
          <Button size="sm" type="submit" className="rounded-full" disabled={busy || !val}>Salva</Button>
          <Button size="sm" type="button" variant="ghost" className="rounded-full" onClick={() => setEditing(false)}>Annulla</Button>
        </form>
      )}
      {ask ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-background/50 p-2 text-xs" role="alertdialog" aria-label={ask === "delete" ? "Eliminare il sensore?" : "Rinnovare la chiave?"}>
          <span className="min-w-0 flex-1">{ask === "delete" ? "Eliminare il sensore e tutte le sue letture? Non si possono recuperare." : "Nuova chiave: quella vecchia smette di funzionare sul dispositivo."}</span>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setAsk(null)}>Annulla</Button>
          <Button size="sm" variant={ask === "delete" ? "destructive" : "default"} className="rounded-full" disabled={busy}
            onClick={() => { const a = ask; setAsk(null); if (a === "delete") void run(() => remove({ data: { id: s.id } }), "Sensore eliminato"); else void run(async () => { const r2 = await renew({ data: { id: s.id } }); setToken(r2.token); }, "Nuova chiave pronta"); }}>
            {ask === "delete" ? "Elimina" : "Rinnova"}
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
          <Button size="sm" variant="secondary" className="h-8 rounded-full text-xs" onClick={() => setEditing((e) => !e)}><Pencil className="size-3.5" /> Lettura a mano</Button>
          <Button size="sm" variant="secondary" className="h-8 rounded-full text-xs" onClick={() => setAsk("renew")}><KeyRound className="size-3.5" /> Nuova chiave</Button>
          <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs text-danger" onClick={() => setAsk("delete")}><Trash2 className="size-3.5" /> Elimina</Button>
        </div>
      )}
    </li>
  );
}

/**
 * "I tuoi sensori" (Sensori AI tab, signed in): the user's own thermal and other sensors for this project, each with its
 * latest reading and whether it is online; add one (at the area's middle, the place, or a suggested spot) and get the
 * key a device uses to send its readings, write a reading by hand, renew the key, delete. Fresh readings feed the simulation.
 */
export function MySensors({ kind }: { kind: "urban" | "vineyard" }) {
  const flow: SensorFlow = kind === "urban" ? "piazza" : "vigneto";
  const lab = useLab();
  const { sensors, real, ready, isLoading, isError, refresh } = useMySensors(flow);
  const add = useServerFn(addMySensor);
  const prefill = useSensorPrefill();
  const [form, setForm] = useState(false);
  const [name, setName] = useState("");
  const [sKind, setSKind] = useState<SensorKind>("temperatura");
  const [zone, setZone] = useState<number | null>(null);
  const [spot, setSpot] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [token, setToken] = useState<{ token: string; kind: SensorKind } | null>(null);
  const [busy, setBusy] = useState(false);

  const location = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  const area = drawnAreaFor(kind === "urban" ? lab.urban.area : lab.vineyard.area, location);
  const [cLat, cLng] = area ? ringCentroid(area.ring) : [location.lat, location.lng];

  useEffect(() => {
    if (!prefill || prefill.flow !== flow) return;
    setForm(true); setName(prefill.name); setSpot({ lat: prefill.lat, lng: prefill.lng, label: "Il punto suggerito" });
    setSensorPrefill(null);
    setTimeout(() => document.getElementById(`my-sensors-${flow}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [prefill, flow]);

  if (!real) return null;
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const p = spot ?? { lat: cLat, lng: cLng };
    try {
      const r = await add({ data: { flow, kind: sKind, name: name.trim(), lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), zone: kind === "vineyard" ? zone : null } });
      setToken({ token: r.token, kind: sKind }); setForm(false); setName(""); setSpot(null);
      toast.success("Sensore aggiunto");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Non riuscito: controlla la connessione"); }
    setBusy(false);
  };

  return (
    <div id={`my-sensors-${flow}`} className="scroll-mt-28"><Card className="space-y-3 border p-3 sm:p-5">
      <div className="flex items-center gap-2">
        <Radio className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="flex-1 text-sm font-semibold">I tuoi sensori</h3>
        {!form && ready && <Button size="sm" className="rounded-full" onClick={() => setForm(true)}><Plus className="size-4" /> Aggiungi</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Collega i tuoi sensori di temperatura, termici, di umidità o di vento: le loro letture delle ultime 2 ore entrano nella simulazione {kind === "urban" ? "della piazza" : "del vigneto"}.</p>
      {!ready && <p className="rounded-xl bg-warn/10 p-3 text-xs text-warn">I sensori non sono ancora attivi sul server.</p>}
      {isError && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-xs text-danger">Non riesco a leggere i tuoi sensori: controlla la connessione.</p>}
      {token && <KeyBox token={token.token} kind={token.kind} onDone={() => setToken(null)} />}
      {form && (
        <form className="space-y-3 rounded-xl bg-muted p-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="block text-xs font-semibold">Nome
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={kind === "urban" ? "Termometro sotto il pergolato" : "Sonda filare 3"} className="mt-1 h-10 w-full rounded-full border border-input bg-background px-3 text-sm font-normal" />
          </label>
          <fieldset className="min-w-0">
            <legend className="text-xs font-semibold">Cosa misura</legend>
            <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cosa misura">
              {KIND_LIST.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={sKind === k} onClick={() => setSKind(k)}
                  className={cn("max-w-full rounded-full px-3 py-1.5 text-left text-xs font-semibold", sKind === k ? "bg-foreground text-background" : "bg-background/60 text-muted-foreground")}>{SENSOR_KINDS[k].label}</button>
              ))}
            </div>
          </fieldset>
          {kind === "vineyard" && (
            <fieldset className="min-w-0">
              <legend className="text-xs font-semibold">Zona</legend>
              <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Zona">
                {[null, 0, 1, 2].map((z) => (
                  <button key={String(z)} type="button" role="radio" aria-checked={zone === z} onClick={() => setZone(z)}
                    className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", zone === z ? "bg-foreground text-background" : "bg-background/60 text-muted-foreground")}>{z === null ? "Tutto il vigneto" : `Zona ${z + 1}`}</button>
                ))}
              </div>
            </fieldset>
          )}
          <p className="text-xs text-muted-foreground">Posizione: {spot ? spot.label : area ? "il centro dell’area disegnata" : "il luogo della simulazione"} ({(spot?.lat ?? cLat).toFixed(5)}, {(spot?.lng ?? cLng).toFixed(5)})</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => { setForm(false); setSpot(null); }}>Annulla</Button>
            <Button type="submit" className="rounded-full" disabled={busy || !name.trim()}>{busy ? "Aggiungo…" : "Aggiungi sensore"}</Button>
          </div>
        </form>
      )}
      {isLoading ? <p className="text-xs text-muted-foreground">Leggo i tuoi sensori…</p> : sensors.length ? (
        <ul className="space-y-2">{sensors.map((s) => <SensorItem key={s.id} s={s} onChanged={refresh} />)}</ul>
      ) : ready && !form && !token ? <p className="text-xs text-muted-foreground">Nessun sensore ancora. Aggiungine uno, oppure parti da un punto suggerito qui sopra.</p> : null}
    </Card></div>
  );
}
