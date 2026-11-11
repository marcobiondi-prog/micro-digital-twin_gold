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

    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url ?? '';
    const authHeader = headers.get('Authorization');

    // Storage list, download, and sign endpoints do not require user Bearer tokens on the public bucket.
    // If a legacy session has a bloated JWT (> 2000 chars), sending it causes Cloudflare / Kong 431 errors.
    const isStorageRead = rawUrl.includes('/storage/v1/object/list/') ||
      rawUrl.includes('/storage/v1/object/sign/') ||
      (!init?.method || init.method.toUpperCase() === 'GET') && rawUrl.includes('/storage/v1/object/');

    if (isStorageRead && authHeader && authHeader.length > 2000) {
      headers.delete('Authorization');
    }

    try {
      let res = await fetch(input, { ...init, headers, credentials: 'omit' });
      // If server returns 431 (Header Too Large), strip Authorization and retry with apikey only
      if (res.status === 431 && headers.has('Authorization')) {
        headers.delete('Authorization');
        res = await fetch(input, { ...init, headers, credentials: 'omit' });
      }
      return res;
    } catch (err) {
      // If fetch failed completely due to header error, retry once without Authorization
      if (headers.has('Authorization')) {
        headers.delete('Authorization');
        return fetch(input, { ...init, headers, credentials: 'omit' });
      }
      throw err;
    }
  };
}
