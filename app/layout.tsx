import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Redlined1',
  description: 'Automotive CRM and shop operations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('redlined1-theme');
            if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
          } catch(e) {}
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
