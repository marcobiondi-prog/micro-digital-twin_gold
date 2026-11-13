import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { createSupabaseFetch } from "./fetch";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    
    const request = getRequest();

    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers available');
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      throw new Error('Unauthorized: No authorization header provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Only Bearer tokens are supported');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new Error('Unauthorized: No token provided');
    }

    if (token.split('.').length !== 3) {
      throw new Error('Unauthorized: Invalid token');
    }

    const supabase = createClient<Database>(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        global: {
          fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Error('Unauthorized: Invalid token');
    }

    if (!data.claims.sub) {
      throw new Error('Unauthorized: No user ID found in token');
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);

export const optionalSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();

    if (!request?.headers) {
      return next({
        context: {
          supabase: null as any,
          userId: null as string | null,
          claims: null as any,
        },
      });
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next({
        context: {
          supabase: null as any,
          userId: null as string | null,
          claims: null as any,
        },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token || token.split('.').length !== 3) {
      return next({
        context: {
          supabase: null as any,
          userId: null as string | null,
          claims: null as any,
        },
      });
    }

    try {
      const supabase = createClient<Database>(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
          global: {
            fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          auth: {
            storage: undefined,
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

      const { data, error } = await supabase.auth.getClaims(token);
      if (!error && data?.claims?.sub) {
        return next({
          context: {
            supabase,
            userId: data.claims.sub,
            claims: data.claims,
          },
        });
      }
    } catch {
      // Ignora errori di verifica: prosegui senza credenziali
    }

    return next({
      context: {
        supabase: null as any,
        userId: null as string | null,
        claims: null as any,
      },
    });
  },
);

