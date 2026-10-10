import type { NextConfig } from 'next';

// Static export: `next build` writes the site to site/out.
const nextConfig: NextConfig = {
  output: 'export',
  // Two builds can run side by side (docs and home work in parallel) without clobbering .next.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
