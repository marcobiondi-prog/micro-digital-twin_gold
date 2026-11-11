import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { installUiClicks } from "@/lib/ui-sounds";
import { TabRow, Panels, openSimTab, useSimTab } from "@/views/v8/console";
import { Lever } from "@/views/v9c/UrbanThermometer";
import { TreePine } from "lucide-react";

/**
 * Integration: the app-wide tap listener (ui-sounds, installed by the root on every page) sits in the capture phase
 * of every touch. These tests check it never stops a tap from reaching its control, whatever the touch does.
 */
const pointer = (el: Element, type: string, x: number, y: number, pointerType = "touch", id = 1) =>
  fireEvent(el, new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType, button: 0 }));

let uninstall: () => void = () => {};
beforeEach(() => { uninstall = installUiClicks(); });
afterEach(() => uninstall());

describe("tap listener and controls", () => {
  it("a still touch tap reaches the button once and is not cancelled", () => {
    const onClick = vi.fn();
    render(<button type="button" onClick={onClick}>Accedi</button>);
    const b = screen.getByRole("button", { name: "Accedi" });
    pointer(b, "pointerdown", 50, 50);
    pointer(b, "pointerup", 52, 51);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
    b.dispatchEvent(click);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(click.defaultPrevented).toBe(false);
  });
  it("a touch that moved (a scroll) still lets the browser's click through when it comes", () => {
    const onClick = vi.fn();
    render(<button type="button" onClick={onClick}>Simula</button>);
    const b = screen.getByRole("button", { name: "Simula" });
    pointer(b, "pointerdown", 10, 10);
    pointer(b, "pointerup", 10, 60);
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("a pointercancel (the browser took the touch for a scroll) leaves the next tap working", () => {
    const onClick = vi.fn();
    render(<button type="button" onClick={onClick}>Dashboard</button>);
    const b = screen.getByRole("button", { name: "Dashboard" });
    pointer(b, "pointerdown", 10, 10);
    pointer(b, "pointercancel", 10, 10);
    pointer(b, "pointerdown", 10, 10, "touch", 2);
    pointer(b, "pointerup", 10, 10, "touch", 2);
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("a control removed between touch-down and lift does not break the following taps", () => {
    const onClick = vi.fn();
    function Swap() {
      const [first, setFirst] = useState(true);
      return first ? <button type="button" onPointerDown={() => setFirst(false)}>Apri</button> : <button type="button" onClick={onClick}>Dopo</button>;
    }
    render(<Swap />);
    const a = screen.getByRole("button", { name: "Apri" });
    pointer(a, "pointerdown", 5, 5);
    const b = screen.getByRole("button", { name: "Dopo" });
    pointer(b, "pointerup", 5, 5);
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("a pen and a mouse reach the button too", () => {
    const onClick = vi.fn();
    render(<button type="button" onClick={onClick}>Ok</button>);
    const b = screen.getByRole("button", { name: "Ok" });
    pointer(b, "pointerdown", 1, 1, "pen");
    pointer(b, "pointerup", 1, 1, "pen");
    fireEvent.click(b);
    pointer(b, "pointerdown", 1, 1, "mouse");
    pointer(b, "pointerup", 1, 1, "mouse");
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(2);
  });
  it("a disabled control or one opted out still behaves (no crash, no click)", () => {
    const onClick = vi.fn();
    render(<><button type="button" disabled onClick={onClick}>No</button><button type="button" data-no-ui-click onClick={onClick}>Scatta</button></>);
    const off = screen.getByRole("button", { name: "No" });
    pointer(off, "pointerdown", 1, 1); pointer(off, "pointerup", 1, 1); fireEvent.click(off);
    const shutter = screen.getByRole("button", { name: "Scatta" });
    pointer(shutter, "pointerdown", 1, 1); pointer(shutter, "pointerup", 1, 1); fireEvent.click(shutter);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("simulation tabs: store, tabs and panels together", () => {
  function Shell() {
    const tab = useSimTab("urban");
    return (
      <>
        <TabRow items={[{ id: "mappa", label: "Mappa" }, { id: "simula", label: "Simula" }, { id: "sensori", label: "Sensori AI" }]} value={tab} onChange={(t) => openSimTab("urban", t)} label="Sezioni" />
        <Panels value={tab} panels={[{ id: "mappa", content: <p>Contenuto mappa</p> }, { id: "simula", content: <p>Contenuto simula</p> }, { id: "sensori", content: <p>Contenuto sensori</p> }]} />
      </>
    );
  }
  it("a tapped tab opens its panel and the store keeps it", () => {
    act(() => openSimTab("urban", "mappa"));
    render(<Shell />);
    expect(screen.getByText("Contenuto mappa")).toBeVisible();
    const t = screen.getByRole("tab", { name: "Simula" });
    pointer(t, "pointerdown", 3, 3); pointer(t, "pointerup", 3, 3);
    fireEvent.click(t);
    expect(screen.getByRole("tab", { name: "Simula" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Contenuto simula")).toBeVisible();
    expect(screen.getByText("Contenuto mappa")).not.toBeVisible();
  });
  it("a tab opened from elsewhere (openSimTab) shows at once", () => {
    render(<Shell />);
    act(() => openSimTab("urban", "sensori"));
    expect(screen.getByText("Contenuto sensori")).toBeVisible();
  });
});

describe("lever with state: repeated quick taps all count", () => {
  it("ten fast taps on + give ten steps", () => {
    function Box() {
      const [v, setV] = useState(0);
      return <><Lever icon={TreePine} label="Alberi" value={v} step={1} max={30} color="" swatch="" onChange={setV} /><output>{v}</output></>;
    }
    render(<Box />);
    const plus = screen.getByRole("button", { name: "Più alberi" });
    for (let i = 0; i < 10; i++) { pointer(plus, "pointerdown", 4, 4, "touch", 10 + i); pointer(plus, "pointerup", 4, 4, "touch", 10 + i); fireEvent.click(plus); }
    expect(screen.getByRole("status").textContent ?? screen.getByText("10").textContent).toBe("10");
  });
});
