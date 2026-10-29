# Da fare

Idee e modifiche rimandate, da riprendere quando l'utente lo chiede.

## Login Google senza l'indirizzo Supabase

**Problema:** nella schermata di accesso Google compare `dxmtfczkgzsjevlvwabh.supabase.co`
(l'indirizzo del progetto Supabase). Rinominare il progetto in Supabase non cambia nulla:
Google mostra l'indirizzo, non il nome, e il codice del progetto non si può modificare.

**Soluzione scelta (gratuita):** fare il login Google direttamente nell'app con
Google Identity Services e `supabase.auth.signInWithIdToken({ provider: "google", token, nonce })`,
al posto di `signInWithOAuth` in `src/views/account-control.tsx`. Google mostrerà così
l'indirizzo dell'app (es. `micro-digital-twin-gold.vercel.app`) invece di quello di Supabase.

**Cosa serve prima di iniziare:**

- Google Cloud, progetto `micro-digital-twin-gold` → Credenziali → client OAuth web:
  aggiungere gli indirizzi Vercel (produzione e anteprima del ramo `test`) tra le
  "Origini JavaScript autorizzate".
- L'ID client OAuth (pubblico, finisce con `.apps.googleusercontent.com`) come variabile
  `VITE_GOOGLE_CLIENT_ID` su Vercel; dichiararla in `src/vite-env.d.ts`.
- Supabase → Authentication → Providers → Google: lo stesso ID client deve essere tra i
  Client ID autorizzati (gestire il nonce oppure attivare "Skip nonce check").
- Mantenere `signInWithOAuth` come ripiego se la variabile manca.

**Alternative scartate:**

- Dominio personalizzato Supabase (es. `auth.tuodominio.it`): serve un dominio proprio e il
  piano Pro più il componente aggiuntivo, circa 35 $ al mese.
- Nome dell'app nella schermata di consenso Google (Branding): compare solo dopo la verifica
  del marchio, difficile con un indirizzo `supabase.co` che non è nostro.
