function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

// Works with both legacy JWT keys (anon/service_role) and the new opaque keys
// (sb_publishable_/sb_secret_), which must not be sent as a bearer token.
export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);

    // The user's token is always sent: the buckets are private, and without it the storage answers as the anonymous
    // role — an empty list and "Object not found" — so the account's photos read as none (the cloud bar at 0 B).
    // A token too big for the headers (431) is a problem to fix at its source (the account's user data), not here.
    return fetch(input, { ...init, headers, credentials: 'omit' });
  };
}
