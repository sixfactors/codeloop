export const API_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}`
  : '';

// `codeloop serve` prints a URL carrying a token; every write has to send it back. It is kept for
// the tab's lifetime so a reload or a link without the query string still works.
function token(): string {
  if (typeof window === 'undefined') return '';
  const fromUrl = new URLSearchParams(window.location.search).get('token');
  if (fromUrl) {
    window.sessionStorage.setItem('codeloop-token', fromUrl);
    return fromUrl;
  }
  return window.sessionStorage.getItem('codeloop-token') ?? '';
}

export function writeHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-codeloop-token': token() };
}
