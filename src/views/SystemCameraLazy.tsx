import { useEffect, useState, type ComponentProps } from "react";
import { SystemCamera } from "@/views/SystemCamera";

/**
 * The in-app camera, loaded only when first opened: mounted closed, then opened on the next render, as dialogs here
 * must be (an initially open one is closed again by useBackClose under StrictMode).
 */
export default function SystemCameraLazy(props: ComponentProps<typeof SystemCamera>) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <SystemCamera {...props} mode={ready ? props.mode : null} />;
}
