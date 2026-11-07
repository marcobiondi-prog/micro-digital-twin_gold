import { describe,expect,it } from "vitest";
import { caseLocations,parseCaseWeather,sourceDomain,sourcePublications } from "@/models/case-updates";
import { cases } from "@/models/data";
describe("Current case data",()=>{
  it("maps current weather to every respective case",()=>{
    expect(caseLocations.map(p=>p.city)).toEqual(cases.map(p=>p.city));
    const rows=cases.map((_,i)=>({current:{time:1792364400,temperature_2m:15+i,relative_humidity_2m:65,wind_speed_10m:8,precipitation:0}}));
    expect(parseCaseWeather(rows)[4]?.temperature).toBe(19);expect(parseCaseWeather(rows)[4]?.city).toBe("Campobasso");expect(()=>parseCaseWeather(rows.slice(1))).toThrow("Incomplete weather locations");
  });
  it("keeps publications only from the respective source",()=>{
    expect(sourcePublications({results:[{title:"Update",url:"https://www.mdpi.com/article",publish_date:"2026-10-18",excerpts:["Evidence"]},{title:"Wrong",url:"https://other.test/article"},{title:"Unsafe",url:"javascript:alert(1)"}]},"https://www.mdpi.com/2073-4441/15/14/2506")).toEqual([{title:"Update",url:"https://www.mdpi.com/article",publishedAt:"2026-10-18",excerpt:"Evidence"}]);
  });
  it("keeps up to six distinct publications from the source and its subdomains, newest first",()=>{
    const results=[{title:"Old",url:"https://www.mdpi.com/a",publish_date:"2023-01-01"},{title:"Undated",url:"https://www.mdpi.com/b"},{title:"New",url:"https://pubs.mdpi.com/c",publish_date:"2026-05-01"},{title:"Duplicate",url:"https://www.mdpi.com/a",publish_date:"2023-01-01"},...Array.from({length:6},(_,i)=>({title:`Extra ${i}`,url:`https://www.mdpi.com/x${i}`,publish_date:`2024-0${i+1}-01`}))];
    const publications=sourcePublications({results},"https://www.mdpi.com/2073-4441/15/14/2506");
    expect(publications).toHaveLength(6);
    expect(publications[0]?.title).toBe("New");
    expect(new Set(publications.map(p=>p.url)).size).toBe(6);
    expect(sourcePublications({results:results.slice(0,4)},"https://www.mdpi.com").map(p=>p.title)).toEqual(["New","Old","Undated"]);
  });
  it("searches each case on its publisher’s whole domain, not only the subdomain of the reference page",()=>{
    expect(cases.map(c=>sourceDomain(c.sourceUrl))).toEqual(["urban-initiative.eu","ssph-journal.org","sciencespo.fr","copernicus.org","isprambiente.gov.it","termolionline.it","consorzioiserniavenafro.it","worldcitiessummit.com.sg","urbreath.eu","aqua4d.com","bewaterwise.com","trentinodigitale.it","mdpi.com","acs.org"]);
    expect(sourcePublications({results:[{title:"Main site",url:"https://aqua4d.com/news/2025"}]},"https://news.aqua4d.com/report.pdf")).toHaveLength(1);
  });
  it("never invents a publication date",()=>{expect(sourcePublications({results:[{title:"Article",url:"https://www.mdpi.com/article",excerpts:null}],warnings:null},"https://www.mdpi.com")[0]?.publishedAt).toBeNull();});
  it("keeps the Romanian Living Lab tied to its original source and reference point",()=>{
    const cluj=cases.find(c=>c.city==="Cluj-Napoca");
    expect(cluj?.country).toBe("Romania");
    expect(cluj?.sourceUrl).toBe("https://urbreath.eu/pilots/pilot-4-continental-climatic-zone/");
    expect(caseLocations.find(p=>p.city==="Cluj-Napoca")).toEqual({city:"Cluj-Napoca",lat:46.7712,lng:23.5857});
  });
});