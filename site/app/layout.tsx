import type { Metadata } from 'next';
import { Azeret_Mono, Ubuntu } from 'next/font/google';
import './globals.css';

const ubuntu = Ubuntu({
  variable: '--font-ubuntu',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

const azeretMono = Azeret_Mono({
  variable: '--font-azeret-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const title = 'codeloop - your product moves forward every day';
const description =
  'Agents do the stages of each job. You approve at the gates. Open source, MIT. Works in Claude Code, Cursor and Codex.';

export const metadata: Metadata = {
  metadataBase: new URL('https://codeloop.protobox.ai'),
  title,
  description,
  alternates: { canonical: 'https://codeloop.protobox.ai' },
  openGraph: { title, description, type: 'website', url: 'https://codeloop.protobox.ai', siteName: 'codeloop' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ubuntu.variable} ${azeretMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint so the page does not flash light then dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('codeloop-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
