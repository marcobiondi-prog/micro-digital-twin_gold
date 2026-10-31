/** Windows tablets ignore capture and open a file picker; use a live camera there. */
export function supportsSystemCapture(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
}

/** Viewport-filling dialogs do not request browser fullscreen. */
export async function prepareSystemCamera(): Promise<void> {}

export function releaseSystemCamera(): void {}

/** Native capture must stay synchronous with the user's menu tap. */
export function openSystemCamera(input: HTMLInputElement | null, mode: "photo" | "video"): void {
  if (!input) return;
  input.accept = mode === "photo" ? "image/*" : "video/*";
  input.setAttribute("capture", "environment");
  input.multiple = false;
  input.value = "";
  // showPicker can choose a generic file picker on tablet/WebView hosts.
  input.click();
}
/**
 * Su Android il vecchio Chrome, con la selezione multipla, apriva il gestore file invece della galleria. Da Chrome 120
 * l'input foto/video apre il selettore di foto di Android anche con la selezione multipla.
 */
const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
const chromeMajor = typeof navigator !== "undefined" ? Number(/Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? 0) : 0;
export const galleryMultiple = !isAndroid || chromeMajor >= 120;
