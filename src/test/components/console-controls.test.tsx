import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Map as MapIcon, TreePine } from "lucide-react";
import { TabRow, Panels, PageHero, HeroButton } from "@/views/v8/console";
import { Lever, Gauge, comfortClass, type Stop } from "@/views/v9c/UrbanThermometer";

/** Unit tests for the app's own controls: tabs, panels, hero, levers and the half-ring gauge. */
const TABS = [{ id: "mappa", label: "Mappa", icon: MapIcon }, { id: "simula", label: "Simula" }, { id: "sensori", label: "Sensori AI" }] as const;

describe("TabRow", () => {
  it("marks the open tab and reports a tapped one", () => {
    const onChange = vi.fn();
    render(<TabRow items={TABS} value="mappa" onChange={onChange} label="Sezioni" />);
    expect(screen.getByRole("tablist", { name: "Sezioni" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Mappa" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Simula" })).toHaveAttribute("aria-selected", "false");
    fireEvent.click(screen.getByRole("tab", { name: "Simula" }));
    expect(onChange).toHaveBeenCalledWith("simula");
  });
  it("gives every tab a touch target at least 44 px tall (h-11)", () => {
    render(<TabRow items={TABS} value="mappa" onChange={() => {}} label="Sezioni" />);
    for (const t of screen.getAllByRole("tab")) expect(t.className).toMatch(/\bh-11\b/);
  });
});

describe("Panels", () => {
  it("shows only the open panel and keeps a visited one mounted but hidden", () => {
    const panels = [{ id: "a", content: <p>Primo</p> }, { id: "b", content: <p>Secondo</p> }] as const;
    const { rerender } = render(<Panels value="a" panels={panels} />);
    expect(screen.getByText("Primo")).toBeVisible();
    expect(screen.queryByText("Secondo")).not.toBeInTheDocument();
    rerender(<Panels value="b" panels={panels} />);
    expect(screen.getByText("Secondo")).toBeVisible();
    expect(screen.getByText("Primo")).not.toBeVisible();
  });
  it("mounts an always panel from the start", () => {
    render(<Panels value="a" panels={[{ id: "a", content: <p>Primo</p> }, { id: "b", always: true, content: <p>Sempre</p> }]} />);
    expect(screen.getByText("Sempre")).toBeInTheDocument();
  });
});

describe("PageHero + HeroButton", () => {
  it("renders the title, a tappable kicker and labelled round actions", () => {
    const onKicker = vi.fn(), onAction = vi.fn();
    render(<PageHero kicker="Piazza · Campobasso" onKicker={onKicker} title="Piazza" actions={<HeroButton icon={TreePine} label="Altre azioni" onClick={onAction} />} />);
    expect(screen.getByRole("heading", { name: "Piazza" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Piazza · Campobasso"));
    expect(onKicker).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Altre azioni" }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe("Lever", () => {
  const base = { icon: TreePine, label: "Alberi", step: 1, max: 30, color: "text-ok", swatch: "bg-ok" };
  it("adds and removes one step", () => {
    const onChange = vi.fn();
    render(<Lever {...base} value={5} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Più alberi" }));
    expect(onChange).toHaveBeenLastCalledWith(6);
    fireEvent.click(screen.getByRole("button", { name: "Meno alberi" }));
    expect(onChange).toHaveBeenLastCalledWith(4);
  });
  it("disables − at zero and + at the top", () => {
    const { rerender } = render(<Lever {...base} value={0} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Meno alberi" })).toBeDisabled();
    rerender(<Lever {...base} value={30} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Più alberi" })).toBeDisabled();
  });
  it("shows percent for stepped levers and its hint", () => {
    render(<Lever {...base} label="Coperture" step={10} max={100} value={20} hint="Tende, pergole, pensiline." onChange={() => {}} />);
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("Tende, pergole, pensiline.")).toBeInTheDocument();
  });
  it("gives − and + touch targets of 48 px (size-12)", () => {
    render(<Lever {...base} value={5} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Più alberi" }).className).toMatch(/\bsize-12\b/);
  });
});

describe("Gauge (semicerchio)", () => {
  const stops: Stop[] = [
    { id: "zero", label: "Interventi leggeri", t: 33, on: false, near: false },
    { id: "mvp", label: "Interventi medi", t: 31.5, on: true, near: true },
    { id: "roadmap", label: "Progetto completo", t: 30, on: false, near: false },
  ];
  const props = { before: 34, after: 31.5, lowest: 29, min: 28, max: 35, stops };
  it("is a labelled slider with its values", () => {
    render(<Gauge {...props} onSlide={() => {}} onStop={() => {}} />);
    const s = screen.getByRole("slider");
    expect(s).toHaveAttribute("aria-valuenow", "31.5");
    expect(s).toHaveAttribute("aria-valuemin", "29");
    expect(s).toHaveAttribute("aria-valuemax", "34");
    expect(s.getAttribute("aria-valuetext")).toMatch(/Interventi medi/);
  });
  it("moves 0,1° with the arrows and stays in reach", () => {
    const onSlide = vi.fn();
    render(<Gauge {...props} onSlide={onSlide} onStop={() => {}} />);
    const s = screen.getByRole("slider");
    fireEvent.keyDown(s, { key: "ArrowLeft" });
    expect(onSlide.mock.calls[0]![0]).toBeCloseTo(31.4, 5);
    fireEvent.keyDown(s, { key: "Home" });
    expect(onSlide).toHaveBeenLastCalledWith(29);
    fireEvent.keyDown(s, { key: "End" });
    expect(onSlide).toHaveBeenLastCalledWith(34);
  });
  it("jumps to the next cooler level with Page Down", () => {
    const onStop = vi.fn();
    render(<Gauge {...props} onSlide={() => {}} onStop={onStop} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "PageDown" });
    expect(onStop).toHaveBeenCalledWith("roadmap");
  });
});

describe("comfortClass", () => {
  it("names the comfort class by perceived temperature", () => {
    expect(comfortClass(47)).toMatch(/estremo/i);
    expect(comfortClass(39)).toMatch(/molto forte/i);
    expect(comfortClass(33)).toMatch(/forte/i);
    expect(comfortClass(27)).toMatch(/moderato/i);
    expect(comfortClass(22)).toMatch(/Nessun disagio/i);
  });
});
