'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyInstall({ command = 'npm install -g @protoboxai/codeloop' }: { command?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="group flex w-full min-w-0 items-center gap-3 rounded-lg bg-code-bg px-4 py-3 text-left font-mono text-[13px] text-code-foreground transition-colors hover:bg-code-header sm:w-auto sm:px-5 sm:text-sm"
      aria-label={`Copy: ${command}`}
    >
      <span className="text-code-filename">$</span>
      <span className="truncate">{command}</span>
      <span className="ml-1 shrink-0 text-code-filename transition-colors group-hover:text-primary">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </span>
    </button>
  );
}
