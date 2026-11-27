import { useMemo } from "react";
import type { ProjectKind } from "@/models/project-state";
import { useCurrentProject } from "@/lib/project-sync";
import { initials, useOnline, type Online } from "@/lib/project-share";

/** A colleague connected now to the same project, where their phone's GPS puts them. */
export type ColleagueSpot = { id: string; name: string; avatar: string | null; lat: number; lng: number };

/**
 * Progetti condivisi: the other people connected now to the project of this kind (Realtime presence), and those of them
 * with a position — for the 2D and 3D maps, the AR and the VR headset alike.
 */
export function useColleagues(kind: ProjectKind): { list: Online[]; spots: ColleagueSpot[] } {
  const project = useCurrentProject(kind);
  const online = useOnline();
  return useMemo(() => {
    const list = project.id && online.project === project.id ? online.list.filter((o) => o.user_id !== project.user) : [];
    const spots = list.filter((o) => o.pos).map((o) => ({ id: o.user_id, name: o.name, avatar: o.avatar, lat: o.pos!.lat, lng: o.pos!.lng }));
    return { list, spots };
  }, [project.id, project.user, online]);
}

export const firstName = (n: string) => n.split(/\s+/)[0] || "Collaboratore";
export const personInitials = initials;
export const spotsKey = (s: ColleagueSpot[]) => s.map((p) => `${p.id}:${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|");
