import { useEffect, useState, type ComponentProps } from "react";
import { ArCamera } from "@/views/ArCamera";

/**
 * The AI camera, loaded only when first opened (it brings three.js, ~500 kB): mounted closed, then opened on the next
 * render, as dialogs here must be (an initially open one is closed again by useBackClose under StrictMode).
 */
export default function ArCameraLazy(props: ComponentProps<typeof ArCamera>) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <ArCamera {...props} mode={ready ? props.mode : null} />;
}
