import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";
const themeKey = "climate-twin-theme";
const themeChanged = "climate-twin-theme-changed";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? THEME_DARK : "#ffffff");
}

/** Status-bar colour of the dark canvas (the top slab's colour). */
export const THEME_DARK = "#1d2129";
/** Runs before paint: an explicit light choice drops the dark class the server renders, so there is no flash. */
export const themeBootScript = `try{if(localStorage.getItem("${themeKey}")==="light"){var d=document.documentElement;d.classList.remove("dark");d.style.colorScheme="light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#ffffff")}}catch(e){}`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem(themeKey);
    // No automatic theme: without a saved explicit choice the app is dark (the PlayStation-style canvas).
    const initial: Theme = saved === "light" ? "light" : "dark";
    setTheme(initial);
    applyTheme(initial);

    const syncTheme = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    window.addEventListener(themeChanged, syncTheme);
    return () => window.removeEventListener(themeChanged, syncTheme);
  }, []);

  const toggleTheme = () => {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(themeKey, next);
    window.dispatchEvent(new Event(themeChanged));
  };

  const dark = theme === "dark";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="size-8 shrink-0 rounded-full sm:size-9"
      aria-label={dark ? "Attiva tema chiaro" : "Attiva tema nero"}
      title={dark ? "Tema chiaro" : "Tema nero"}
    >
      {dark ? <Sun aria-hidden="true" className="size-4 sm:size-[1.15rem]" /> : <Moon aria-hidden="true" className="size-4 sm:size-[1.15rem]" />}
    </Button>
  );
}