import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./responsive-layouts.css";
import { ThemeInitializer } from "./providers/ThemeInitializer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TapTrack - Personal Finance Tracker",
  description: "Fast daily income and expense tracking",
  applicationName: "TapTrack",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/taptrack-icon.svg",
    apple: "/icons/taptrack-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}
