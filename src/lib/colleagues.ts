import { useMemo } from "react";
import type { ProjectKind } from "@/models/project-state";
import { useCurrentProject } from "@/lib/project-sync";
import { initials, useOnline, type Online } from "@/lib/project-share";

/** A colleague connected now to the same project, where their phone's GPS puts them. */
export type ColleagueSpot = { id: string; name: string; avatar: string | null; lat: number; lng: number; note?: string; away?: boolean };

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

/**
 * The people of a shared project connected now but not on the map by their GPS (GPS off): gathered round the area's
 * middle, a few metres apart, "senza GPS". Members not connected are not on the maps at all. Their id carries the note, so a person turning the GPS on moves to their spot.
 */
export function projectSpots(people: Array<{ user_id: string; name: string; email: string; avatar: string | null }>, online: Online[], onMap: ColleagueSpot[], me: string | null, at: { lat: number; lng: number }): ColleagueSpot[] {
  const placed = new Set(onMap.map((p) => p.id));
  // Only who is connected now shows on the maps (asked): a member not connected is not drawn at all.
  const rest = people.filter((p) => p.user_id !== me && !placed.has(p.user_id) && online.some((o) => o.user_id === p.user_id));
  const M = 111320, r = 9;
  return rest.map((p, i) => {
    const a = (i / Math.max(1, rest.length)) * Math.PI * 2 - Math.PI / 2;
    const note = "senza GPS";
    return {
      id: `${p.user_id}|${note}`, name: p.name || p.email.split("@")[0] || "Collaboratore", avatar: p.avatar,
      lat: at.lat + (Math.sin(a) * r) / M, lng: at.lng + (Math.cos(a) * r) / (M * Math.cos((at.lat * Math.PI) / 180)),
      note, away: false,
    };
  });
}
