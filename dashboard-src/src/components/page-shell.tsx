import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { ThemeProvider } from "./theme-provider";
import { LIVE_META } from "@/lib/mock-data";
import { DataStatusBar } from "./data-status-bar";
import { MarketIndexPanel } from "./market-index-panel";
import { useCurrencyPreference } from "@/lib/currency";

interface Props {
  children: ReactNode;
}

export function PageShell({ children }: Props) {
  const currency = useCurrencyPreference();
  return (
    <ThemeProvider>
      <div className="min-h-dvh w-full min-w-0 overflow-x-clip bg-background text-foreground">
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-lg transition-transform focus:translate-y-0"
        >
          본문으로 바로가기
        </a>
        <SiteHeader
          asOf={LIVE_META.asOf}
          updatedAt={LIVE_META.updatedAt}
          universeCount={LIVE_META.universeCount}
          status={LIVE_META.status}
          delayTradingDays={LIVE_META.delayTradingDays}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-[1680px] px-4 py-5 outline-none lg:px-6 lg:py-7"
        >
          <div className="mx-auto grid min-w-0 max-w-[1400px] gap-5 2xl:max-w-none 2xl:grid-cols-[minmax(0,1fr)_220px]">
            <div key={currency.currency} className="min-w-0">{children}</div>
            <MarketIndexPanel currency={currency} />
          </div>
        </main>
        <SiteFooter />
      </div>
    </ThemeProvider>
  );
}

export function PageHeading({
  title,
  description,
  showDataStatus = true,
}: {
  title: string;
  description: string;
  showDataStatus?: boolean;
}) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {showDataStatus && <DataStatusBar />}
    </div>
  );
}
