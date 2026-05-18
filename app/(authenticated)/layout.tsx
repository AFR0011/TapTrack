import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AppShell from "@/components/AppShell";
import SetupGate from "@/components/SetupGate";
import { DatabaseProvider } from "../providers/DatabaseProvider";
import { ReactQueryProvider } from "../providers/ReactQueryProvider";
import { ToastProvider } from "@/components/ToastProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TapTrack - Personal Finance Tracker",
  description: "Fast daily income and expense tracking",
};

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ReactQueryProvider>
          <ToastProvider>
            <DatabaseProvider>
              <SetupGate>
                <AppShell>{children}</AppShell>
              </SetupGate>
            </DatabaseProvider>
          </ToastProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
