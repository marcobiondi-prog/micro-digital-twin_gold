import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  MEDIA_BUCKET,
  saveGuestFile,
  setMedia,
  type MediaItem,
  type MediaKind,
} from "@/models/lab-media-store";

export type Upload = {
  id: string;
  name: string;
  kind: "image" | "video";
  status: "uploading" | "done" | "error";
};

/** Coda di caricamento a livello di modulo: prosegue anche se il pannello o la sezione
 * vengono chiusi mentre un file è in invio (il Lab si smonta cambiando scheda/flusso). */
const state: Record<MediaKind, Upload[]> = { urban: [], vineyard: [] };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** File inviati contemporaneamente: 4 per le foto, 2 quando nel gruppo ci sono video. */
export const UPLOAD_PARALLEL = 4;
export const UPLOAD_PARALLEL_WITH_VIDEO = 2;

/** Lettura diretta delle righe di caricamento (test e contatori). */
export const getUploads = (k: MediaKind) => state[k];

export function useLabUploads(k: MediaKind) {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state[k],
    () => state[k],
  );
}

export function mediaKind(file: File, hint?: "image" | "video"): "image" | "video" | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (/\.(mp4|mov|webm|3gp|mkv)$/i.test(file.name)) return "video";
  if (/\.(jpe?g|png|heic|heif|webp|gif)$/i.test(file.name)) return "image";
  return hint ?? null;
}

/** Accoda i file e avvia il caricamento: ogni file completato entra subito nell'elenco,
 * anche se nel frattempo l'utente ha cambiato scheda, flusso o sezione. */
export function enqueueUploads(
  kind: MediaKind,
  list: FileList | File[] | null,
  userId: string | null,
  hint?: "image" | "video",
) {
  if (!list?.length) return;
  const all = Array.from(list);
  const batch: Upload[] = all.map((file, i) => {
    // Alcune fotocamere di sistema Android non indicano il tipo: lo deduciamo dal pulsante usato o dall'estensione.
    const k = mediaKind(file, hint) ?? "image";
    return {
      id: `${Date.now()}-${i}`,
      name: file.name || (k === "video" ? "video.mp4" : "foto.jpg"),
      kind: k,
      status: "uploading",
    };
  });
  state[kind] = [...state[kind], ...batch];
  emit();
  void runQueue(kind, all, batch, userId, hint);
}

async function runQueue(
  kind: MediaKind,
  files: File[],
  batch: Upload[],
  userId: string | null,
  hint?: "image" | "video",
) {
  const mark = (id: string, status: Upload["status"]) => {
    state[kind] = state[kind].map((u) => (u.id === id ? { ...u, status } : u));
    emit();
  };

  const uploadOne = async (i: number) => {
    const file = files[i]!;
    const up = batch[i]!;
    try {
      if (!mediaKind(file, hint) || file.size > 50 * 1024 * 1024) {
        mark(up.id, "error");
        return;
      }
      if (!userId) {
        const item: MediaItem = {
          // The time first, so the Cronologia knows its day (as for the account's files).
          id: `${Date.now()}-${crypto.randomUUID()}`,
          name: up.name,
          size: file.size,
          url: URL.createObjectURL(file),
          kind: up.kind,
        };
        // Ospite: il file resta sul dispositivo, così non scompare ricaricando o cambiando sezione.
        await saveGuestFile(kind, file, item);
        setMedia(kind, (p) => [item, ...p]);
        mark(up.id, "done");
        return;
      }
      const safe = up.name.replace(/[^\w.-]+/g, "_").slice(-80);
      // File in parallelo possono partire nello stesso millisecondo: il suffisso evita percorsi uguali.
      const path = `${userId}/${kind}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (error) {
        mark(up.id, "error");
        return;
      }
      const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
      if (data) {
        setMedia(kind, (p) => [
          { id: path, path, name: safe, size: file.size, url: data.signedUrl, kind: up.kind },
          ...p,
        ]);
        mark(up.id, "done");
      } else mark(up.id, "error");
    } catch (e) {
      console.error("[uploader] errore file", up.name, e);
      mark(up.id, "error");
    }
  };

  // Più file insieme invece che uno alla volta: le foto viaggiano in parallelo, i video
  // (pesanti) in coppia per non saturare la connessione del telefono.
  const limit = batch.some((b) => b.kind === "video") ? UPLOAD_PARALLEL_WITH_VIDEO : UPLOAD_PARALLEL;
  let next = 0;
  const worker = async () => {
    while (next < files.length) await uploadOne(next++);
  };
  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, worker));

  // Gli stati aggiornati stanno nello store, non nei vecchi oggetti del batch.
  const statusOf = (id: string) => state[kind].find((u) => u.id === id)?.status;
  const done = batch.filter((b) => statusOf(b.id) === "done").length;
  const failed = batch.length - done;
  if (failed > 0)
    toast.error(
      failed === 1 ? "1 file non caricato" : `${failed} file non caricati`,
      { description: "Formato non supportato o connessione assente; riprova." },
    );
  else if (done > 0)
    toast.success(done === 1 ? "File caricato" : `${done} file caricati`, {
      description:
        done === 1
          ? "Il file è nell'elenco e finirà nel report."
          : "I file sono nell'elenco e finiranno nel report.",
    });

  // Le righe di stato restano visibili un attimo, poi spariscono da sole.
  setTimeout(() => {
    state[kind] = state[kind].filter((u) => !batch.some((b) => b.id === u.id));
    emit();
  }, 1500);
}
