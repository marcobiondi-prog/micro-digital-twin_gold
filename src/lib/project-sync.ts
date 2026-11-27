import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyProjectState, getLab, onLabEdit } from "@/models/lab-store";
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
function setMeta(user: string, kind: ProjectKind, m: SyncMeta) { const s = read<Store>(META_KEY, {}); s[user] = { ...s[user], [kind]: m }; write(META_KEY, s); }
const editedAt = (kind: ProjectKind) => read<Partial<Record<ProjectKind, number>>>(EDIT_KEY, {})[kind] ?? 0;
function markEdited(kind: ProjectKind) { write(EDIT_KEY, { ...read(EDIT_KEY, {}), [kind]: Date.now() }); }

/** The project in use for a kind, for other modules (phase 1: sharing). */
export function currentProjectId(user: string, kind: ProjectKind): string | undefined { return metaOf(user, kind)?.id; }

let missing = false;
const busy = new Set<ProjectKind>();
type Row = { id: string; state: Record<string, unknown>; updated_at: string };

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Brings one kind in step with the account. */
export async function syncProject(kind: ProjectKind, opts: { announce?: boolean } = {}): Promise<void> {
  if (missing || busy.has(kind) || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  const user = await userId();
  if (!user) return;
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
    const lab = getLab();
    const place = placeOf(kind, lab);
    const known = row && meta?.id === row.id ? meta : undefined;
    const step = syncStep({ meta: known, editedAt: editedAt(kind), remoteAt: row?.updated_at ?? null, pending: !!place.pending });
    if (step === "create") {
      const { data, error } = await table().insert({ kind, name: projectName(place.label), place, state: projectSlice(kind, lab) }).select("id, updated_at").single();
      if (error) return void checkMissing(error);
      setMeta(user, kind, { id: data.id, known: data.updated_at, syncedAt: Date.now() });
      if (opts.announce !== false) toast.success(kind === "piazza" ? "La piazza ora è nel tuo account" : "Il vigneto ora è nel tuo account", { description: "La ritrovi su ogni telefono o computer con cui entri." });
    } else if (step === "push" && row) {
      const { data, error } = await table().update({ name: projectName(place.label), place, state: projectSlice(kind, lab) }).eq("id", row.id).select("updated_at").single();
      if (error) return void checkMissing(error);
      setMeta(user, kind, { id: row.id, known: data.updated_at, syncedAt: Date.now() });
    } else if (step === "pull" && row) {
      const changed = JSON.stringify(row.state) !== JSON.stringify(projectSlice(kind, lab));
      if (row.state && Object.keys(row.state).length) applyProjectState(kind, row.state);
      setMeta(user, kind, { id: row.id, known: row.updated_at, syncedAt: Date.now() });
      if (changed && opts.announce !== false) toast(kind === "piazza" ? "Piazza aggiornata dal tuo account" : "Vigneto aggiornato dal tuo account", { description: "Hai ritrovato le modifiche fatte su un altro dispositivo." });
    } else if (row && !known) {
      setMeta(user, kind, { id: row.id, known: row.updated_at, syncedAt: Date.now() });
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
    const offEdit = onLabEdit((kind) => {
      markEdited(kind);
      window.clearTimeout(timers[kind]);
      timers[kind] = window.setTimeout(() => void syncProject(kind), 1000);
    });
    const start = window.setTimeout(() => syncAllProjects(), 1500);
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN") { missing = false; window.setTimeout(() => syncAllProjects(), 800); } });
    const back = () => { if (document.visibilityState === "visible") syncAllProjects(); };
    const online = () => syncAllProjects();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", online);
    return () => {
      offEdit(); window.clearTimeout(start); data.subscription.unsubscribe();
      Object.values(timers).forEach((t) => window.clearTimeout(t));
      document.removeEventListener("visibilitychange", back); window.removeEventListener("online", online);
    };
  }, []);
}
