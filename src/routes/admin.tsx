import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Bot, CheckCircle2, FileSearch, History, RefreshCw, Shield, ShieldOff, Trash2, Users, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, SectionTitle } from "@/views/health";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  clearAiPause, deleteApproval, deleteUser, getAdminOverview, getMyAdminStatus, listAdminUsers, listAiPauses,
  listApprovals, listAuditLog, listCaseSourceStatus, refreshCaseSourcesNow, setApprovalStatus, setUserAdmin,
  setUserBanned, type AdminApproval,
} from "@/controllers/admin.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pannello di controllo — MICRO DIGITAL TWIN" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useSessionUserId() {
  const [state, setState] = useState<{ ready: boolean; userId: string | null }>({ ready: false, userId: null });
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setState({ ready: true, userId: data.session?.user.id ?? null }));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setState({ ready: true, userId: session?.user.id ?? null }));
    return () => subscription.unsubscribe();
  }, []);
  return state;
}

function AdminPage() {
  const session = useSessionUserId();
  const status = useQuery({
    queryKey: ["admin", "status", session.userId],
    queryFn: () => getMyAdminStatus(),
    enabled: Boolean(session.userId),
  });

  if (!session.ready || (session.userId && status.isPending)) return <Notice title="Caricamento…" />;
  if (!session.userId) return <Notice title="Accesso richiesto">Accedi con un account amministratore dal pulsante account in alto a destra.</Notice>;
  if (status.isError) return <Notice title="Errore">{errorText(status.error)}</Notice>;
  if (!status.data?.isAdmin) return <Notice title="Accesso negato">Il tuo account non ha il ruolo di amministratore.</Notice>;
  return <AdminPanel selfId={session.userId} />;
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card><h1 className="text-lg font-semibold">{title}</h1>{children && <p className="mt-2 text-sm text-muted-foreground">{children}</p>}</Card>
    </div>
  );
}

function AdminPanel({ selfId }: { selfId: string }) {
  return (
    <div>
      <SectionTitle eyebrow="Backend" title="Pannello di controllo" desc="Gestisci utenti, pareri esterni, fonti dei casi studio e servizi del Micro Digital Twin." />
      <Overview />
      <Tabs defaultValue="users" className="mt-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="users"><Users className="size-4" />Utenti</TabsTrigger>
          <TabsTrigger value="approvals"><CheckCircle2 className="size-4" />Pareri</TabsTrigger>
          <TabsTrigger value="sources"><FileSearch className="size-4" />Fonti casi</TabsTrigger>
          <TabsTrigger value="ai"><Bot className="size-4" />Servizio AI</TabsTrigger>
          <TabsTrigger value="log"><History className="size-4" />Registro</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab selfId={selfId} /></TabsContent>
        <TabsContent value="approvals"><ApprovalsTab /></TabsContent>
        <TabsContent value="sources"><SourcesTab /></TabsContent>
        <TabsContent value="ai"><AiTab /></TabsContent>
        <TabsContent value="log"><LogTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function Overview() {
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: () => getAdminOverview() });
  if (q.isError) return <Card className="text-sm text-destructive">{errorText(q.error)}</Card>;
  const d = q.data;
  const stat = (label: string, value: ReactNode) => (
    <Card className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-semibold">{value ?? "…"}</p></Card>
  );
  const svc = (label: string, ok: boolean | undefined) => (
    <Badge variant={ok ? "secondary" : "destructive"} className="gap-1">{ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}{label}</Badge>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stat("Utenti", d?.users)}
        {stat("Amministratori", d?.admins)}
        {stat("Pareri in attesa", d?.pendingApprovals)}
        {stat("Dashboard salvate", d?.dashboards)}
        {stat("Riconoscimento AI", d ? (d.aiPaused ? "In pausa" : "Attivo") : undefined)}
      </div>
      {d && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Servizi configurati:</span>
        {svc("AI (Gemini)", d.services.ai)}{svc("Google Maps", d.services.googleMaps)}{svc("Parallel", d.services.parallel)}{svc("Copernicus", d.services.copernicus)}{svc("Cron", d.services.cron)}
      </div>}
    </div>
  );
}

function useAdminMutation<T>(fn: (input: T) => Promise<unknown>, success: string, invalidate: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success);
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: ["admin", key] });
      void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      void qc.invalidateQueries({ queryKey: ["admin", "log"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
}

function Confirm({ trigger, title, description, action, onConfirm }: { trigger: ReactNode; title: string; description: string; action: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TableCard({ children, empty, loading, error }: { children: ReactNode; empty: boolean; loading: boolean; error: unknown }) {
  return (
    <Card className="mt-3 overflow-x-auto p-0">
      {error ? <p className="p-4 text-sm text-destructive">{errorText(error)}</p>
        : loading ? <p className="p-4 text-sm text-muted-foreground">Caricamento…</p>
        : empty ? <p className="p-4 text-sm text-muted-foreground">Nessun elemento.</p>
        : children}
    </Card>
  );
}

function UsersTab({ selfId }: { selfId: string }) {
  const q = useQuery({ queryKey: ["admin", "users"], queryFn: () => listAdminUsers() });
  const [search, setSearch] = useState("");
  const users = useMemo(() => (q.data?.users ?? []).filter((u) => (u.email ?? u.id).toLowerCase().includes(search.trim().toLowerCase())), [q.data, search]);
  const roleM = useAdminMutation((v: { userId: string; admin: boolean }) => setUserAdmin({ data: v }), "Ruolo aggiornato", ["users"]);
  const banM = useAdminMutation((v: { userId: string; banned: boolean }) => setUserBanned({ data: v }), "Stato account aggiornato", ["users"]);
  const delM = useAdminMutation((v: { userId: string }) => deleteUser({ data: v }), "Utente eliminato", ["users"]);
  return (
    <div>
      <Input placeholder="Cerca per email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      <TableCard loading={q.isPending} error={q.error} empty={!users.length}>
        <Table>
          <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Accesso</TableHead><TableHead>Registrato</TableHead><TableHead>Ultimo accesso</TableHead><TableHead>Stato</TableHead><TableHead className="text-right">Azioni</TableHead></TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email ?? u.id}{u.id === selfId && <span className="ml-1 text-xs text-muted-foreground">(tu)</span>}</TableCell>
                <TableCell>{u.provider ?? "—"}</TableCell>
                <TableCell>{fmt(u.createdAt)}</TableCell>
                <TableCell>{fmt(u.lastSignInAt)}</TableCell>
                <TableCell className="space-x-1">
                  {u.isAdmin && <Badge>Admin</Badge>}
                  {u.banned && <Badge variant="destructive">Sospeso</Badge>}
                  {!u.confirmed && <Badge variant="outline">Non confermato</Badge>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" disabled={u.id === selfId || roleM.isPending} onClick={() => roleM.mutate({ userId: u.id, admin: !u.isAdmin })} title={u.isAdmin ? "Rimuovi admin" : "Rendi admin"}>
                    {u.isAdmin ? <ShieldOff /> : <Shield />}<span className="sr-only md:not-sr-only">{u.isAdmin ? "Rimuovi admin" : "Rendi admin"}</span>
                  </Button>
                  <Button size="sm" variant="ghost" disabled={u.id === selfId || banM.isPending} onClick={() => banM.mutate({ userId: u.id, banned: !u.banned })} title={u.banned ? "Riattiva" : "Sospendi"}>
                    <Ban /><span className="sr-only md:not-sr-only">{u.banned ? "Riattiva" : "Sospendi"}</span>
                  </Button>
                  <Confirm
                    title="Eliminare questo utente?"
                    description={`L’account ${u.email ?? u.id}, il profilo, la dashboard, i pareri e i file caricati verranno eliminati definitivamente.`}
                    action="Elimina"
                    onConfirm={() => delM.mutate({ userId: u.id })}
                    trigger={<Button size="sm" variant="ghost" className="text-destructive" disabled={u.id === selfId || delM.isPending} title="Elimina"><Trash2 /><span className="sr-only">Elimina</span></Button>}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

const STATUS: Record<AdminApproval["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  attesa: { label: "In attesa", variant: "outline" },
  approvato: { label: "Approvato", variant: "secondary" },
  respinto: { label: "Respinto", variant: "destructive" },
};

function ApprovalsTab() {
  const q = useQuery({ queryKey: ["admin", "approvals"], queryFn: () => listApprovals() });
  const [filter, setFilter] = useState<"tutti" | AdminApproval["status"]>("tutti");
  const rows = (q.data?.approvals ?? []).filter((a) => filter === "tutti" || a.status === filter);
  const statusM = useAdminMutation((v: { id: string; status: AdminApproval["status"] }) => setApprovalStatus({ data: v }), "Parere aggiornato", ["approvals"]);
  const delM = useAdminMutation((v: { id: string }) => deleteApproval({ data: v }), "Richiesta eliminata", ["approvals"]);
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {(["tutti", "attesa", "approvato", "respinto"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "tutti" ? "Tutti" : STATUS[f].label}</Button>
        ))}
      </div>
      <TableCard loading={q.isPending} error={q.error} empty={!rows.length}>
        <Table>
          <TableHeader><TableRow><TableHead>Ente</TableHead><TableHead>Richiedente</TableHead><TableHead>Creata</TableHead><TableHead>Decisa</TableHead><TableHead>Stato</TableHead><TableHead className="text-right">Azioni</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.entity}</TableCell>
                <TableCell>{a.userEmail ?? a.userId}</TableCell>
                <TableCell>{fmt(a.createdAt)}</TableCell>
                <TableCell>{fmt(a.decidedAt)}</TableCell>
                <TableCell><Badge variant={STATUS[a.status].variant}>{STATUS[a.status].label}</Badge>{a.applied && <span className="ml-1 text-xs text-muted-foreground">applicato</span>}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {a.status !== "approvato" && <Button size="sm" variant="ghost" disabled={statusM.isPending} onClick={() => statusM.mutate({ id: a.id, status: "approvato" })}>Approva</Button>}
                  {a.status !== "respinto" && <Button size="sm" variant="ghost" disabled={statusM.isPending} onClick={() => statusM.mutate({ id: a.id, status: "respinto" })}>Respingi</Button>}
                  {a.status !== "attesa" && <Button size="sm" variant="ghost" disabled={statusM.isPending} onClick={() => statusM.mutate({ id: a.id, status: "attesa" })}>Riapri</Button>}
                  <Confirm title="Eliminare la richiesta?" description={`La richiesta di parere a ${a.entity} e il suo link verranno eliminati.`} action="Elimina" onConfirm={() => delM.mutate({ id: a.id })}
                    trigger={<Button size="sm" variant="ghost" className="text-destructive" title="Elimina"><Trash2 /><span className="sr-only">Elimina</span></Button>} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

function SourcesTab() {
  const q = useQuery({ queryKey: ["admin", "sources"], queryFn: () => listCaseSourceStatus() });
  const refreshM = useAdminMutation(() => refreshCaseSourcesNow(), "Ricerca delle fonti completata", ["sources"]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={refreshM.isPending} onClick={() => refreshM.mutate(undefined)}><RefreshCw className={refreshM.isPending ? "animate-spin" : ""} />Aggiorna ora</Button>
        <p className="text-xs text-muted-foreground">Cerca nuove pubblicazioni sui siti originali dei casi studio (Parallel). Può richiedere fino a 30 secondi.</p>
      </div>
      <TableCard loading={q.isPending} error={q.error} empty={!q.data?.sources.length}>
        <Table>
          <TableHeader><TableRow><TableHead>Caso</TableHead><TableHead>Pubblicazioni</TableHead><TableHead>Ultima verifica riuscita</TableHead><TableHead>Ultimo tentativo</TableHead><TableHead>Errore</TableHead></TableRow></TableHeader>
          <TableBody>
            {q.data?.sources.map((s) => (
              <TableRow key={s.caseId}>
                <TableCell className="font-medium">{s.caseId}</TableCell>
                <TableCell>{s.publications}</TableCell>
                <TableCell>{fmt(s.checkedAt)}</TableCell>
                <TableCell>{fmt(s.attemptedAt)}</TableCell>
                <TableCell className="text-destructive">{s.error ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

function AiTab() {
  const q = useQuery({ queryKey: ["admin", "ai"], queryFn: () => listAiPauses() });
  const clearM = useAdminMutation((v: { scope: string }) => clearAiPause({ data: v }), "Servizio AI riattivato", ["ai"]);
  return (
    <div>
      <p className="text-sm text-muted-foreground">Quando il fornitore AI rifiuta l’accesso (credito esaurito o chiave non valida) il riconoscimento AR si mette in pausa per non ripetere richieste inutili. Riattivalo dopo aver risolto il problema.</p>
      <TableCard loading={q.isPending} error={q.error} empty={!q.data?.pauses.length}>
        <Table>
          <TableHeader><TableRow><TableHead>Ambito</TableHead><TableHead>Codice</TableHead><TableHead>Motivo</TableHead><TableHead>Dal</TableHead><TableHead className="text-right">Azioni</TableHead></TableRow></TableHeader>
          <TableBody>
            {q.data?.pauses.map((p) => (
              <TableRow key={p.scope}>
                <TableCell className="font-medium">{p.scope}</TableCell>
                <TableCell>{p.status}</TableCell>
                <TableCell>{p.reason}</TableCell>
                <TableCell>{fmt(p.updated_at)}</TableCell>
                <TableCell className="text-right"><Button size="sm" disabled={clearM.isPending} onClick={() => clearM.mutate({ scope: p.scope })}>Riattiva</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

function LogTab() {
  const q = useQuery({ queryKey: ["admin", "log"], queryFn: () => listAuditLog() });
  return (
    <TableCard loading={q.isPending} error={q.error} empty={!q.data?.entries.length}>
      <Table>
        <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Chi</TableHead><TableHead>Azione</TableHead><TableHead>Oggetto</TableHead><TableHead>Dettagli</TableHead></TableRow></TableHeader>
        <TableBody>
          {q.data?.entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap">{fmt(e.created_at)}</TableCell>
              <TableCell>{e.actor_email ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{e.action}</TableCell>
              <TableCell className="font-mono text-xs">{e.target ?? ""}</TableCell>
              <TableCell className="font-mono text-xs">{e.details && JSON.stringify(e.details) !== "{}" ? JSON.stringify(e.details) : ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
