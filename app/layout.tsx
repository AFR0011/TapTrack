import type { Metadata, Viewport } from 'next';
import { Inter, Newsreader } from 'next/font/google';
import { BRAND } from '@/brand';
import './globals.css';
import './responsive-layouts.css';
import { ThemeInitializer } from './providers/ThemeInitializer';

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
  title: `${BRAND.name} — Your personal ledger`,
  description: BRAND.description,
  applicationName: BRAND.name,
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
