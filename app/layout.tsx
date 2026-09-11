import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import "./responsive-layouts.css";
import { ThemeInitializer } from "./providers/ThemeInitializer";
import { BRAND } from "@/brand";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: `${BRAND.name} — Your personal ledger`,
  description: BRAND.description,
  applicationName: BRAND.name,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/taptrack-icon.svg",
    apple: "/icons/taptrack-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#495140",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${newsreader.variable}`}>
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}
