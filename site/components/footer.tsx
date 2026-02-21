function SixfactorsLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 7h8l-4 5h8l-4 5H5l4-5H1l4-5z" fill="#dc424a" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border/50 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold">codeloop</span>
          <span className="text-xs text-muted-foreground">by</span>
          <a
            href="https://sixfactors.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-accent"
          >
            <SixfactorsLogo className="h-4 w-4" />
            Sixfactors
          </a>
          <span className="text-xs text-muted-foreground">&middot; MIT License</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <a
            href="https://github.com/sixfactors/codeloop"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href="https://sixfactors.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            sixfactors.ai
          </a>
        </div>
      </div>
    </footer>
  );
}
