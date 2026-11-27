import { useEffect, useState, useSyncExternalStore } from "react";
import { describeChange } from "@/models/live-edit";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { focusProjectArea } from "@/lib/gps-hold";
import { applyProjectState, getLab, isLabReadOnly, onLabEdit, onReadOnlyRefused, setLabReadOnly } from "@/models/lab-store";
import { placeOf, projectName, projectSlice, syncStep, type ProjectKind, type SyncMeta } from "@/models/project-state";

/**
 * Progetti condivisi · fase 0: the simulation in the account (table projects, supabase/migrations/20261127000000_projects.sql).
 * Signed in, each kind (piazza, vigneto) has a project in the cloud: made from the device the first time, read back on
 * opening, on sign-in, on return to the app and when the connection comes back, written 1 s after the last edit. Without
 * the table nothing changes (all stays on the device as before). Guests keep everything on the device.
 */
const META_KEY = "mdt-project-sync-v1";
const EDIT_KEY = "mdt-project-edited-v1";
const KINDS: ProjectKind[] = ["piazza", "vigneto"];
const table = () => (supabase as unknown as { from: (t: string) => any }).from("projects"); // eslint-disable-line @typescript-eslint/no-explicit-any

type Store = Record<string, Partial<Record<ProjectKind, SyncMeta>>>;
const read = <T,>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(k) ?? "null") as T) ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };
const metaOf = (user: string, kind: ProjectKind) => read<Store>(META_KEY, {})[user]?.[kind];
const metaSubs = new Set<() => void>();
function setMeta(user: string, kind: ProjectKind, m: SyncMeta) { const s = read<Store>(META_KEY, {}); s[user] = { ...s[user], [kind]: m }; write(META_KEY, s); metaSubs.forEach((f) => f()); }
const editedAt = (kind: ProjectKind) => read<Partial<Record<ProjectKind, number>>>(EDIT_KEY, {})[kind] ?? 0;
function markEdited(kind: ProjectKind) { write(EDIT_KEY, { ...read(EDIT_KEY, {}), [kind]: Date.now() }); }

/** The project in use for a kind, for other modules (phase 1: sharing). */
export function currentProjectId(user: string, kind: ProjectKind): string | undefined { return metaOf(user, kind)?.id; }

/** Switches a kind to a project shared with this account (an invite accepted): its simulation comes down at once. */
export async function openSharedProject(kind: ProjectKind, id: string): Promise<void> {
  const user = await userId();
  if (!user) return;
  setMeta(user, kind, { id, shared: true });
  await syncProject(kind, { announce: false });
}

/** The signed-in account and its project of a kind, kept up to date (null id while none exists yet). */
export function useCurrentProject(kind: ProjectKind): { user: string | null; id: string | null } {
  const [state, setState] = useState<{ user: string | null; id: string | null }>({ user: null, id: null });
  useEffect(() => {
    let alive = true;
    const refresh = async () => { const user = await userId(); if (alive) setState({ user, id: user ? metaOf(user, kind)?.id ?? null : null }); };
    void refresh();
    metaSubs.add(refresh);
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => { alive = false; metaSubs.delete(refresh); data.subscription.unsubscribe(); };
  }, [kind]);
  return state;
}

/**
 * Whether the project in use for a kind is someone else's shared with this account (undefined while not read yet). An
 * invitee of the other sector — an officer invited to a vineyard — opens that simulation through it.
 */
export function useSharedOpen(kind: ProjectKind): boolean | undefined {
  const [state, setState] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const refresh = async () => { const user = await userId(); if (alive) setState(!!(user && metaOf(user, kind)?.shared)); };
    void refresh();
    metaSubs.add(refresh);
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => { alive = false; metaSubs.delete(refresh); data.subscription.unsubscribe(); };
  }, [kind]);
  return state;
}

let missing = false;
const busy = new Set<ProjectKind>();
type Row = { id: string; state: Record<string, unknown>; updated_at: string };

let lastUser: string | null = null;
async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  lastUser = data.session?.user.id ?? null;
  return lastUser;
}

/** Read at once (no wait): the project of this kind in use is someone else's, shared with this account. */
export function sharedNow(kind: ProjectKind): boolean {
  const user = lastUser ?? storedUser();
  return !!(user && metaOf(user, kind)?.shared);
}
/** The signed-in account as the auth library keeps it on the device, before its first read. */
function storedUser(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.*-auth-token$/.test(k)) continue;
      const id = (JSON.parse(localStorage.getItem(k) ?? "null") as { user?: { id?: string } } | null)?.user?.id;
      if (id) return id;
    }
  } catch { /* storage unavailable */ }
  return null;
}

/** Brings one kind in step with the account. */
export async function syncProject(kind: ProjectKind, opts: { announce?: boolean; by?: "colleague" } = {}): Promise<void> {
  if (missing || busy.has(kind) || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  const user = await userId();
  if (!user) { setLabReadOnly(kind, false); return; }
  busy.add(kind);
  try {
    const meta = metaOf(user, kind);
    let row: Row | null = null;
    if (meta?.id) {
      const { data, error } = await table().select("id, state, updated_at").eq("id", meta.id).maybeSingle();
      if (error) return void checkMissing(error);
      row = (data as Row | null) ?? null;
    }
    if (!row) {
      const { data, error } = await table().select("id, state, updated_at").eq("kind", kind).order("updated_at", { ascending: false }).limit(1);
      if (error) return void checkMissing(error);
      row = (data as Row[] | null)?.[0] ?? null;
    }
    // The account's role in it: a viewer only looks (its edits are refused and nothing goes up).
    let viewer = false, shared = false;
    if (row) {
      const { data: role } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }> }).rpc("project_role", { p: row.id });
      viewer = role === "viewer";
      // Someone else's project, shared with this account: it opens even outside this profile's own sector.
      shared = role === "viewer" || role === "editor";
    }
    setLabReadOnly(kind, viewer);
    const lab = getLab();
    const place = placeOf(kind, lab);
    const known = row && meta?.id === row.id ? meta : undefined;
    const step = syncStep({ meta: known, editedAt: editedAt(kind), remoteAt: row?.updated_at ?? null, pending: !!place.pending });
    if (step === "create") {
      const { data, error } = await table().insert({ kind, name: projectName(place.label), place, state: projectSlice(kind, lab) }).select("id, updated_at").single();
      if (error) return void checkMissing(error);
      setMeta(user, kind, { id: data.id, known: data.updated_at, syncedAt: Date.now(), shared: false });
      if (opts.announce !== false) toast.success(kind === "piazza" ? "La piazza ora è nel tuo account" : "Il vigneto ora è nel tuo account", { description: "La ritrovi su ogni telefono o computer con cui entri." });
    } else if (step === "push" && row && viewer) {
      // Edits made here before becoming a viewer never go up: the project comes down instead.
      if (row.state && Object.keys(row.state).length) applyProjectState(kind, row.state);
      setMeta(user, kind, { id: row.id, known: row.updated_at, syncedAt: Date.now(), shared });
    } else if (step === "push" && row) {
      const { data, error } = await table().update({ name: projectName(place.label), place, state: projectSlice(kind, lab) }).eq("id", row.id).select("updated_at").single();
      if (error) return void checkMissing(error);
      setMeta(user, kind, { id: row.id, known: data.updated_at, syncedAt: Date.now(), shared });
    } else if (step === "pull" && row) {
      const changed = JSON.stringify(row.state) !== JSON.stringify(projectSlice(kind, lab));
      if (row.state && Object.keys(row.state).length) applyProjectState(kind, row.state);
      setMeta(user, kind, { id: row.id, known: row.updated_at, syncedAt: Date.now(), shared });
      if (changed && opts.announce !== false) {
        if (opts.by === "colleague") {
          // Whoever is working on it, the others' maps come to the area of intervention to see the changes.
          focusProjectArea();
          toast(kind === "piazza" ? "Piazza aggiornata da un collaboratore" : "Vigneto aggiornato da un collaboratore", { id: `mdt-colleague-${kind}`, description: "Ti porto sull’area d’intervento: vedi le sue modifiche in diretta." });
        }
        else toast(kind === "piazza" ? "Piazza aggiornata dal tuo account" : "Vigneto aggiornato dal tuo account", { description: "Hai ritrovato le modifiche fatte su un altro dispositivo." });
      }
    } else if (row && !known) {
      setMeta(user, kind, { id: row.id, known: row.updated_at, syncedAt: Date.now(), shared });
    }
  } catch { /* offline or refused: tried again later */ } finally { busy.delete(kind); }
}

function checkMissing(error: { code?: string; message?: string }) {
  if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "")) missing = true;
}

export function syncAllProjects(announce = true) { for (const k of KINDS) void syncProject(k, { announce }); }

/** Mounted once by the root. */
export function useProjectSync() {
  useEffect(() => {
    const timers: Partial<Record<ProjectKind, number>> = {};
    let saidAt = 0;
    onReadOnlyRefused((kind) => {
      if (Date.now() - saidAt < 4000) return;
      saidAt = Date.now();
      toast(kind === "piazza" ? "Piazza in solo visione" : "Vigneto in solo visione", { id: "mdt-viewer", description: "Puoi guardare il progetto ma non modificarlo: chiedi al proprietario di poter modificare." });
    });
    // The live channels follow the projects in use (a project made, an invite accepted, a sign-in).
    void refreshLive();
    const onMeta = () => void refreshLive();
    metaSubs.add(onMeta);
    const offEdit = onLabEdit((kind) => {
      broadcastEdit(kind);
      markEdited(kind);
      window.clearTimeout(timers[kind]);
      timers[kind] = window.setTimeout(() => void syncProject(kind), 1000);
    });
    const start = window.setTimeout(() => syncAllProjects(), 1500);
    // In diretta: a colleague's save to one of this account's projects comes down by itself (RLS: members only).
    let me: string | null = null;
    void userId().then((u) => { me = u; });
    const live = supabase.channel("mdt-projects-live").on("postgres_changes" as never, { event: "UPDATE", schema: "public", table: "projects" } as never, (payload: { new?: { id?: string; kind?: ProjectKind; updated_by?: string } }) => {
      const row = payload.new;
      if (!row?.id || !row.kind || !me || row.updated_by === me) return;
      if (metaOf(me, row.kind)?.id !== row.id) return;
      void syncProject(row.kind, { announce: true, by: "colleague" });
    }).subscribe();
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN") { missing = false; window.setTimeout(() => syncAllProjects(), 800); } void refreshLive(); });
    const back = () => { if (document.visibilityState === "visible") syncAllProjects(); };
    const online = () => syncAllProjects();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", online);
    return () => {
      onReadOnlyRefused(null); offEdit(); metaSubs.delete(onMeta); for (const k of KINDS) { const l = lives[k]; if (l) { void supabase.removeChannel(l.ch); delete lives[k]; } } window.clearTimeout(start); data.subscription.unsubscribe(); void supabase.removeChannel(live);
      Object.values(timers).forEach((t) => window.clearTimeout(t));
      document.removeEventListener("visibilitychange", back); window.removeEventListener("online", online);
    };
  }, []);
}

/**
 * In tempo reale: each edit to a shared project also goes at once (at most every 350 ms) to the others connected to it
 * through a Realtime broadcast on "live:<project>", so they see the interventions change on their map as they happen —
 * the saved project follows 1 s later as before. Who changed what, and where on the map, is kept for a few seconds
 * (useLiveEdit) for the map to show it.
 */
export type LiveEdit = { kind: ProjectKind; by: string; name: string; what: string; at: [number, number] | null; time: number };
let liveEdit: LiveEdit | null = null;
const liveSubs = new Set<() => void>();
let liveTimer: ReturnType<typeof setTimeout> | null = null;
function setLiveEdit(e: LiveEdit | null) {
  liveEdit = e; liveSubs.forEach((f) => f());
  if (liveTimer) clearTimeout(liveTimer);
  if (e) liveTimer = setTimeout(() => setLiveEdit(null), LIVE_SHOW_MS);
}
const LIVE_SHOW_MS = 7000;
// Dev only: window.__mdtDrag(kind, payload) shows a colleague's drag.
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __mdtDrag?: (k: ProjectKind, p: unknown) => void }).__mdtDrag = (k, p) => onRemoteDrag(k, p as Parameters<typeof onRemoteDrag>[1]);
// Dev only: the screenshot scripts show a colleague's change (Realtime cannot be mocked there).
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __mdtLiveEdit?: typeof setLiveEdit }).__mdtLiveEdit = setLiveEdit;
export function useLiveEdit(kind: ProjectKind): LiveEdit | null {
  const e = useSyncExternalStore((f) => { liveSubs.add(f); return () => { liveSubs.delete(f); }; }, () => liveEdit, () => null);
  return e && e.kind === kind ? e : null;
}

type Live = { id: string; ch: ReturnType<typeof supabase.channel>; ready: boolean };
const lives: Partial<Record<ProjectKind, Live>> = {};
let me: { id: string; name: string } | null = null;
let focusedAt = 0;

async function refreshLive() {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  me = u ? { id: u.id, name: String((u.user_metadata ?? {})["full_name"] ?? (u.user_metadata ?? {})["name"] ?? (u.email ?? "").split("@")[0] ?? "") } : null;
  for (const kind of KINDS) {
    const id = u ? metaOf(u.id, kind)?.id ?? null : null;
    const cur = lives[kind];
    if (cur && cur.id === id) continue;
    if (cur) { void supabase.removeChannel(cur.ch); delete lives[kind]; }
    if (!id) continue;
    const ch = supabase.channel(`live:${id}`, { config: { broadcast: { self: false } } });
    const live: Live = { id, ch, ready: false };
    lives[kind] = live;
    ch.on("broadcast", { event: "state" }, ({ payload }: { payload: { by?: { id: string; name: string }; state?: Record<string, unknown> } }) => {
      if (!payload?.state || !payload.by || payload.by.id === me?.id) return;
      const before = projectSlice(kind, getLab());
      const change = describeChange(before, payload.state);
      applyProjectState(kind, payload.state);
      if (!change) return;
      setLiveEdit({ kind, by: payload.by.id, name: payload.by.name, what: change.what, at: change.at, time: Date.now() });
      // The first change after a while brings the map to the area of intervention (not at every drag).
      if (Date.now() - focusedAt > 60_000) { focusedAt = Date.now(); focusProjectArea(); }
    }).on("broadcast", { event: "drag" }, ({ payload }: { payload: Parameters<typeof onRemoteDrag>[1] }) => onRemoteDrag(kind, payload))
      .subscribe((status) => { live.ready = status === "SUBSCRIBED"; });
  }
}

const sendTimers: Partial<Record<ProjectKind, ReturnType<typeof setTimeout>>> = {};
const sentAt: Partial<Record<ProjectKind, number>> = {};
function broadcastEdit(kind: ProjectKind) {
  const live = lives[kind];
  if (!live?.ready || !me || isLabReadOnlyKind(kind)) return;
  const go = () => {
    delete sendTimers[kind]; sentAt[kind] = Date.now();
    const { places: _p, ...state } = projectSlice(kind, getLab()) as Record<string, unknown> & { places?: unknown };
    void live.ch.send({ type: "broadcast", event: "state", payload: { by: me, state } });
  };
  const wait = 350 - (Date.now() - (sentAt[kind] ?? 0));
  if (wait <= 0) go();
  else if (!sendTimers[kind]) sendTimers[kind] = setTimeout(go, wait);
}
const isLabReadOnlyKind = (kind: ProjectKind) => isLabReadOnly(kind);

/**
 * Drags in real time: while someone drags an element on the 2D map of a shared project (map-area MAP_DRAG_EVENT, sent
 * by SimMap), its spot goes to the others about 8 times a second; they see the person's badge move there with a fading
 * trail behind it (useRemoteDrags), until let go.
 */
export type RemoteDrag = { by: string; name: string; label: string; path: Array<[number, number]>; end: boolean; time: number };
const drags = new Map<string, RemoteDrag>();
let dragList: RemoteDrag[] = [];
const dragSubs = new Set<() => void>();
const dragKind = new Map<string, ProjectKind>();
function publishDrags() { dragList = [...drags.values()]; dragSubs.forEach((f) => f()); }
export function useRemoteDrags(kind: ProjectKind): RemoteDrag[] {
  const all = useSyncExternalStore((f) => { dragSubs.add(f); return () => { dragSubs.delete(f); }; }, () => dragList, () => dragList);
  return all.filter((d) => dragKind.get(d.by) === kind);
}
function onRemoteDrag(kind: ProjectKind, p: { by?: { id: string; name: string }; label?: string; lat?: number; lng?: number; end?: boolean }) {
  if (!p.by || p.by.id === me?.id || typeof p.lat !== "number" || typeof p.lng !== "number") return;
  const prev = drags.get(p.by.id);
  const path = prev && !prev.end && Date.now() - prev.time < 4000 ? [...prev.path, [p.lng, p.lat] as [number, number]].slice(-40) : [[p.lng, p.lat] as [number, number]];
  drags.set(p.by.id, { by: p.by.id, name: p.by.name, label: p.label ?? "un elemento", path, end: !!p.end, time: Date.now() });
  dragKind.set(p.by.id, kind);
  publishDrags();
  const id = p.by.id, at = Date.now();
  // Let go (or silent): the trail stays a moment, then goes.
  setTimeout(() => { const d = drags.get(id); if (d && d.time === at) { drags.delete(id); publishDrags(); } }, p.end ? 1500 : 4000);
}
const dragSentAt: Partial<Record<ProjectKind, number>> = {};
const dragTimers: Partial<Record<ProjectKind, ReturnType<typeof setTimeout>>> = {};
export function sendDrag(kind: ProjectKind, d: { label: string; lat: number; lng: number; end: boolean }) {
  const live = lives[kind];
  if (!live?.ready || !me || isLabReadOnly(kind)) return;
  const go = () => { delete dragTimers[kind]; dragSentAt[kind] = Date.now(); void live.ch.send({ type: "broadcast", event: "drag", payload: { by: me, ...d } }); };
  if (dragTimers[kind]) { clearTimeout(dragTimers[kind]); delete dragTimers[kind]; }
  const wait = 120 - (Date.now() - (dragSentAt[kind] ?? 0));
  if (d.end || wait <= 0) go(); else dragTimers[kind] = setTimeout(go, wait);
}
