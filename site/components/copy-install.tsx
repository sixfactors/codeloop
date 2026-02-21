'use client';

import { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

export function CopyInstall() {
  const [copied, setCopied] = useState(false);
  const command = 'npm install -g @sixfactors-ai/codeloop';

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-3 font-mono text-sm transition-all hover:border-accent/50 hover:bg-surface-2"
    >
      <Terminal className="h-4 w-4 text-accent" />
      <span className="text-muted-foreground">$</span>
      <span>{command}</span>
      <span className="ml-2 text-muted-foreground transition-colors group-hover:text-accent">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </span>
    </button>
  );
}
