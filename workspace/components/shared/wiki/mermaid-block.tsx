'use client';

// A ```mermaid fence rendered as a diagram. mermaid is a large parser, so it is imported on first
// use, after the page has painted its text. The theme follows the app's, and a diagram that fails
// to parse shows the error and the source instead of nothing, so a typo in a page is visible.
import { useEffect, useId, useState } from 'react';
import { useTheme } from 'next-themes';

let seq = 0;

export function MermaidBlock({ chart }: { chart: string }) {
  const { resolvedTheme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: resolvedTheme === 'dark' ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'inherit' });
        const { svg } = await mermaid.render(`m-${id}-${seq++}`, chart.trim());
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, resolvedTheme, id]);

  if (error) {
    return (
      <div className="not-prose my-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
        <p className="mb-2 font-medium text-destructive">Diagram did not render: {error.split('\n')[0]}</p>
        <pre className="overflow-x-auto whitespace-pre-wrap text-muted-foreground">{chart}</pre>
      </div>
    );
  }
  if (!svg) return <pre className="not-prose my-4 overflow-x-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground" aria-busy="true">{chart}</pre>;
  return <div className="not-prose my-4 overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full" data-mermaid dangerouslySetInnerHTML={{ __html: svg }} />;
}
