import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { RootShell } from '../components/layout/root-shell';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'DeluxHR',
  description: 'Modern HR. Smarter Workforce.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} min-h-screen bg-slate-50 font-sans text-slate-900`}
      >
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}