import type { SVGProps } from "react";
import type { ProKind } from "@/models/professional-id";

type IconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number };

/** A professional badge on its clip, in the 24 px line style of the bar's other icons; what is drawn on it says who you are. */
function Badge({ strokeWidth = 2, children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 5V3.5A1.5 1.5 0 0 1 11.5 2h1A1.5 1.5 0 0 1 14 3.5V5" />
      <rect x="4" y="5" width="16" height="17" rx="3" />
      {children}
    </svg>
  );
}

/** The agronomist's badge: a leaf with its vein. */
export function AgronomoIcon(props: IconProps) {
  return <Badge {...props}><path d="M8 18c0-4.4 3-7.5 8-7.5 0 4.4-3 7.5-8 7.5Z" /><path d="M8 18l4.5-4.5" /></Badge>;
}

/** The municipal officer's badge: the town hall, pediment and columns. */
export function FunzionarioIcon(props: IconProps) {
  return <Badge {...props}><path d="M7.5 12.5 12 9.5l4.5 3" /><path d="M9 13v4M12 13v4M15 13v4M7.5 18h9" /></Badge>;
}

/** The badge of a profile: in the bottom bar in the place of the section it locks. */
export function ProfileIcon({ kind, ...props }: IconProps & { kind: ProKind }) {
  return kind === "agronomo" ? <AgronomoIcon {...props} /> : <FunzionarioIcon {...props} />;
}
