import { createMiddleware } from '@tanstack/react-start'
import { supabase } from './client'

// Must be registered as a global `functionMiddleware` in `src/start.ts`; otherwise
// the browser never attaches the bearer token to serverFn RPCs.
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      let session = data.session;
      const now = Math.floor(Date.now() / 1000);
      if (!session || (session.expires_at && session.expires_at <= now + 60)) {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (!error && refreshed.session) {
          session = refreshed.session;
        }
      }
      token = session?.access_token;
    } catch {
      // ignore
    }

    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
