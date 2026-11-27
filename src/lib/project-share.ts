import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectKind } from "@/models/project-state";

/**
 * Progetti condivisi: who is in the project (project_people), the invites still waiting (owner only), who is connected
 * right now (Supabase Realtime Presence on "project:<id>"), and the owner's actions — invite by link, change a role,
 * remove a person, cancel an invite — plus leaving a project shared with you.
 */
export type ProjectRole = "owner" | "editor" | "viewer";
export type Person = { user_id: string; role: ProjectRole; email: string; name: string; avatar: string | null; added_at: string };
export type Invite = { id: string; email: string; role: Exclude<ProjectRole, "owner">; token: string; created_at: string; accepted_at: string | null };
export type Online = { user_id: string; name: string; avatar: string | null; where: string; at: number };

const db = () => supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const ROLE_LABEL: Record<ProjectRole, string> = { owner: "Proprietario", editor: "Può modificare", viewer: "Solo visione" };
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

/** Who has the project open now, this person included (tracked with their name, picture and the page they are on). */
export function usePresence(projectId: string | null, me: { id: string; name: string; avatar: string | null } | null, where: string): Online[] {
  const [online, setOnline] = useState<Online[]>([]);
  const meId = me?.id ?? null, meName = me?.name ?? "", meAvatar = me?.avatar ?? null;
  useEffect(() => {
    if (!projectId || !meId) { setOnline([]); return; }
    const ch = supabase.channel(`project:${projectId}`, { config: { presence: { key: meId } } });
    const read = () => {
      const state = ch.presenceState() as Record<string, Array<Partial<Online>>>;
      const list = Object.entries(state).map(([id, metas]) => {
        const m = metas[metas.length - 1] ?? {};
        return { user_id: id, name: m.name ?? "", avatar: m.avatar ?? null, where: m.where ?? "", at: m.at ?? 0 };
      });
      // Dev only: the screenshot scripts add colleagues here (window.__mdtPresence), as Realtime cannot be mocked there.
      const fake = import.meta.env.DEV && typeof window !== "undefined" ? ((window as unknown as { __mdtPresence?: Online[] }).__mdtPresence ?? []) : [];
      setOnline([...list, ...fake.filter((f) => !list.some((l) => l.user_id === f.user_id))]);
    };
    if (import.meta.env.DEV) setTimeout(read, 300);
    ch.on("presence", { event: "sync" }, read).subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ name: meName, avatar: meAvatar, where, at: Date.now() });
    });
    return () => { void supabase.removeChannel(ch); };
  }, [projectId, meId, meName, meAvatar, where]);
  return online;
}

export const initials = (name: string) => name.split(/\s+|@/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
export const kindWord = (k: ProjectKind) => (k === "piazza" ? "la piazza" : "il vigneto");
