/** iPhone or iPad (iPadOS reads as a Mac with touch). Their browser gives WebGL little memory: the 3D maps there stay
 *  light — the realistic models froze the 3D at the first intervention. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
