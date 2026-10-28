/** When a saved photo or video was added: guests' ids start with the time, account files carry it in their name. Null when unknown. */
export function mediaTime(item: { id: string; path?: string | undefined }): number | null {
  const base = (item.path ?? item.id).split("/").pop() ?? "";
  const m = /^(\d{12,})(?:-|$)/.exec(base);
  return m ? Number(m[1]) : null;
}
