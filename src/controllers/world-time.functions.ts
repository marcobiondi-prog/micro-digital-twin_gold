import { createServerFn } from "@tanstack/react-start";

/** The server's clock (kept on world time), so the app can correct a phone whose clock is off. */
export const getWorldTime = createServerFn({ method: "GET" }).handler(async () => ({ now: Date.now() }));
