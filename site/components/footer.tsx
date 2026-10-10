const link = 'transition-colors hover:text-foreground';

export function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-mono font-medium text-foreground">codeloop</span>
          <span>·</span>
          <span>
            a{' '}
            <a href="https://protobox.ai" target="_blank" rel="noopener noreferrer" className={link}>
              Protobox
            </a>{' '}
            project
          </span>
          <span>·</span>
          <span>MIT</span>
        </div>
        <div className="flex items-center gap-x-2">
          <a href="https://github.com/sixfactors/codeloop" target="_blank" rel="noopener noreferrer" className={link}>
            GitHub
          </a>
          <span>·</span>
          <a href="https://codeloop.protobox.ai" className={link}>
            codeloop.protobox.ai
          </a>
        </div>
      </div>
    </footer>
  );
}
