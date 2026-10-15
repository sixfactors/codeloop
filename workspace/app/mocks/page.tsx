'use client';

// Every mock in one place, grouped by its story: one thumbnail per frame (`data-screen` section),
// each drawn by the mock's own route in an iframe scrolled to that frame. In-app mocks render from
// this app's /mocks/<folder>/ route, so their thumbnails only exist for the project whose app this
// is; archive mocks (HTML under docs/mocks, a spec folder or .codeloop/mocks) render from the mock
// route on the API. A chip names each story whose spec takes a screen from the mock.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Frame } from 'lucide-react';
import { PageLayout } from '@/components/shared/page-layout';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { useRoutes } from '@/components/providers/project-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useArtifacts } from '@/hooks/use-api';
import { mockUrl } from '@/lib/api';
import type { Artifact } from '@/lib/types';

// The width a mock is laid out at inside a thumbnail; the tile crops and scales it to one frame.
const FRAME_WIDTH = 1280;
const MIN_VIEW = 800;

type Box = { x: number; y: number; w: number; h: number };

/** Where a frame sits in a same-origin mock page, in page pixels; undefined until it renders. */
function frameBox(iframe: HTMLIFrameElement | null, frame?: string): Box | undefined {
  const doc = iframe?.contentDocument;
  const win = iframe?.contentWindow;
  const el = frame ? doc?.querySelector(`[data-screen="${CSS.escape(frame)}"]`) : doc?.body;
  if (!el || !win) return undefined;
  const r = el.getBoundingClientRect();
  return r.width ? { x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height } : undefined;
}

/** Measures the frame once the page loads, and once more after a client-rendered mock fills in. */
function useFrameBox(iframe: React.RefObject<HTMLIFrameElement | null>, frame?: string) {
  const [box, setBox] = useState<Box>();
  const measure = () => {
    const at = () => setBox(frameBox(iframe.current, frame));
    at();
    setTimeout(at, 800);
  };
  return { box, measure };
}

function Thumbnail({ src, frame, title, onOpen }: { src: string; frame?: string; title: string; onOpen: () => void }) {
  const tile = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(320);
  const { box, measure } = useFrameBox(iframe, frame);
  useEffect(() => {
    const el = tile.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Crop to the frame: scale its width to the tile's and shift it to the top-left corner. Moving the
  // iframe, rather than scrolling inside it, keeps the outer page where it is.
  // A narrow frame is shown at most as wide as MIN_VIEW, so it is not blown up past its own size.
  const scale = width / Math.max(box?.w ?? FRAME_WIDTH, MIN_VIEW);
  const shift = box ? `translate(${-box.x * scale}px, ${-box.y * scale}px) ` : '';
  return (
    <figure className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-2" data-testid="mock-frame" data-frame={frame ?? ''} data-measured={box ? 'yes' : 'no'}>
      <div ref={tile} className="relative aspect-video w-full overflow-hidden rounded bg-muted">
        <iframe
          ref={iframe}
          src={src}
          title={title}
          loading="lazy"
          tabIndex={-1}
          onLoad={measure}
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{ width: FRAME_WIDTH, height: Math.max((FRAME_WIDTH * 9) / 16, box ? box.y + box.h : 0), transform: `${shift}scale(${scale})` }}
          data-testid="mock-frame-iframe"
        />
        <button type="button" className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open ${title} full size`} onClick={onOpen} data-testid="mock-frame-open" />
      </div>
      <figcaption className="font-mono text-xs break-all text-muted-foreground">{frame ?? 'whole mock'}</figcaption>
    </figure>
  );
}

function FullSize({ open, src, frame, title, onClose }: { open: boolean; src: string; frame?: string; title: string; onClose: () => void }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[90vh] flex-col sm:max-w-[min(90vw,1400px)]" data-testid="mock-full">
        <DialogHeader className="flex-row items-center gap-2 pr-8">
          <DialogTitle className="min-w-0 truncate">{title}</DialogTitle>
          <Button size="sm" variant="outline" className="ml-auto" nativeButton={false} render={<a href={src} target="_blank" rel="noreferrer" />}><ExternalLink />Open</Button>
        </DialogHeader>
        <iframe ref={iframe} src={src} title={title} onLoad={() => { const go = () => { const b = frameBox(iframe.current, frame); if (b) iframe.current?.contentWindow?.scrollTo(b.x, b.y); }; go(); setTimeout(go, 800); }} className="min-h-0 w-full flex-1 rounded border" data-testid="mock-full-iframe" data-frame={frame ?? ''} />
      </DialogContent>
    </Dialog>
  );
}

export default function MocksPage() {
  const routes = useRoutes();
  const artifacts = useArtifacts();
  const [open, setOpen] = useState<{ src: string; frame?: string; title: string } | null>(null);
  const mocks = (artifacts.data ?? []).filter((a: Artifact) => a.kind === 'mock');
  const srcOf = (a: Artifact) => (a.folder ? routes.mockPage(a.folder) : a.href ? mockUrl(a.href) : '');

  return (
    <PageLayout icon={Frame} breadcrumbs={[{ label: 'Mocks' }]} title="Mocks" description={artifacts.isLoading ? undefined : `${mocks.length} mocks, one thumbnail per frame`}>
      {artifacts.isLoading ? <PageSkeleton statCards={0} showToolbar={false} tableRows={4} />
        : artifacts.error ? <InlineError title="Mocks failed to load" error={artifacts.error} onRetry={() => artifacts.refetch()} />
        : !mocks.length ? <EmptyState icon={Frame} title="No mocks yet" description="A story's mock stage draws one; `codeloop mock new <id>` starts it." />
        : (
          <div className="flex flex-col gap-6">
            {mocks.map((a) => {
              const src = srcOf(a);
              const frames = a.frames?.length ? a.frames : [undefined];
              return (
                <section key={a.id} className="flex flex-col gap-2" data-testid="mock-group" data-card={a.cardId ?? ''}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    {a.cardId ? <Link href={routes.card(a.cardId)} className="shrink-0 font-mono text-xs text-muted-foreground hover:underline" data-testid="mock-group-id">{a.cardId}</Link> : null}
                    <h2 className="min-w-0 text-sm font-medium" data-testid="mock-group-title">{a.title}</h2>
                    {(a.referencedBy ?? []).map((r) => (
                      <Badge key={`${r.cardId}-${r.screen}`} variant="outline" className="rounded-full" data-testid="mock-used-by" render={<Link href={routes.card(r.cardId)} />}>
                        used by {r.cardId} · {r.screen}
                      </Badge>
                    ))}
                    <span className="ml-auto font-mono text-[11px] break-all text-muted-foreground">{a.id}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {frames.map((f) => <Thumbnail key={f ?? 'all'} src={src} frame={f} title={`${a.cardId ?? a.id} · ${f ?? a.title}`} onOpen={() => setOpen({ src, frame: f, title: `${a.cardId ?? ''} ${a.title} · ${f ?? 'whole mock'}` })} />)}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      <FullSize open={Boolean(open)} src={open?.src ?? ''} frame={open?.frame} title={open?.title ?? ''} onClose={() => setOpen(null)} />
    </PageLayout>
  );
}
