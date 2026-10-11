/**
 * Which project (if any) this request is for, and whether the hub or a standalone `codeloop
 * serve` is answering it. Both signals come from headers the server set before Next ever saw the
 * request — `hubListener`/`splitListener` in src/lib/next-server.ts — never from guessing at the
 * URL here: a page that duplicated that parsing could drift from what the server actually routed.
 */
// A dynamic import, not a static one: `next/headers` is a Server Component API, and this file is
// also reachable from client components (through api.ts/routes.ts). A static `import {headers}`
// here would pull it into the client bundle and fail the build even though the call below never
// runs there; the dynamic form keeps it out of that bundle's graph entirely.

export async function currentProjectServer(): Promise<string | undefined> {
  if (typeof window !== 'undefined') return undefined;
  try {
    const { headers } = await import('next/headers');
    return (await headers()).get('x-codeloop-project') ?? undefined;
  } catch {
    return undefined; // outside a request (e.g. a build-time call); no project is ever in scope then
  }
}

export async function hubModeServer(): Promise<boolean> {
  if (typeof window !== 'undefined') return false;
  try {
    const { headers } = await import('next/headers');
    return (await headers()).get('x-codeloop-mode') === 'hub';
  } catch {
    return false;
  }
}

/**
 * The browser-side read of the same signal. There is no header to read client side, so this
 * parses the URL directly — safe only because switching projects is always a full navigation
 * (the project switcher uses a plain `<a>`, never client-side routing), so the path always
 * reflects the project whose data is actually loaded in this tab.
 */
export function currentProjectBrowser(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const m = window.location.pathname.match(/^\/p\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

export function hubModeBrowser(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/p/');
}
