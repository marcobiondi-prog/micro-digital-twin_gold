import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fold } from "@/models/comuni";
import { pickOfficeMail, townEntity, type RegisterOffice } from "@/models/office-email";

/**
 * The official email of a town's office, read from the public administrations' register (its open data, a CKAN
 * datastore): first the town's entry and its code, then its offices with their addresses. The datasets are found by
 * name, and the field names are read loosely, so a renamed column does not break the lookup. Null when nothing matches.
 */
const BASE = "https://indicepa.gov.it/ipa-dati/api/3/action";
type Rec = Record<string, unknown>;
const get = async (path: string): Promise<Rec | null> => {
  try {
    const r = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(10000), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as { success?: boolean; result?: Rec };
    return j.success ? j.result ?? null : null;
  } catch { return null; }
};
const field = (rec: Rec, test: (k: string) => boolean) => { const k = Object.keys(rec).find((x) => test(x.toLowerCase())); return k ? String(rec[k] ?? "").trim() : ""; };

/** The datastore resource of the register's dataset whose name or title matches (enti, unità organizzative). */
const resources = new Map<string, Promise<string | null>>();
function resourceOf(match: RegExp, query: string): Promise<string | null> {
  let p = resources.get(query);
  if (!p) {
    p = get(`package_search?q=${encodeURIComponent(query)}&rows=20`).then((res) => {
      const pkgs = (res?.["results"] as Array<{ name?: string; title?: string; resources?: Array<{ id: string; datastore_active?: boolean; format?: string }> }> | undefined) ?? [];
      for (const pkg of pkgs) {
        if (!match.test(`${pkg.name ?? ""} ${pkg.title ?? ""}`.toLowerCase())) continue;
        const r = (pkg.resources ?? []).find((x) => x.datastore_active) ?? null;
        if (r) return r.id;
      }
      return null;
    });
    void p.then((v) => { if (!v) resources.delete(query); });
    resources.set(query, p);
  }
  return p;
}

const input = z.object({ comune: z.string().trim().min(2).max(80), office: z.string().trim().min(2).max(120), istat: z.string().trim().max(12).optional() });

export const getOfficeEmail = createServerFn({ method: "POST" })
  .inputValidator((data) => input.parse(data))
  .handler(async ({ data }): Promise<{ mail: string; office: string; pec: boolean } | null> => {
    const [entiRes, uoRes] = await Promise.all([resourceOf(/\benti\b/, "enti"), resourceOf(/organizzativ/, "unita organizzative")]);
    // The register not reached (or its datasets not found): an error, so the phone does not keep "no address".
    if (!entiRes || !uoRes) throw new Error("register-unreachable");
    // The town's entry: searched by its name, kept only when it is that very town ("Comune di …"), by ISTAT code when given.
    const name = townEntity(data.comune);
    const found = await get(`datastore_search?resource_id=${entiRes}&q=${encodeURIComponent(name)}&limit=50`);
    if (!found) throw new Error("register-unreachable");
    const enti = (found?.["records"] as Rec[] | undefined) ?? [];
    const ente = enti.find((e) => (data.istat && field(e, (k) => k.includes("istat")).replace(/^0+/, "") === data.istat.replace(/^0+/, "")))
      ?? enti.find((e) => fold(field(e, (k) => k.includes("denominazione") || k.includes("descrizione"))) === fold(name));
    const code = ente ? field(ente, (k) => k.includes("codice_ipa") || k === "cod_amm" || k.includes("codice ipa")) : "";
    if (!code) return null;
    // Its offices with their addresses.
    const uos = await get(`datastore_search?resource_id=${uoRes}&filters=${encodeURIComponent(JSON.stringify({ Codice_IPA: code }))}&limit=1000`)
      ?? await get(`datastore_search?resource_id=${uoRes}&q=${encodeURIComponent(code)}&limit=1000`);
    if (!uos) throw new Error("register-unreachable");
    const recs = ((uos?.["records"] as Rec[] | undefined) ?? []).filter((r) => field(r, (k) => k.includes("codice_ipa") || k === "cod_amm") === code);
    const offices: RegisterOffice[] = recs.map((r) => {
      const mails: RegisterOffice["mails"] = [];
      for (const i of [1, 2, 3, 4, 5]) {
        const mail = field(r, (k) => k === `mail${i}` || k === `mail_${i}`);
        if (!mail.includes("@")) continue;
        const kind = field(r, (k) => k === `tipo_mail${i}` || k === `tipo_mail_${i}`).toLowerCase();
        mails.push({ mail, pec: kind.includes("pec") || /\bpec\b|legalmail|postacert|cert\./i.test(mail) });
      }
      return { name: field(r, (k) => k.includes("descrizione") || k.includes("denominazione")), mails };
    }).filter((o) => o.name && o.mails.length);
    return pickOfficeMail(offices, data.office);
  });
