import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// The shipped build is a standalone Next server that `codeloop serve` mounts in its own process,
// so /api and /mocks are same-origin and need no rewrite. NEXT_OUTPUT=export is the escape hatch
// back to a static export (dynamic routes then need their own generateStaticParams).
// `next dev` has no API of its own: /api and /mocks are rewritten to a running `codeloop serve`;
// writes need scripts/dev-proxy.mjs in front because the API refuses a foreign Origin.
const exporting = process.env.NEXT_OUTPUT === 'export';
const proxy = process.env.NODE_ENV === 'development' || process.env.CODELOOP_DEV_PROXY ? (process.env.CODELOOP_DEV_PROXY ?? 'http://127.0.0.1:4043') : '';

const nextConfig: NextConfig = {
  output: exporting ? 'export' : 'standalone',
  // Trace from this folder, not the repo root, so .next/standalone/server.js sits at the top.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // The API is served without a trailing slash; the redirect would turn /api/cards into /api/cards/.
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: { unoptimized: true },
  ...(proxy && !exporting
    ? {
        async rewrites() {
          return [
            { source: '/api/:path*', destination: `${proxy}/api/:path*` },
            { source: '/mocks/:path*', destination: `${proxy}/mocks/:path*` },
          ];
        },
      }
    : {}),
};

export default nextConfig;
