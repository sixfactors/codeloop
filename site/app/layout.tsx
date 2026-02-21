import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'codeloop — Code agents that project manage themselves',
  description:
    'Your AI agent plans the work, tracks its own tasks, and learns from every mistake — across sessions, across tools.',
  openGraph: {
    title: 'codeloop — Code agents that project manage themselves',
    description:
      'Your AI agent plans the work, tracks its own tasks, and learns from every mistake — across sessions, across tools.',
    type: 'website',
    url: 'https://codeloop.sixfactors.ai',
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
