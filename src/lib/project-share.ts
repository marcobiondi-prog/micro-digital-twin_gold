import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { playDrop } from "@/lib/ui-sounds";
import type { ProjectKind } from "@/models/project-state";

/**
 * Progetti condivisi: who is in the project (project_people), the invites still waiting (owner only), who is connected
 * right now (Supabase Realtime Presence on "project:<id>"), and the owner's actions — invite by link, change a role,
 * remove a person, cancel an invite — plus leaving a project shared with you.
 */
export type ProjectRole = "owner" | "editor" | "viewer";
export type Person = { user_id: string; role: ProjectRole; email: string; name: string; avatar: string | null; added_at: string };
export type Invite = { id: string; email: string; role: Exclude<ProjectRole, "owner">; token: string; created_at: string; accepted_at: string | null };
export type Online = { user_id: string; name: string; avatar: string | null; where: string; at: number; pos?: { lat: number; lng: number } };

const db = () => supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const ROLE_LABEL: Record<ProjectRole, string> = { owner: "Admin", editor: "Può modificare", viewer: "Solo visione" };
export const inviteLink = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/invito/${token}`;

export function useProjectPeople(projectId: string | null, me: string | null) {
  const [people, setPeople] = useState<Person[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!projectId) { setPeople([]); setInvites([]); return; }
    setLoading(true);
    const { data, error: e } = await db().rpc("project_people", { p: projectId });
    if (e) setError(e.message ?? "errore");
    else { setError(null); setPeople((data ?? []) as Person[]); }
    const mine = ((data ?? []) as Person[]).find((p) => p.user_id === me);
    if (mine?.role === "owner") {
      const inv = await db().from("project_invites").select("id, email, role, token, created_at, accepted_at").eq("project_id", projectId).is("accepted_at", null).order("created_at", { ascending: false });
      setInvites((inv.data ?? []) as Invite[]);
    } else setInvites([]);
    setLoading(false);
  }, [projectId, me]);
  useEffect(() => { void reload(); }, [reload]);
  const myRole = people.find((p) => p.user_id === me)?.role ?? null;
  return { people, invites, loading, error, reload, myRole };
}

export async function createInvite(projectId: string, email: string, role: "editor" | "viewer"): Promise<Invite> {
  const { data, error } = await db().from("project_invites").insert({ project_id: projectId, email: email.trim().toLowerCase(), role }).select("id, email, role, token, created_at, accepted_at").single();
  if (error) throw new Error(error.message);
  return data as Invite;
}
export async function cancelInvite(id: string) { const { error } = await db().from("project_invites").delete().eq("id", id); if (error) throw new Error(error.message); }
export async function setRole(projectId: string, userId: string, role: "editor" | "viewer") {
  const { error } = await db().from("project_members").update({ role }).eq("project_id", projectId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
export async function removePerson(projectId: string, userId: string) {
  const { data, error } = await db().from("project_members").delete().eq("project_id", projectId).eq("user_id", userId).select("user_id");
  if (error) throw new Error(error.message);
  if (!(data ?? []).length) throw new Error("not-removed");
}

/** Who has the project open now, published for the maps too (the named dots), with the project it belongs to. */
let onlineNow: { project: string | null; list: Online[] } = { project: null, list: [] };
const onlineSubs = new Set<() => void>();
function publish(project: string | null, list: Online[]) { onlineNow = { project, list }; onlineSubs.forEach((f) => f()); }
export const getOnline = () => onlineNow;
export function useOnline(): { project: string | null; list: Online[] } {
  return useSyncExternalStore((f) => { onlineSubs.add(f); return () => { onlineSubs.delete(f); }; }, () => onlineNow, () => onlineNow);
}

/**
 * Who has the project open now, this person included (tracked with their name, picture, the page they are on and,
 * while the map's GPS follows them, where they stand). One channel per project; the tracked state is sent again when
 * the page or the position changes (the position at most every 4 s). A colleague who comes in is said once.
 */
export function usePresence(projectId: string | null, me: { id: string; name: string; avatar: string | null } | null, where: string, pos: { lat: number; lng: number } | null = null): Online[] {
  const [online, setOnline] = useState<Online[]>([]);
  const meId = me?.id ?? null, meName = me?.name ?? "";
  // A picture as a data URL would make every presence message heavy: only a link is sent.
  const meAvatar = me?.avatar && !me.avatar.startsWith("data:") ? me.avatar : null;
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ready = useRef(false);
  const state = useRef({ where, pos, name: meName, avatar: meAvatar });
  state.current = { where, pos, name: meName, avatar: meAvatar };
  // Realtime limits how often a client may send its presence (ClientPresenceRateLimitReached kicked the channel and the
  // colleagues read "Nessuno connesso ora"): one message at most every TRACK_GAP_MS, the latest state, only when changed.
  const sent = useRef("");
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useCallback(() => {
    const ch = chRef.current;
    if (!ch || !ready.current) return;
    const st = state.current;
    const sig = JSON.stringify([st.where, st.pos, st.name, st.avatar]);
    if (sig === sent.current) return;
    const wait = TRACK_GAP_MS - (Date.now() - lastAt.current);
    if (wait > 0) { if (!timer.current) timer.current = setTimeout(() => { timer.current = null; send(); }, wait); return; }
    sent.current = sig; lastAt.current = Date.now();
    void ch.track({ name: st.name, avatar: st.avatar, where: st.where, pos: st.pos, at: Date.now() });
  }, []);
  // A channel dropped (rate limit, network): joined again after a pause.
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!projectId || !meId) { setOnline([]); publish(null, []); return; }
    const ch = supabase.channel(`project:${projectId}`, { config: { presence: { key: meId } } });
    chRef.current = ch;
    let seen: Set<string> | null = null, retry: ReturnType<typeof setTimeout> | null = null, dropped = false, droppedAt = 0;
    const read = () => {
      const st = ch.presenceState() as Record<string, Array<Partial<Online>>>;
      const list: Online[] = Object.entries(st).map(([id, metas]) => {
        const m = metas[metas.length - 1] ?? {};
        return { user_id: id, name: m.name ?? "", avatar: m.avatar ?? null, where: m.where ?? "", at: m.at ?? 0, ...(m.pos ? { pos: m.pos } : {}) };
      });
      // Dev only: the screenshot scripts add colleagues here (window.__mdtPresence), as Realtime cannot be mocked there.
      const fake = import.meta.env.DEV && typeof window !== "undefined" ? ((window as unknown as { __mdtPresence?: Online[] }).__mdtPresence ?? []) : [];
      const all = [...list, ...fake.filter((f) => !list.some((l) => l.user_id === f.user_id))];
      // A colleague comes (back) in, or this device is back in after a drop: a water drop sound.
      // Only someone really arriving (not seen in the last 3 minutes): a flapping connection is not an arrival.
      const now = Date.now();
      const arrived = seen ? all.filter((o) => o.user_id !== meId && !seen!.has(o.user_id) && now - (lastSeenAt.get(o.user_id) ?? 0) > 180_000) : [];
      for (const o of all) lastSeenAt.set(o.user_id, now);
      if (arrived.length) playDrop();
      for (const o of arrived) toast(`${o.name || "Un collaboratore"} è entrato nel progetto`, { id: `mdt-join-${o.user_id}`, description: `In diretta ${o.where || "nell’app"}.` });
      seen = new Set(all.map((o) => o.user_id));
      setOnline(all);
      publish(projectId, all);
    };
    if (import.meta.env.DEV) setTimeout(read, 300);
    ch.on("presence", { event: "sync" }, read).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        ready.current = true; sent.current = ""; send();
        // Back in after a real drop (more than 20 s away), once.
        if ((round > 0 || dropped) && Date.now() - droppedAt > 20_000) playDrop();
        dropped = false;
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        ready.current = false; if (!dropped) droppedAt = Date.now(); dropped = true;
        if (!retry) retry = setTimeout(() => setRound((n) => n + 1), 15000);
      }
    });
    return () => { ready.current = false; chRef.current = null; if (retry) clearTimeout(retry); publish(null, []); void supabase.removeChannel(ch); };
  }, [projectId, meId, round, send]);
  // The page, the name, the picture or the position (about 10 m) changed: sent again, within the limit.
  const posKey = pos ? `${pos.lat},${pos.lng}` : "";
  useEffect(() => { send(); }, [where, posKey, meName, meAvatar, send]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return online;
}

const TRACK_GAP_MS = 12000;
/** When each colleague was last seen connected (for the arrival sound and notice). */
const lastSeenAt = new Map<string, number>();

export const initials = (name: string) => name.split(/\s+|@/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
export const kindWord = (k: ProjectKind) => (k === "piazza" ? "la piazza" : "il vigneto");
