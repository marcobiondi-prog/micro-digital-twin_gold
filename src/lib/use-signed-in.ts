import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDemoSignedIn } from "@/lib/demo-login";

/** Signed in with a real session, or with the preview-only simulated sign-in. */
export function useSignedIn(): { signedIn: boolean; demo: boolean } {
  const [real, setReal] = useState(false);
  const demo = useDemoSignedIn();
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReal(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setReal(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { signedIn: real || demo, demo: demo && !real };
}
