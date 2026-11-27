import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { forgetProject, openSharedProject } from "@/lib/project-sync";
import { playDrop } from "@/lib/ui-sounds";
import type { ProjectKind } from "@/models/project-state";

/**
 * Progetti condivisi: leaving a project and asking to come back (supabase/migrations/20261127020000_project_rejoin.sql).
 * "Esci dal progetto" calls leave_project (the member removed and remembered with their role), and this device forgets
 * the project (forgetProject) but keeps which one was left (localStorage mdt-left-projects-v1, per account and kind) so
 * the map can offer "Chiedi di rientrare": request_rejoin sends a request the owner sees in the app (useJoinRequests),
 * accepting or denying it (answer_join_request); accepted, the project opens again on the requester's device.
 */
const db = () => supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type LeftProject = { id: string; name: string; owner: string; asked?: string | null; status?: "pending" | "denied" | null };
const KEY = "mdt-left-projects-v1";
type Store = Record<string, Partial<Record<ProjectKind, LeftProject>>>;
const read = (): Store => { try { return (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store) ?? {}; } catch { return {}; } };
const subs = new Set<() => void>();
let snap = "";
function write(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full */ } snap = JSON.stringify(s); subs.forEach((f) => f()); }
function setLeft(user: string, kind: ProjectKind, v: LeftProject | null) {
  const s = read();
  s[user] = { ...s[user] };
  if (v) s[user]![kind] = v; else delete s[user]![kind];
  write(s);
}
async function me(): Promise<string | null> { const { data } = await supabase.auth.getSession(); return data.session?.user.id ?? null; }

/** Esci dal progetto: removed from it, remembered as left, and this device back to an empty simulation of that kind. */
export async function leaveSharedProject(kind: ProjectKind, projectId: string, info: { name: string; owner: string }) {
  const user = await me();
  if (!user) return;
  const { error } = await db().rpc("leave_project", { p: projectId });
  if (error) throw new Error(error.message ?? "errore");
  setLeft(user, kind, { id: projectId, name: info.name, owner: info.owner, asked: null, status: null });
  await forgetProject(kind);
}

/** The project of this kind the account left, with the state of its request to come back. */
export function useLeftProject(kind: ProjectKind): { left: LeftProject | null; user: string | null } {
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => {
    void me().then(setUser);
    const { data } = supabase.auth.onAuthStateChange(() => void me().then(setUser));
    return () => data.subscription.unsubscribe();
  }, []);
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => snap || (snap = JSON.stringify(read())), () => "");
  return { left: user ? read()[user]?.[kind] ?? null : null, user };
}

/** Chiedi di rientrare: one request at a time, the owner answers in the app. */
export async function askToRejoin(kind: ProjectKind): Promise<void> {
  const user = await me();
  const left = user ? read()[user]?.[kind] : null;
  if (!user || !left) return;
  const { data, error } = await db().rpc("request_rejoin", { p: left.id });
  if (error) {
    // Already back in (accepted meanwhile) or the project is gone.
    if (/already member/.test(error.message ?? "")) { await comeBack(user, kind, left); return; }
    throw new Error(error.message ?? "errore");
  }
  setLeft(user, kind, { ...left, asked: data as string, status: "pending" });
}

async function comeBack(user: string, kind: ProjectKind, left: LeftProject) {
  setLeft(user, kind, null);
  await openSharedProject(kind, left.id);
  playDrop();
  toast.success(`Sei di nuovo nel progetto di ${left.owner}`, { id: `mdt-rejoined-${left.id}`, description: `${left.name}: ${left.owner} ha accettato la tua richiesta.` });
}

type Req = { id: string; project_id: string; user_id: string; name: string; email: string; avatar: string | null; status: "pending" | "accepted" | "denied" };

/**
 * Mounted once (ShareControl): the requester waits for the answer (realtime, and every 15 s), the owner sees each new
 * request as a lasting notice with Accetta / Nega and a drop sound.
 */
export function useRejoinRequests(user: string | null) {
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const shown = new Set<string>();
    const check = async () => {
      if (!alive || document.visibilityState !== "visible") return;
      const { data } = await db().from("project_join_requests").select("id, project_id, user_id, name, email, avatar, status").order("created_at", { ascending: false }).limit(40);
      const rows = (data ?? []) as Req[];
      // As requester: the answer to my requests.
      const mine = read()[user] ?? {};
      for (const kind of ["piazza", "vigneto"] as ProjectKind[]) {
        const left = mine[kind];
        if (!left?.asked) continue;
        const r = rows.find((x) => x.id === left.asked);
        if (r?.status === "accepted") await comeBack(user, kind, left);
        else if (r?.status === "denied" && left.status !== "denied") {
          setLeft(user, kind, { ...left, status: "denied" });
          toast(`${left.owner} non ti ha fatto rientrare`, { id: `mdt-denied-${left.id}`, description: `La richiesta per ${left.name} è stata negata. Puoi chiedere di nuovo più tardi.` });
        }
      }
      // As owner: requests to answer.
      for (const r of rows) {
        if (r.status !== "pending" || r.user_id === user || shown.has(r.id)) continue;
        shown.add(r.id);
        playDrop();
        const who = r.name || r.email || "Un collaboratore";
        const answer = async (accept: boolean) => {
          const { error } = await db().rpc("answer_join_request", { req: r.id, accept });
          if (error) { toast.error("Risposta non inviata", { description: error.message }); return; }
          toast.success(accept ? `${who} è di nuovo nel progetto` : `Richiesta di ${who} negata`, { id: `mdt-join-${r.id}` });
        };
        toast(`${who} chiede di rientrare nel progetto`, {
          id: `mdt-join-${r.id}`, duration: Infinity,
          description: `${r.email ? `${r.email} · ` : ""}Accetti?`,
          action: { label: "Accetta", onClick: () => void answer(true) },
          cancel: { label: "Nega", onClick: () => void answer(false) },
        });
      }
    };
    void check();
    const id = window.setInterval(() => void check(), 15_000);
    const ch = supabase.channel(`mdt-join-${user}`).on("postgres_changes" as never, { event: "*", schema: "public", table: "project_join_requests" } as never, () => void check()).subscribe();
    const back = () => void check();
    document.addEventListener("visibilitychange", back);
    return () => { alive = false; window.clearInterval(id); void supabase.removeChannel(ch); document.removeEventListener("visibilitychange", back); };
  }, [user]);
}
