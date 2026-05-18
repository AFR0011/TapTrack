import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeInitializer } from "./providers/ThemeInitializer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TapTrack - Personal Finance Tracker",
  description: "Fast daily income and expense tracking",
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
