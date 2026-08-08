from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def replace_exact(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count == 0:
        if new and new in text:
            print(f"already applied: {label}")
            return
        raise SystemExit(f"migration pattern not found for {label}: {path}")
    if count != 1:
        raise SystemExit(f"migration pattern is ambiguous for {label}: {path} ({count} matches)")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"applied: {label}")


def migrate_reports() -> None:
    path = ROOT / "src/components/ReportsWorkspace.tsx"
    replace_exact(
        path,
        "  const [ratesLoading, setRatesLoading] = useState(false);\n",
        "",
        "remove effect-owned exchange-rate loading state",
    )
    replace_exact(
        path,
        """  useEffect(() => {\n    if (!unifyToTRY || rates) return;\n    setRatesLoading(true);\n    fetch('/api/exchange-rates')\n      .then((response) => response.json())\n      .then((data: ExchangeRates) => setRates(data))\n      .catch(() => setRates({ USD: 38.5, EUR: 42 }))\n      .finally(() => setRatesLoading(false));\n  }, [rates, unifyToTRY]);\n\n  const activeRates = unifyToTRY ? rates : null;\n""",
        """  useEffect(() => {\n    if (!unifyToTRY || rates) return;\n    fetch('/api/exchange-rates')\n      .then((response) => response.json())\n      .then((data: ExchangeRates) => setRates(data))\n      .catch(() => setRates({ USD: 38.5, EUR: 42 }));\n  }, [rates, unifyToTRY]);\n\n  const ratesLoading = unifyToTRY && rates === null;\n  const activeRates = unifyToTRY ? rates : null;\n""",
        "derive exchange-rate loading state",
    )


def migrate_settings() -> None:
    path = ROOT / "src/components/SettingsWorkspace.tsx"
    replace_exact(
        path,
        "import { formatMoney, parseAmountInput } from '@/format';\n",
        "import { parseAmountInput } from '@/format';\n",
        "remove unused formatMoney import",
    )
    replace_exact(
        path,
        """  useEffect(() => {\n    void refreshSyncStatus();\n    window.addEventListener('online', refreshSyncStatus);\n""",
        """  useEffect(() => {\n    queueMicrotask(() => {\n      void refreshSyncStatus();\n    });\n    window.addEventListener('online', refreshSyncStatus);\n""",
        "defer initial sync-status refresh",
    )
    replace_exact(
        path,
        "              key={balance.id}\n",
        "              key={`${balance.id}:${balance.amount}`}\n",
        "remount balance editor when persisted value changes",
    )
    replace_exact(
        path,
        """\n  useEffect(() => {\n    setInput(String(amount));\n    setError('');\n  }, [amount]);\n\n""",
        "\n",
        "remove prop-to-state balance synchronization effect",
    )


def main() -> None:
    migrate_reports()
    migrate_settings()


if __name__ == "__main__":
    main()
