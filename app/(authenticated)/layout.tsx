import AppShell from "@/components/AppShell";
import OnlineRoutePrefetch from "@/components/OnlineRoutePrefetch";
import SetupGate from "@/components/SetupGate";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ToastProvider } from "@/components/ToastProvider";
import { DatabaseProvider } from "../providers/DatabaseProvider";
import { ReactQueryProvider } from "../providers/ReactQueryProvider";

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ReactQueryProvider>
      <ToastProvider>
        <DatabaseProvider>
          <ServiceWorkerRegister />
          <SetupGate>
            <OnlineRoutePrefetch />
            <AppShell>{children}</AppShell>
          </SetupGate>
        </DatabaseProvider>
      </ToastProvider>
    </ReactQueryProvider>
  );
}
