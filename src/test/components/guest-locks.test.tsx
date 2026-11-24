import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { enterAsGuest, leaveGuest, getSectorGateKind, clearSectorGate } from "@/lib/use-pro-id";
import { setRegisteredEmail } from "@/lib/use-signed-in";
import { setUrban, resetUrban } from "@/models/lab-store";
import { FeasibilityStrip, ConstraintsCard, SuggestedInterventions } from "@/views/v10/SiteContext";
import { PremiumPart, URBAN_LOCKED } from "@/views/v10/Dashboard";
import { SensorAdvisor } from "@/views/SensorAdvisor";
import { FieldAI } from "@/views/FieldAI";
import { CameraDockButton } from "@/views/CameraDock";
import { SimMap } from "@/views/v10/SimMap";

const startVrMock = vi.fn(() => Promise.resolve());
vi.mock("@/views/v10/vr-view", () => ({
  vrSupported: () => Promise.resolve(true),
  startVr: (...args: unknown[]) => startVrMock(...args),
}));

vi.mock("@/views/v10/SatelliteMap2D", () => ({
  SatelliteMap2D: () => <div data-testid="map-2d" />,
}));

vi.mock("@/views/SimulationGrid", async () => {
  const actual = await vi.importActual<typeof import("@/views/SimulationGrid")>("@/views/SimulationGrid");
  return { ...actual, PlaceSearch: () => <div data-testid="place-search" /> };
});

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const RING: Array<[number, number]> = [
  [41.56, 14.66],
  [41.561, 14.66],
  [41.561, 14.661],
];

describe("Guest mode locks", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearSectorGate();
    resetUrban();
    startVrMock.mockClear();
    // Simulate a remembered email on the device so signedIn is true while entering as guest.
    setRegisteredEmail("ospite@example.com");
    enterAsGuest();
  });

  afterEach(() => {
    leaveGuest();
    setRegisteredEmail(null);
    clearSectorGate();
  });

  it("locks FeasibilityStrip, ConstraintsCard, and SuggestedInterventions in guest mode", () => {
    const { unmount } = withQuery(
      <div>
        <FeasibilityStrip sim="urban" lat={41.56} lng={14.66} ring={RING} placeName="Campobasso" />
        <ConstraintsCard lat={41.56} lng={14.66} ring={RING} placeName="Campobasso" kind="piazza" />
        <SuggestedInterventions lat={41.56} lng={14.66} ring={RING} placeName="Campobasso" kind="piazza" m2={500} onApply={vi.fn()} />
      </div>,
    );
    expect(screen.getAllByText("non per gli ospiti").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Fattibilità e suggerimenti")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fattibilità dell’area/i }));
    expect(getSectorGateKind()).toBe("funzionario");
    unmount();
  });

  it("locks AI suggestions (PremiumPart and FieldAI) and SensorAdvisor even when signedIn is true", () => {
    withQuery(
      <div>
        <PremiumPart locked={URBAN_LOCKED} kind="funzionario">
          <p>Contenuto sbloccato</p>
        </PremiumPart>
        <FieldAI kind="urban" onAdd={vi.fn()} />
        <SensorAdvisor kind="urban" embedded />
      </div>,
    );
    expect(screen.queryByText("Contenuto sbloccato")).not.toBeInTheDocument();
    expect(screen.getByText("Piano suggerito dall’AI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Identificati per sbloccare" })).toBeInTheDocument();
    expect(screen.getByText("Sensori AI")).toBeInTheDocument();
  });

  it("keeps CameraDockButton in standard non-AI mode when in guest mode", () => {
    render(<CameraDockButton />);
    const btn = screen.getByRole("button", { name: "Fotocamera: foto, video e galleria" });
    expect(btn).not.toHaveAttribute("data-ai");
  });

  it("locks 3D map switch and VR viewer in SimMap when in guest mode", async () => {
    setUrban({
      location: { lat: 41.56, lng: 14.66, label: "Piazza Vittorio Emanuele II · Campobasso" },
      area: { lat: 41.56, lng: 14.66, ring: RING },
    });
    withQuery(<SimMap kind="urban" />);

    const btn3d = screen.getByRole("button", { name: "3D: bloccata in modalità ospite" });
    expect(btn3d).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn3d);
    expect(screen.getByText(/La vista 3D è bloccata in modalità ospite/i)).toBeInTheDocument();

    const vrBtn = await waitFor(() => screen.getByRole("button", { name: "Guarda nel visore VR: bloccato in modalità ospite" }));
    fireEvent.click(vrBtn);
    expect(startVrMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Il visore VR è bloccato in modalità ospite/i)).toBeInTheDocument();
  });
});
