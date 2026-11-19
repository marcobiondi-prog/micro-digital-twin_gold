import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { raceOverpass } from "@/lib/overpass-race";
import { siteConstraintsQuery, siteDrawsQuery, siteParksQuery, type SiteEl } from "@/models/site-context";

/**
 * The surroundings asked from the app's server too (the phone asks at the same time, lib/site-context-client): from
 * there the map servers often answer when the phone's network or a busy server keeps the request waiting. Only the
 * app's own three queries, built here from the place, so nothing else can be asked through it.
 */
export const getSiteEls = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    part: z.enum(["draws", "constraints", "parks"]),
    lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
    ring: z.array(z.tuple([z.number(), z.number()])).max(400).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<SiteEl[]> => {
    const q = data.part === "draws" ? siteDrawsQuery(data.lat, data.lng, data.ring) : data.part === "constraints" ? siteConstraintsQuery(data.lat, data.lng, data.ring) : siteParksQuery(data.lat, data.lng, data.ring);
    return raceOverpass<SiteEl>(q, data.part === "parks" ? 12000 : 22000, { "User-Agent": "MicroDigitalTwin/1.0" });
  });
