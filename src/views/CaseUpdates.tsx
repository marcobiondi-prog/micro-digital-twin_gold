import { CloudSun, ExternalLink } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { caseLocations, type CaseSourceUpdate, type CaseWeather } from "@/models/case-updates";
import { cases } from "@/models/data";
const date=(v:string)=>{const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Rome"});};
// Publication dates are often day-only (YYYY-MM-DD): show them without a made-up time.
const day=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(`${v}T12:00:00Z`).toLocaleDateString("it-IT",{dateStyle:"short",timeZone:"Europe/Rome"}):date(v);
const number=(v:number|null,s:string)=>v===null?"—":`${v.toLocaleString("it-IT",{maximumFractionDigits:1})}${s}`;
export function CaseWeatherSummary({weather,error}:{weather:CaseWeather|undefined;error:string|null}){
  return <span className="mt-4 block border-t pt-3"><span className="flex items-center gap-1.5 text-xs font-semibold text-primary"><CloudSun className="size-3.5"/>Meteo attuale · Open-Meteo</span>{weather?<><span className="mt-1 block text-sm font-medium text-foreground">{number(weather.temperature," °C")} · UR {number(weather.humidity,"%")} · {number(weather.wind," km/h")}</span><span className="mt-1 block text-[11px] font-normal text-muted-foreground">{date(weather.time)} · ora italiana</span></>:<span className="mt-1 block text-xs font-normal text-muted-foreground">{error??"Meteo non disponibile"}</span>}</span>;
}
export function CaseUpdates({city,weather,source,weatherError,sourceError}:{city:string;weather:CaseWeather|undefined;source:CaseSourceUpdate|undefined;weatherError:string|null;sourceError:string|null}){
  const location=caseLocations.find(p=>p.city===city);
  const study=cases.find(c=>c.city===city);
  // Until the research finds newer publications, show the original publication the case is built on.
  const fallback=!source?.publications.length&&study;
  return <Accordion type="single" collapsible defaultValue="clima" className="mt-5 border-t pt-1">
  <AccordionItem value="clima" className="border-b-0">
    <AccordionTrigger className="justify-between gap-2 py-3 text-xs font-bold uppercase text-muted-foreground hover:no-underline hover:text-muted-foreground">Clima attuale della località</AccordionTrigger>
    <AccordionContent className="pb-4">
      <CaseWeatherSummary weather={weather} error={weatherError}/>{weather&&<p className="mt-2 text-sm">Precipitazioni: {number(weather.precipitation," mm")}</p>}<p className="mt-2 text-xs text-muted-foreground">Dati da modello meteorologico, non misure del progetto. Punto di riferimento approssimativo: {location?.lat}, {location?.lng}{city==="Napa e Central Valley"?" (Napa, non tutta la Central Valley)":city==="Trentino"?" (Trento)":city==="Penedès"?" (Vilafranca del Penedès)":""}.</p><a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary underline" href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Fonte meteo<ExternalLink className="size-3"/></a>
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="pubblicazioni" className="border-b-0">
    <AccordionTrigger className="justify-between gap-2 py-3 text-xs font-bold uppercase text-muted-foreground hover:no-underline hover:text-muted-foreground">Pubblicazioni dalla fonte originale</AccordionTrigger>
    <AccordionContent className="pb-4">
      <p className="mt-2 text-xs text-muted-foreground">{source?.checked_at?`Fonte verificata: ${date(source.checked_at)}`:"Pubblicazione di riferimento del caso studio"}</p>{(source?.error||sourceError)&&<p role="status" className="mt-2 text-xs text-destructive">{source?.error??sourceError}. I risultati già disponibili restano visibili.</p>}<div className="mt-3 space-y-4">{fallback&&<article><a href={study.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-sm font-semibold text-primary underline">{study.sourceLabel}<ExternalLink className="mt-1 size-3 shrink-0"/></a><p className="mt-1 text-xs text-muted-foreground">{study.project} · {study.period}</p><p className="mt-2 text-sm leading-relaxed">{study.claim}</p></article>}{source?.publications.map(p=><article key={p.url}><a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-sm font-semibold text-primary underline">{p.title}<ExternalLink className="mt-1 size-3 shrink-0"/></a><p className="mt-1 text-xs text-muted-foreground">{p.publishedAt?`Pubblicato: ${day(p.publishedAt)}`:"Data di pubblicazione non dichiarata"}</p>{p.excerpt&&<p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{p.excerpt}</p>}</article>)}{source?.checked_at&&source.publications.length===0&&<p className="text-sm text-muted-foreground">Nessuna pubblicazione più recente trovata nell’ultima verifica.</p>}</div><p className="mt-3 text-xs text-muted-foreground">Estratti dalla fonte; i risultati storici restano riferiti al periodo indicato.</p>
    </AccordionContent>
  </AccordionItem>
  </Accordion>;
}