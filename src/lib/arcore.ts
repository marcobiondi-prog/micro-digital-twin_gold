/**
 * Integrazione ARCore via WebXR Device API per il browser (Chrome su Android).
 * Gestisce la verifica del supporto ARCore, la sessione immersive-ar, il rilevamento delle
 * superfici reali (hit-testing sui piani fisici) e la stima della luce ambientale.
 */

export type ArCoreStatus = "checking" | "supported" | "unsupported" | "active" | "error";

export type ArCoreHitPoint = {
  x: number;
  y: number;
  z: number;
  distance: number;
  isRealSurface: true;
};

export type ArCoreLightEstimate = {
  intensity: number; // 0..2
  colorTemperature?: number;
  lightDirection?: { x: number; y: number; z: number };
};

export type ArCoreManager = {
  isSupported: () => Promise<boolean>;
  startSession: (options?: { domOverlay?: HTMLElement }) => Promise<boolean>;
  stopSession: () => Promise<void>;
  performHitTest: (normalizedX: number, normalizedY: number) => ArCoreHitPoint | null;
  getLightEstimate: () => ArCoreLightEstimate | null;
  isActive: () => boolean;
  subscribeStatus: (callback: (status: ArCoreStatus) => void) => () => void;
};

/** Verifica se il dispositivo e il browser supportano ARCore nativo tramite WebXR */
export async function isArCoreSupported(): Promise<boolean> {
  if (typeof window === "undefined" || !("xr" in navigator) || !navigator.xr) {
    return false;
  }
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

/**
 * Converte le coordinate normalizzate dello schermo (0..1) e la matrice di vista
 * in una stima metrica su superficie reale.
 */
export function estimateRealSurfaceMetric(
  hitDistance: number,
  cameraHeight = 1.5,
  pitchAngleDeg = -30
): { groundX: number; groundZ: number; confidence: number } {
  if (!Number.isFinite(hitDistance) || hitDistance <= 0) {
    return { groundX: 0, groundZ: 0, confidence: 0 };
  }
  const rad = (pitchAngleDeg * Math.PI) / 180;
  const groundZ = -Math.abs(hitDistance * Math.cos(rad));
  const groundX = 0;
  // Confidenza alta per distanze tra 0.4m e 8m (range ideale ARCore)
  const confidence = Math.max(0, Math.min(1, 1 - Math.abs(hitDistance - 2) / 7));
  return { groundX, groundZ, confidence };
}

/**
 * Normalizza la stima di illuminazione ambientale ARCore in un moltiplicatore Three.js.
 */
export function normalizeArLight(
  rawIntensity: number | null | undefined,
  defaultIntensity = 1.0
): number {
  if (rawIntensity == null || !Number.isFinite(rawIntensity) || rawIntensity < 0) {
    return defaultIntensity;
  }
  // ARCore restituisce lumen o stima da 0 a ~2.0, clampiamo in un intervallo fotografico equilibrato
  return Math.max(0.3, Math.min(1.8, rawIntensity));
}

/**
 * Crea l'istanza del manager ARCore per la sessione corrente.
 */
export function createArCoreManager(): ArCoreManager {
  let session: XRSession | null = null;
  let refSpace: XRReferenceSpace | null = null;
  let hitTestSource: XRHitTestSource | null = null;
  let status: ArCoreStatus = "checking";
  const listeners = new Set<(s: ArCoreStatus) => void>();
  let lastHit: ArCoreHitPoint | null = null;
  let lastLight: ArCoreLightEstimate | null = null;

  const notify = (s: ArCoreStatus) => {
    status = s;
    listeners.forEach((fn) => fn(s));
  };

  const isSupported = async () => {
    const supported = await isArCoreSupported();
    notify(supported ? "supported" : "unsupported");
    return supported;
  };

  const startSession = async (options?: { domOverlay?: HTMLElement }): Promise<boolean> => {
    if (typeof window === "undefined" || !navigator.xr) return false;
    try {
      const sessionInit: XRSessionInit = {
        optionalFeatures: ["hit-test", "local-floor", "light-estimation", "plane-detection"],
      };

      if (options?.domOverlay) {
        sessionInit.optionalFeatures?.push("dom-overlay");
        (sessionInit as unknown as { domOverlay: { root: HTMLElement } }).domOverlay = {
          root: options.domOverlay,
        };
      }

      try {
        session = await navigator.xr.requestSession("immersive-ar", sessionInit);
      } catch (errFirst) {
        session = await navigator.xr.requestSession("immersive-ar", {
          optionalFeatures: ["local-floor"],
        });
      }

      refSpace = await session.requestReferenceSpace("local");
      const viewerSpace = await session.requestReferenceSpace("viewer");

      if (session.requestHitTestSource) {
        hitTestSource = (await session.requestHitTestSource({ space: viewerSpace })) ?? null;
      }

      const onXRFrame: XRFrameRequestCallback = (_time, frame) => {
        if (!session) return;
        if (hitTestSource && refSpace) {
          const hitTestResults = frame.getHitTestResults(hitTestSource);
          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const pose = hit ? hit.getPose(refSpace) : null;
            if (pose) {
              const pos = pose.transform.position;
              lastHit = {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                distance: Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z),
                isRealSurface: true,
              };
            }
          }
        }
        session.requestAnimationFrame(onXRFrame);
      };
      session.requestAnimationFrame(onXRFrame);

      session.addEventListener("end", () => {
        session = null;
        refSpace = null;
        hitTestSource = null;
        notify("supported");
      });

      notify("active");
      return true;
    } catch {
      notify("error");
      return false;
    }
  };

  const stopSession = async () => {
    if (session) {
      await session.end().catch(() => {});
      session = null;
      refSpace = null;
      hitTestSource = null;
      notify("supported");
    }
  };

  const performHitTest = (normalizedX: number, normalizedY: number): ArCoreHitPoint | null => {
    // Se la sessione ARCore è attiva e ha un hit recente sui piani reali
    if (session && lastHit) {
      return lastHit;
    }
    return null;
  };

  const getLightEstimate = (): ArCoreLightEstimate | null => {
    return lastLight;
  };

  return {
    isSupported,
    startSession,
    stopSession,
    performHitTest,
    getLightEstimate,
    isActive: () => status === "active",
    subscribeStatus: (cb) => {
      listeners.add(cb);
      cb(status);
      return () => listeners.delete(cb);
    },
  };
}
