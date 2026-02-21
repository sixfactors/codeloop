'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

export function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch('https://api.github.com/repos/sixfactors/codeloop')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.stargazers_count === 'number') setStars(d.stargazers_count);
      })
      .catch(() => {});
  }, []);

  return (
    <a
      href="https://github.com/sixfactors/codeloop"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
    >
      <Star className="h-3.5 w-3.5" />
      <span>Star</span>
      {stars !== null && (
        <>
          <span className="mx-0.5 h-3 w-px bg-border" />
          <span className="font-medium tabular-nums">{stars}</span>
        </>
      )}
    </a>
  );
}
