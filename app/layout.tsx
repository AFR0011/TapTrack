import type { Metadata, Viewport } from 'next';
import { Inter, Newsreader } from 'next/font/google';
import { BRAND } from '@/brand';
import './globals.css';
import './responsive-layouts.css';
import { ThemeInitializer } from './providers/ThemeInitializer';

const PUBLIC_ORIGIN = 'https://ravel-fawn.vercel.app';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_ORIGIN),
  title: `${BRAND.name} — Your personal ledger`,
  description: BRAND.description,
  applicationName: BRAND.name,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: BRAND.name,
    title: `${BRAND.name} — Your personal ledger`,
    description: BRAND.description,
  },
  twitter: {
    card: 'summary',
    title: `${BRAND.name} — Your personal ledger`,
    description: BRAND.description,
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/ravel-icon.svg',
    apple: '/icons/ravel-icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#495140',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${newsreader.variable}`}>
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}
