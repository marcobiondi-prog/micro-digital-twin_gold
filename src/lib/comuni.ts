import type { Comune } from "@/models/comuni";

/** The list of Italian towns, loaded once and only when the town field is used (a separate ~75 kB file). */
let loading: Promise<readonly Comune[]> | null = null;
export const loadComuni = (): Promise<readonly Comune[]> =>
  (loading ??= import("@/data/comuni-it.json").then((m) => m.default as unknown as Comune[]).catch(() => { loading = null; return []; }));
