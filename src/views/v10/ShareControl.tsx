import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Copy, Link2, Loader2, LogOut, Mail, Radio, Send, Share2, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { openAccount } from "@/lib/camera-dock";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAccountAvatar } from "@/lib/account-avatar";
import { getLastSection } from "@/lib/last-section";
import { useProId } from "@/lib/use-pro-id";
import { useCurrentProject, useSharedOpen } from "@/lib/project-sync";
import {
  ROLE_LABEL, cancelInvite, createInvite, initials, inviteLink, kindWord, removePerson, setRole,
  useProjectPeople, usePresence, type Invite, type Online, type Person, type ProjectRole,
} from "@/lib/project-share";
import { placeOf, projectName as nameOfPlace, type ProjectKind } from "@/models/project-state";
import { useLab } from "@/models/lab-store";
import { useLivePos } from "@/lib/live-position";
import { openSimTab, useSimTab } from "@/views/v8/console";

/**
 * Progetti condivisi in the header, beside the "i": a round badge with the faces of the people in the project — a
 * turquoise ring breathing round it and a green dot while someone else has it open — and the count; a tap opens the
 * panel of who is in the project, who is connected now, the invites waiting and (for the owner) the invite form.
 * Signed-in accounts only: guests and signed-out visitors see nothing.
 */
function useKind(): ProjectKind {
  const pro = useProId();
  const path = useLocation({ select: (l) => l.pathname });
  // The simulation open first (an officer working on a vineyard shared with them), then the profile's own.
  if (path.startsWith("/vigneto")) return "vigneto";
  if (path.startsWith("/urbano")) return "piazza";
  if (pro?.kind === "agronomo") return "vigneto";
  if (pro?.kind === "funzionario") return "piazza";
  return getLastSection();
}

function whereOf(path: string, tab: string): string {
  if (path.startsWith("/urbano") || path.startsWith("/vigneto")) return tab === "mappa" ? "sulla mappa" : tab === "sensori" ? "nei sensori" : "nella simulazione";
  if (path.startsWith("/dashboard")) return "nella dashboard";
  if (path.startsWith("/cronologia") || path.startsWith("/benvenuto")) return "nella cronologia";
  return "nell’app";
}

function Face({ name, avatar, size = 28, ring }: { name: string; avatar: string | null; size?: number; ring?: string }) {
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[oklch(0.35_0.03_240)] text-[11px] font-semibold text-white ${ring ?? ""}`} style={{ width: size, height: size }}>
      {avatar ? <img src={avatar} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  );
}

/** Opens the "Chi è in condivisione" panel from elsewhere (the simulation's ⋮ menu). */
export const SHARE_EVENT = "mdt-open-share";
export const openSharePanel = () => window.dispatchEvent(new CustomEvent(SHARE_EVENT));

export function ShareControl() {
  const kind = useKind();
  const { user, id } = useCurrentProject(kind);
  const path = useLocation({ select: (l) => l.pathname });
  const avatar = useAccountAvatar();
  const [me, setMe] = useState<{ id: string; name: string; avatar: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!alive) return;
      if (!u) { setMe(null); return; }
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const name = String(meta["full_name"] ?? meta["name"] ?? (u.email ?? "").split("@")[0] ?? "");
      setMe({ id: u.id, name, avatar: avatar ?? (typeof meta["avatar_url"] === "string" ? (meta["avatar_url"] as string) : null) });
    });
    return () => { alive = false; };
  }, [user, avatar]);
  const share = useProjectPeople(id, user);
  const tab = useSimTab(kind === "piazza" ? "urban" : "vineyard");
  const lab = useLab();
  const projectName = nameOfPlace(placeOf(kind, lab).label);
  // Where this person is on the ground (the map's GPS, while it follows): the colleagues see a named dot there.
  const live = useLivePos();
  const pos = live ? { lat: Math.round(live.lat * 1e5) / 1e5, lng: Math.round(live.lng * 1e5) / 1e5 } : null;
  const online = usePresence(id, me, whereOf(path, tab), pos);
  // The simulation's ⋮ menu asks for this panel by name ("Condivisione"): signed out, the account panel opens instead.
  useEffect(() => {
    const ask = () => {
      if (!user) { toast("Accedi per condividere il progetto", { description: "La condivisione con i colleghi è per gli account Premium." }); openAccount(); return; }
      setOpen(true); void share.reload();
    };
    window.addEventListener(SHARE_EVENT, ask);
    return () => window.removeEventListener(SHARE_EVENT, ask);
  }, [user, share]);
  if (!user) return null;
  const others = online.filter((o) => o.user_id !== user);
  const count = share.people.length;
  const liveNow = others.length > 0;
  const faces = (liveNow ? others : share.people.filter((p) => p.user_id !== user)).slice(0, 2);
  const label = !id ? "Condivisione · progetto non ancora nel cloud" : `Condivisione · ${count} ${count === 1 ? "persona" : "persone"}${liveNow ? `, ${others.length} connesse ora` : ""}`;
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); void share.reload(); }} aria-label={label} title="Chi è in condivisione"
        className="share-badge relative grid size-9 shrink-0 place-items-center rounded-full border border-foreground/15 bg-foreground/[0.06] text-foreground outline-none transition-colors hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring sm:size-10" data-live={liveNow ? "" : undefined}>
        {liveNow && <span className="share-badge-ring pointer-events-none absolute -inset-[3px] rounded-full" aria-hidden="true" />}
        {faces.length ? (
          <span className="flex -space-x-2.5" aria-hidden="true">
            {faces.map((f) => <Face key={f.user_id} name={f.name} avatar={f.avatar} size={faces.length > 1 ? 22 : 26} ring="ring-2 ring-background" />)}
          </span>
        ) : <Users className="size-4 sm:size-[1.15rem]" aria-hidden="true" />}
        {count > 1 && <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[oklch(0.78_0.13_185)] px-1 text-[10px] font-bold leading-none text-[oklch(0.2_0.03_240)] ring-2 ring-background" aria-hidden="true">{count}</span>}
        {liveNow && <span className="share-badge-dot absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 ring-2 ring-background" aria-hidden="true" />}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent overlayClassName="bg-black/45 backdrop-blur-md sm:!fixed sm:!inset-0 sm:!h-auto sm:!min-h-0" className="max-h-[88dvh] grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto overflow-x-hidden overscroll-contain border-foreground/20 bg-card p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_-24px_60px_rgb(0_0_0/0.6)] dark:bg-[oklch(0.25_0.016_258)] max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[1.75rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-bottom-1/2 max-sm:data-[state=closed]:slide-out-to-bottom-1/2 sm:w-[min(480px,calc(100vw-1.5rem))] sm:rounded-2xl">
          <span className="mx-auto -mt-1 h-1.5 w-10 rounded-full bg-foreground/20 sm:hidden" aria-hidden="true" />
          <DialogHeader className="text-left">
            <DialogTitle>Chi è in condivisione</DialogTitle>
            <DialogDescription>{kind === "piazza" ? "Il progetto della piazza" : "Il progetto del vigneto"}: chi ci lavora, chi è connesso adesso e gli inviti.</DialogDescription>
          </DialogHeader>
          <OtherShared kind={kind} onGo={() => setOpen(false)} />
          {!id ? (
            <p className="rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-4 text-sm text-muted-foreground">
              Scegli un luogo nella simulazione: {kindWord(kind)} va nel tuo account e da lì puoi invitare altre persone.
            </p>
          ) : (
            <SharePanel projectId={id} me={user} kind={kind} online={online} share={share} onLeft={() => setOpen(false)} project={projectName} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The project of the other kind shared with this account (an officer invited to a vineyard, or the reverse): the bottom
 * bar shows only the profile's own section, so the way there is here.
 */
function OtherShared({ kind, onGo }: { kind: ProjectKind; onGo: () => void }) {
  const other: ProjectKind = kind === "piazza" ? "vigneto" : "piazza";
  const shared = useSharedOpen(other);
  const navigate = useNavigate();
  if (!shared) return null;
  return (
    <button type="button" onClick={() => { onGo(); openSimTab(other === "piazza" ? "urban" : "vineyard", "mappa"); void navigate({ to: other === "piazza" ? "/urbano" : "/vigneto" }); }}
      className="flex w-full items-center gap-3 rounded-2xl border border-teal-300/30 bg-teal-300/[0.08] px-4 py-3 text-left outline-none transition-colors hover:bg-teal-300/[0.14] focus-visible:ring-2 focus-visible:ring-ring">
      <Users className="size-5 shrink-0 text-teal-300" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{other === "piazza" ? "Apri la piazza condivisa con te" : "Apri il vigneto condiviso con te"}</span>
        <span className="block text-xs text-muted-foreground">Ti hanno invitato: ci lavori anche se il tuo profilo è di un altro settore.</span></span>
      <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

function SharePanel({ projectId, me, kind, online, share, onLeft, project }: { projectId: string; me: string; kind: ProjectKind; online: Online[]; share: ReturnType<typeof useProjectPeople>; onLeft: () => void; project: string }) {
  const owner = share.myRole === "owner";
  const onlineIds = useMemo(() => new Set(online.map((o) => o.user_id)), [online]);
  const others = online.filter((o) => o.user_id !== me);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, f: () => Promise<void>, done?: string) => {
    setBusy(key);
    try { await f(); if (done) toast.success(done); await share.reload(); }
    catch (e) { toast.error("Non è stato possibile", { description: (e as Error).message === "not-removed" ? "Controlla la connessione e riprova." : (e as Error).message }); }
    finally { setBusy(null); }
  };
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {/* Who has it open now. */}
      <section className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3.5" aria-label="Connessi adesso">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
          <Radio className="share-live-icon size-3.5" aria-hidden="true" /> In diretta · {online.length} {online.length === 1 ? "connesso" : "connessi"}
        </div>
        {others.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ci sei solo tu adesso. Quando un collaboratore apre {kindWord(kind)} lo vedi qui.</p>
        ) : (
          <ul className="grid gap-2">
            {others.map((o) => (
              <li key={o.user_id} className="flex items-center gap-2.5">
                <span className="relative"><Face name={o.name} avatar={o.avatar} size={30} /><span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-card" /></span>
                <span className="min-w-0 text-sm"><span className="font-medium">{o.name || "Collaboratore"}</span> <span className="text-muted-foreground">è {o.where}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The people of the project. */}
      <section aria-label="Persone del progetto">
        <h3 className="mb-2 text-sm font-semibold">Persone · {share.people.length}</h3>
        {share.loading && !share.people.length ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Leggo chi c’è…</p> : null}
        {share.error ? <p className="text-sm text-amber-300">Non riesco a leggere le persone del progetto ({share.error}).</p> : null}
        <ul className="divide-y divide-foreground/10 overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.03]">
          {share.people.map((p) => <PersonRow key={p.user_id} p={p} me={me} owner={owner} online={onlineIds.has(p.user_id)} busy={busy}
            onRole={(r) => act(`r${p.user_id}`, () => setRole(projectId, p.user_id, r), `${p.name}: ${ROLE_LABEL[r]}`)}
            onRemove={() => act(`x${p.user_id}`, () => removePerson(projectId, p.user_id), `${p.name} non è più nel progetto`)} />)}
        </ul>
      </section>

      {owner ? <InviteBox projectId={projectId} invites={share.invites} busy={busy} onDone={share.reload} kind={kind} project={project}
        onCancel={(i) => act(`i${i.id}`, () => cancelInvite(i.id), "Invito annullato")} /> : share.myRole ? (
        <button type="button" disabled={busy === "leave"} onClick={() => act("leave", async () => { await removePerson(projectId, me); onLeft(); }, `Sei uscito dal progetto`)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-red-400/40 text-sm font-semibold text-red-300 hover:bg-red-400/10">
          <LogOut className="size-4" aria-hidden="true" /> Esci dal progetto
        </button>
      ) : null}
      {share.myRole === "viewer" && <p className="text-xs text-muted-foreground">Sei in solo visione: puoi guardare il progetto, non modificarlo.</p>}
    </div>
  );
}

function PersonRow({ p, me, owner, online, busy, onRole, onRemove }: { p: Person; me: string; owner: boolean; online: boolean; busy: string | null; onRole: (r: "editor" | "viewer") => void; onRemove: () => void }) {
  const [ask, setAsk] = useState(false);
  const self = p.user_id === me;
  return (
    <li className="flex items-center gap-3 p-3">
      <span className="relative"><Face name={p.name} avatar={p.avatar} size={36} />{online && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 ring-2 ring-card" aria-label="connesso adesso" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{p.name}{self ? " · tu" : ""}</span>
        <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
        {ask && <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">Togliere {p.name} dal progetto?
          <button type="button" className="rounded-full px-2 py-1 hover:bg-foreground/10" onClick={() => setAsk(false)}>Annulla</button>
          <button type="button" className="rounded-full bg-red-500/90 px-2.5 py-1 font-semibold text-white" onClick={() => { setAsk(false); onRemove(); }}>Togli</button></span>}
      </span>
      {owner && p.role !== "owner" ? (
        <span className="flex shrink-0 items-center gap-1">
          <select aria-label={`Ruolo di ${p.name}`} value={p.role} disabled={busy === `r${p.user_id}`} onChange={(e) => onRole(e.target.value as "editor" | "viewer")}
            className="h-8 rounded-full border border-foreground/15 bg-background/60 px-2 text-xs">
            <option value="editor">{ROLE_LABEL.editor}</option>
            <option value="viewer">{ROLE_LABEL.viewer}</option>
          </select>
          <button type="button" onClick={() => setAsk(true)} aria-label={`Togli ${p.name}`} className="grid size-8 place-items-center rounded-full text-red-300 hover:bg-red-400/10"><Trash2 className="size-4" /></button>
        </span>
      ) : <RoleChip role={p.role} />}
    </li>
  );
}

function RoleChip({ role }: { role: ProjectRole }) {
  const tone = role === "owner" ? "bg-[oklch(0.78_0.13_185/0.18)] text-[oklch(0.85_0.12_185)]" : role === "editor" ? "bg-sky-400/15 text-sky-300" : "bg-foreground/10 text-muted-foreground";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{ROLE_LABEL[role]}</span>;
}

function InviteBox({ projectId, invites, busy, onDone, onCancel, kind, project }: { projectId: string; invites: Invite[]; busy: string | null; onDone: () => Promise<void>; onCancel: (i: Invite) => void; kind: ProjectKind; project: string }) {
  const [email, setEmail] = useState("");
  const [role, setRoleChoice] = useState<"editor" | "viewer">("editor");
  const [sending, setSending] = useState(false);
  const [made, setMade] = useState<Invite | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const send = async () => {
    if (!valid) return;
    setSending(true);
    try { const inv = await createInvite(projectId, email, role); setMade(inv); setEmail(""); await onDone(); }
    catch (e) { toast.error("Invito non creato", { description: (e as Error).message }); }
    finally { setSending(false); }
  };
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3" aria-label="Invita">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="size-4" aria-hidden="true" /> Invita una persona</h3>
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input type="email" inputMode="email" autoComplete="email" placeholder="email@esempio.it" value={email} onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-full border border-foreground/15 bg-background/60 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Email della persona da invitare" />
        <div role="radiogroup" aria-label="Cosa può fare" className="grid grid-cols-2 gap-1 rounded-full border border-foreground/15 p-1">
          {(["editor", "viewer"] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRoleChoice(r)}
              className={`h-9 rounded-full text-xs font-semibold transition-colors ${role === r ? "bg-foreground text-background" : "text-foreground/80 hover:bg-foreground/10"}`}>{ROLE_LABEL[r]}</button>
          ))}
        </div>
        <button type="submit" disabled={!valid || sending} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-50">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Crea l’invito
        </button>
      </form>
      {made && <InviteLink inv={made} onClose={() => setMade(null)} fresh kind={kind} project={project} />}
      {invites.length > 0 && (
        <div className="grid gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In attesa · {invites.length}</h4>
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded-2xl border border-dashed border-foreground/15 p-2.5 pl-3">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{i.email}</span><span className="text-xs text-muted-foreground">{ROLE_LABEL[i.role]} · non ancora accettato</span></span>
              <button type="button" onClick={() => mailInvite(i, kind, project)} aria-label={`Manda di nuovo l’invito per email a ${i.email}`} className="grid size-8 place-items-center rounded-full border border-foreground/15 hover:bg-foreground/10"><Mail className="size-4" /></button>
              <CopyButton text={inviteLink(i.token)} label={`Copia il link dell’invito per ${i.email}`} />
              <button type="button" disabled={busy === `i${i.id}`} onClick={() => onCancel(i)} aria-label={`Annulla l’invito per ${i.email}`} className="grid size-8 place-items-center rounded-full text-red-300 hover:bg-red-400/10"><X className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** The invite as an email to its address: the person's own email app opens with the message and the link written. */
export function mailInvite(inv: Invite, kind: ProjectKind, project: string) {
  const link = inviteLink(inv.token);
  const subject = `Invito a lavorare su ${kind === "piazza" ? "la piazza" : "il vigneto"} ${project}`.trim();
  const body = `Ciao,\n\nti invito a lavorare con me su ${kind === "piazza" ? "la piazza" : "il vigneto"}${project ? ` «${project}»` : ""} in Micro Digital Twin (${ROLE_LABEL[inv.role].toLowerCase()}).\n\nApri questo link ed entra con il tuo account (${inv.email}) per accettare:\n${link}\n\nA presto`;
  window.location.href = `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function InviteLink({ inv, onClose, fresh, kind, project }: { inv: Invite; onClose: () => void; fresh?: boolean; kind: ProjectKind; project: string }) {
  const link = inviteLink(inv.token);
  const share = async () => {
    const text = `Ti invito a lavorare con me su Micro Digital Twin (${ROLE_LABEL[inv.role].toLowerCase()}): ${link}`;
    try { if (navigator.share) { await navigator.share({ title: "Invito a un progetto", text, url: link }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(link); toast.success("Link copiato"); } catch { /* not allowed */ }
  };
  return (
    <div className="grid gap-2 rounded-2xl border border-[oklch(0.78_0.13_185/0.4)] bg-[oklch(0.78_0.13_185/0.08)] p-3">
      {fresh && <p className="text-sm"><Check className="mr-1 inline size-4 text-emerald-300" />Invito pronto per <b>{inv.email}</b>. Mandaglielo per email: entrando con quell’account lo accetta.</p>}
      <button type="button" onClick={() => mailInvite(inv, kind, project)} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[oklch(0.78_0.13_185)] text-sm font-semibold text-[oklch(0.2_0.03_240)]"><Mail className="size-4" /> Invia per email a {inv.email}</button>
      <div className="flex items-center gap-2 rounded-full bg-background/60 px-3 py-2 text-xs"><Link2 className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{link}</span></div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void share()} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-foreground/15 text-sm font-semibold hover:bg-foreground/10"><Share2 className="size-4" /> Condividi</button>
        <CopyButton text={link} label="Copia il link" wide />
        <button type="button" onClick={onClose} aria-label="Chiudi" className="grid size-10 place-items-center rounded-full hover:bg-foreground/10"><X className="size-4" /></button>
      </div>
    </div>
  );
}

function CopyButton({ text, label, wide }: { text: string; label: string; wide?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label} onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => toast.error("Non posso copiare qui")); }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-foreground/15 text-sm hover:bg-foreground/10 ${wide ? "h-10 px-4" : "size-8"}`}>
      {done ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}{wide ? (done ? "Copiato" : "Copia") : null}
    </button>
  );
}
