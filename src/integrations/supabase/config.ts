// The app always talks to this Supabase project, whatever the hosting environment says.
// Both values are public by design: they ship in the browser bundle, and Row Level
// Security in supabase/migrations protects the data. Never put the secret key here:
// SUPABASE_SERVICE_ROLE_KEY stays a server-only environment variable.
export const SUPABASE_URL = "https://dxmtfczkgzsjevlvwabh.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vgjB8jgNe4_4ltOwOinsLw_xPdrRSW9";
