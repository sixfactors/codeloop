import type { Metadata } from 'next';
import './globals.css';

const title = 'codeloop — run your product’s work as lanes';
const description =
  'Lanes are YAML files that list the stages of a job, the skill for each, a check that decides done, and the gates a person approves. Agents do the stages in Claude Code, Cursor or Codex. You approve at the gates. Open source, MIT.';

export const metadata: Metadata = {
  metadataBase: new URL('https://codeloop.protobox.ai'),
  title,
  description,
  alternates: { canonical: 'https://codeloop.protobox.ai' },
  openGraph: {
    title,
    description,
    type: 'website',
    url: 'https://codeloop.protobox.ai',
    siteName: 'codeloop',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Prevent flash: apply saved theme before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('codeloop-theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
