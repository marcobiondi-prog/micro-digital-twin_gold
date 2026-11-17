import { useEffect, useState, type ComponentProps } from "react";
import { GalleryReview } from "@/views/GalleryReview";

/**
 * The gallery review sheet, loaded only once something is picked from the gallery: mounted closed, then opened on the
 * next render, as dialogs here must be (an initially open one is closed again by useBackClose under StrictMode).
 */
export default function GalleryReviewLazy(props: ComponentProps<typeof GalleryReview>) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <GalleryReview {...props} files={ready ? props.files : null} />;
}
