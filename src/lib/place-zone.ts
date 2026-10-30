import { validTimeZone } from "@/models/world-clock";

/**
 * The time zone of a place from its coordinates, worked out on the device (a map of the world's zones, loaded only
 * when needed, no network): null while unknown or where it fails.
 */
export async function placeZoneOf(lat: number, lng: number): Promise<string | null> {
  try {
    const { default: tzlookup } = await import("@photostructure/tz-lookup");
    return validTimeZone(tzlookup(lat, lng));
  } catch { return null; }
}
