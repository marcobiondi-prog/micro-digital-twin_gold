import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyProjectState, getLab, onLabEdit, onReadOnlyRefused, setLabReadOnly } from "@/models/lab-store";
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

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
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
        if (opts.by === "colleague") toast(kind === "piazza" ? "Piazza aggiornata da un collaboratore" : "Vigneto aggiornato da un collaboratore", { id: `mdt-colleague-${kind}`, description: "Vedi le sue modifiche in diretta." });
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
    const offEdit = onLabEdit((kind) => {
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
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN") { missing = false; window.setTimeout(() => syncAllProjects(), 800); } });
    const back = () => { if (document.visibilityState === "visible") syncAllProjects(); };
    const online = () => syncAllProjects();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", online);
    return () => {
      onReadOnlyRefused(null); offEdit(); window.clearTimeout(start); data.subscription.unsubscribe(); void supabase.removeChannel(live);
      Object.values(timers).forEach((t) => window.clearTimeout(t));
      document.removeEventListener("visibilitychange", back); window.removeEventListener("online", online);
    };
  }, []);
}
