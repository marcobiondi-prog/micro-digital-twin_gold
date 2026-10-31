import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET } from "@/models/lab-media-store";

/**
 * Per-file marks of the account (photos taken out of the simulation, photos archived) kept as a small JSON file in the
 * account's own folder of the media storage (<user>/meta/<name>.json), not in the account's user data: the user data
 * rides in every request's sign-in token, and a mark per photo grew it until the storage refused the requests, so
 * the photos and videos stopped showing in the history.
 */
export type Marks = Record<string, string>;
const isMarks = (v: unknown): v is Marks => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");
const pathOf = (uid: string, name: string) => `${uid}/meta/${name}.json`;

export async function readMarks(uid: string, name: string): Promise<Marks> {
  try {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(pathOf(uid, name));
    if (error || !data) return {};
    const raw: unknown = JSON.parse(await data.text());
    return isMarks(raw) ? raw : {};
  } catch { return {}; }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Written a moment after the last change (one write for a whole selection); the storage has no overwrite, so remove then upload. */
export function writeMarks(name: string, marks: Marks) {
  clearTimeout(timers.get(name));
  timers.set(name, setTimeout(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const uid = data.session?.user.id;
      if (!uid) return;
      const path = pathOf(uid, name);
      await supabase.storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined);
      await supabase.storage.from(MEDIA_BUCKET).upload(path, new Blob([JSON.stringify(marks)], { type: "application/json" }), { contentType: "application/json" }).catch(() => undefined);
    })();
  }, 1500));
}

let cleaning: Promise<void> = Promise.resolve();
/**
 * The marks an older version kept in the user data: read once (returned), then taken out of the user data and the
 * session refreshed, so the sign-in token is small again. Run one at a time.
 */
export function takeLegacyMarks(field: "sim_hidden" | "media_archive", meta: unknown): Promise<Marks> {
  const saved = (meta as Record<string, unknown> | null)?.[field];
  if (saved == null) return Promise.resolve({});
  const job = cleaning.then(async () => {
    const { error } = await supabase.auth.updateUser({ data: { [field]: null } });
    if (!error) {
      await supabase.auth.refreshSession().catch(() => undefined);
      // The lighter token reads the account's photos again.
      const { refreshMedia } = await import("@/models/lab-media-store");
      void refreshMedia("urban"); void refreshMedia("vineyard");
    }
  }).catch(() => undefined);
  cleaning = job;
  return job.then(() => (isMarks(saved) ? saved : {}));
}
