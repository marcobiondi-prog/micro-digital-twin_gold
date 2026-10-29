import type { SVGProps } from "react";

/**
 * The Profilo logo of the bottom bar: a professional badge on its clip, with the person on it, drawn in the same
 * 24 px line style as the bar's other icons.
 */
export function ProfileIcon({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 5V3.5A1.5 1.5 0 0 1 11.5 2h1A1.5 1.5 0 0 1 14 3.5V5" />
      <rect x="4" y="5" width="16" height="17" rx="3" />
      <circle cx="12" cy="11.5" r="2.5" />
      <path d="M7.75 18.5c.75-2 2.3-3 4.25-3s3.5 1 4.25 3" />
    </svg>
  );
}
