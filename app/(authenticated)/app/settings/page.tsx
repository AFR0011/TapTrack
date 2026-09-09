import SettingsWorkspace from '@/components/SettingsWorkspace';
import { CurrencySettingsCard } from '@/components/CurrencySettingsCard';

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <SettingsWorkspace />
      <CurrencySettingsCard />
    </div>
  );
}
