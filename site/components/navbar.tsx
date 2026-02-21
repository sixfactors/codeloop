'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { GitHubStars } from './github-stars';
import { ThemeToggle } from './theme-toggle';

const links = [
  { label: 'Pipeline', href: '#loop' },
  { label: 'How It Works', href: '#knowledge' },
  { label: 'Get Started', href: '#quickstart' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a href="#" className="font-mono text-lg font-semibold tracking-tight">
          codeloop
        </a>

        {/* Desktop */}
        <div className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
          <GitHubStars />
          <ThemeToggle />
          <a
            href="#quickstart"
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-light"
          >
            Install
          </a>
        </div>

        {/* Mobile toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setOpen(!open)}
            className="text-muted-foreground"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border/50 bg-background px-6 pb-4 pt-2 md:hidden">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
          <div className="mt-2 flex items-center gap-3">
            <GitHubStars />
            <a
              href="#quickstart"
              onClick={() => setOpen(false)}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground"
            >
              Install
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
