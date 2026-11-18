import { useEffect, useState, type ComponentProps } from "react";
import { ExportSheet } from "@/views/v10/ExportSheet";

/** «Esporta report», loaded on its first opening: mounted closed, then opened on the next render like every dialog here. */
export default function ExportSheetLazy(props: ComponentProps<typeof ExportSheet>) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <ExportSheet {...props} open={ready && props.open} />;
}
