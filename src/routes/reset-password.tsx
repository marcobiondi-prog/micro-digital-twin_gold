import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Reimposta password — MICRO DIGITAL TWIN" },
    { name: "description", content: "Imposta una nuova password per il tuo account MICRO DIGITAL TWIN." },
    { property: "og:title", content: "Reimposta password — MICRO DIGITAL TWIN" },
    { property: "og:description", content: "Recupera l’accesso al tuo account MICRO DIGITAL TWIN." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPassword,
});

function ResetPassword() {
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("access_token");
    const refresh = params.get("refresh_token");
    if (params.get("type") === "recovery" && token && refresh) {
      void supabase.auth.setSession({ access_token: token, refresh_token: refresh }).then(({ error }) => {
        if (error) setMessage("Link di recupero non valido o scaduto.");
        else { setValid(true); window.history.replaceState(null, "", window.location.pathname); }
      });
      return;
    }
    // Recovery links carry ?code=, which the root route exchanges for a session: wait for it.
    let ready = false;
    const accept = () => { ready = true; setValid(true); setMessage(""); };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) accept(); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (session) accept(); });
    const timer = window.setTimeout(() => { if (!ready) setMessage("Link di recupero non valido o scaduto."); }, 8000);
    return () => { subscription.unsubscribe(); window.clearTimeout(timer); };
  }, []);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error ? error.message : "Password aggiornata. Ora puoi tornare all’app.");
    if (!error) { setValid(false); setPassword(""); }
    setPending(false);
  };
  return <section className="mx-auto max-w-md space-y-5 py-8">
    <h1 className="text-2xl font-semibold">Reimposta password</h1>
    {valid && <form onSubmit={(event) => void save(event)} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="new-password">Nuova password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      <Button type="submit" disabled={pending}>{pending ? "Attendi…" : "Salva password"}</Button>
    </form>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    <Button variant="link" asChild className="px-0"><Link to="/">Torna alla panoramica</Link></Button>
  </section>;
}