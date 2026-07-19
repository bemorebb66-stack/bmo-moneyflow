import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { ThemeProvider } from "./theme-provider";
import { LIVE_META } from "@/lib/mock-data";
import { DataStatusBar } from "./data-status-bar";
import { MarketIndexPanel } from "./market-index-panel";

interface Props {
  children: ReactNode;
}

export function PageShell({ children }: Props) {
  return (
    <ThemeProvider>
      <div className="min-h-dvh w-full min-w-0 overflow-x-clip bg-background text-foreground">
        <SiteHeader
          asOf={LIVE_META.asOf}
          updatedAt={LIVE_META.updatedAt}
          universeCount={LIVE_META.universeCount}
          status={LIVE_META.status}
          delayTradingDays={LIVE_META.delayTradingDays}
        />
        <main className="mx-auto w-full min-w-0 max-w-[1400px] px-4 py-5 lg:px-6 lg:py-7">
          {children}
        </main>
        <MarketIndexPanel />
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
