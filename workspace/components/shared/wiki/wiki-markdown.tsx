'use client';

// The wiki's markdown renderer: react-markdown + GFM, heading ids for the table of contents, and a
// few block tags reachable from plain markdown as HTML — <callout type="warn" title="…">,
// <cards><card title="…" href="…">…</card></cards>, <steps><step>…</step></steps> — built on the
// app's Alert and Card. The `prose` class is the app's own (globals.css) over the Protobox tokens.
// Loaded through next/dynamic by WikiMarkdown so the parser is not in the first-load bundle.

import type { ComponentProps, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import Link from 'next/link';
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tag = { children?: ReactNode; title?: string; type?: string; href?: string; node?: unknown };

const strip = ({ node: _node, ...rest }: Tag) => rest;

const CUSTOM = {
  callout: (p: Tag) => {
    const { type, title, children } = strip(p);
    const t = type === 'warn' || type === 'warning' ? 'warn' : type === 'error' ? 'error' : 'info';
    const Icon = t === 'warn' ? AlertTriangle : t === 'error' ? OctagonAlert : Info;
    return (
      <Alert variant={t === 'error' ? 'destructive' : 'default'} className={cn('not-prose my-4', t === 'warn' && 'border-warning/50 [&>svg]:text-warning')}>
        <Icon />
        {title ? <AlertTitle>{title}</AlertTitle> : null}
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    );
  },
  cards: (p: Tag) => <div className="not-prose my-4 grid gap-3 sm:grid-cols-2">{strip(p).children}</div>,
  card: (p: Tag) => {
    const { title, href, children } = strip(p);
    const body = (
      <Card className="h-full py-4 transition-colors hover:bg-accent/60">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">{title}</CardTitle>
          {children ? <CardDescription>{children}</CardDescription> : null}
        </CardHeader>
      </Card>
    );
    return href ? <Link href={href} className="no-underline">{body}</Link> : body;
  },
  steps: (p: Tag) => <ol className="not-prose my-4 flex list-none flex-col gap-3 border-l pl-6 [counter-reset:step]">{strip(p).children}</ol>,
  step: (p: Tag) => (
    <li className="relative [counter-increment:step] before:absolute before:-left-[1.9rem] before:flex before:size-6 before:items-center before:justify-center before:rounded-full before:bg-muted before:text-xs before:font-medium before:content-[counter(step)]">
      {strip(p).children}
    </li>
  ),
};

const components: Components = {
  a: ({ href, children, node: _node, ...rest }: ComponentProps<'a'> & { node?: unknown }) => {
    const h = href ?? '';
    // Relative links between wiki files (../gotchas/x.md) stay inside the app.
    if (h.startsWith('http') || h.startsWith('#') || h.startsWith('mailto:')) return <a href={h} target={h.startsWith('http') ? '_blank' : undefined} rel="noreferrer" {...rest}>{children}</a>;
    return <Link href={h} {...rest}>{children}</Link>;
  },
  ...(CUSTOM as unknown as Components),
};

export default function WikiMarkdownImpl({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose max-w-none text-[15px] leading-relaxed [&_pre]:text-[13px]', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSlug]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
