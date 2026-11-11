import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/** Unit tests for the shared primitives under src/components/ui. */
describe("Button", () => {
  it("renders its label and answers a click", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salva</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("ignores clicks while disabled", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Salva</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(onClick).not.toHaveBeenCalled();
  });
  it("applies its variant classes", () => {
    render(<Button variant="destructive">Elimina</Button>);
    expect(screen.getByRole("button", { name: "Elimina" }).className).toMatch(/destructive/);
  });
  it("renders as its child with asChild", () => {
    render(<Button asChild><a href="/dashboard">Vai</a></Button>);
    expect(screen.getByRole("link", { name: "Vai" })).toHaveAttribute("href", "/dashboard");
  });
});

describe("Badge", () => {
  it("shows its text", () => {
    render(<Badge>Beta</Badge>);
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });
});

describe("Switch", () => {
  it("toggles its checked state on click and reports it", () => {
    const onChange = vi.fn();
    render(<Switch aria-label="GPS sempre attivo" onCheckedChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "GPS sempre attivo" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(sw).toHaveAttribute("aria-checked", "true");
  });
  it("does not toggle when disabled", () => {
    const onChange = vi.fn();
    render(<Switch aria-label="Avvisi" disabled onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Avvisi" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Input + Label", () => {
  it("links the label to the field and takes typing", () => {
    const onChange = vi.fn();
    render(<><Label htmlFor="nome">Nome</Label><Input id="nome" onChange={onChange} /></>);
    const field = screen.getByLabelText("Nome");
    fireEvent.change(field, { target: { value: "Marco" } });
    expect(onChange).toHaveBeenCalled();
    expect(field).toHaveValue("Marco");
  });
});

describe("Tabs", () => {
  it("shows the panel of the selected tab only", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList><TabsTrigger value="a">Uno</TabsTrigger><TabsTrigger value="b">Due</TabsTrigger></TabsList>
        <TabsContent value="a">Pannello uno</TabsContent>
        <TabsContent value="b">Pannello due</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Pannello uno")).toBeInTheDocument();
    expect(screen.queryByText("Pannello due")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Uno" })).toHaveAttribute("aria-selected", "true");
  });
  it("switches tab on press (Radix activates on mouse down, as a touch does)", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList><TabsTrigger value="a">Uno</TabsTrigger><TabsTrigger value="b">Due</TabsTrigger></TabsList>
        <TabsContent value="a">Pannello uno</TabsContent>
        <TabsContent value="b">Pannello due</TabsContent>
      </Tabs>,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Due" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "Due" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Pannello due")).toBeInTheDocument();
  });
});
