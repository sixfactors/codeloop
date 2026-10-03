export function Footer() {
  return (
    <footer className="border-t border-border/50 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold">codeloop</span>
          <span className="text-xs text-muted-foreground">
            a{' '}
            <a
              href="https://protobox.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground transition-colors hover:text-accent"
            >
              Protobox
            </a>{' '}
            project
          </span>
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
          <a href="https://codeloop.protobox.ai" className="transition-colors hover:text-foreground">
            codeloop.protobox.ai
          </a>
        </div>
      </div>
    </footer>
  );
}
