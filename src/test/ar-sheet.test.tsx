// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Ruler, Fence } from "lucide-react";
vi.mock("@/views/ar-tree", () => ({ realTree: async () => null, wantsRealTree: () => false }));
import { ArSheet } from "@/views/ArLive";

describe("AR menu sheet", () => {
  it("lists sections with names and hints, and picks on tap", () => {
    const pick = vi.fn(), close = vi.fn();
    render(<ArSheet onClose={close} groups={[
      { key: "piante", label: "Piante AI", Icon: Ruler, items: [] },
      { key: "interventi", label: "Interventi", Icon: Fence, items: [{ key: "pergolato", label: "Pergolato", hint: "Ombra in legno", Icon: Fence, on: true, onPick: pick }] },
      { key: "strumenti", label: "Strumenti", Icon: Ruler, items: [{ key: "t:misura", label: "Misura", hint: "La distanza tra due punti a terra", Icon: Ruler, on: false, tool: true, onPick: vi.fn() }] },
    ]} />);
    expect(screen.queryByText("Piante riconosciute dall’AI")).toBeNull();
    expect(screen.getByText("Interventi")).toBeTruthy();
    expect(screen.getByText("La distanza tra due punti a terra")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pergolato/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Pergolato/ }));
    expect(pick).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(close).toHaveBeenCalled();
  });
});
