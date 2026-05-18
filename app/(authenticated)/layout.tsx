import AppShell from "@/components/AppShell";
import SetupGate from "@/components/SetupGate";
import { DatabaseProvider } from "../providers/DatabaseProvider";
import { ReactQueryProvider } from "../providers/ReactQueryProvider";
import { ToastProvider } from "@/components/ToastProvider";

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ReactQueryProvider>
      <ToastProvider>
        <DatabaseProvider>
          <SetupGate>
            <AppShell>{children}</AppShell>
          </SetupGate>
        </DatabaseProvider>
      </ToastProvider>
    </ReactQueryProvider>
  );
}
