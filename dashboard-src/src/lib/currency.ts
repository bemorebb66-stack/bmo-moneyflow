import { useEffect, useState } from "react";

export type DisplayCurrency = "USD" | "KRW";

type ExchangeRatePayload = {
  base: "USD";
  quote: "KRW";
  rate: number;
  marketDate: string;
  updated: string;
};

let displayCurrency: DisplayCurrency = "USD";
let usdKrwRate = 0;

export function configureCurrency(currency: DisplayCurrency, rate: number) {
  displayCurrency = currency;
  usdKrwRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
}

export function currencySnapshot() {
  return { currency: displayCurrency, rate: usdKrwRate };
}

export function useCurrencyPreference() {
  const [currency, setCurrencyState] = useState<DisplayCurrency>(() =>
    typeof window !== "undefined" && localStorage.getItem("bvt-currency") === "KRW"
      ? "KRW"
      : "USD",
  );
  const [exchange, setExchange] = useState<ExchangeRatePayload | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/exchange_rate.json", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`exchange rate ${response.status}`);
        return response.json() as Promise<ExchangeRatePayload>;
      })
      .then((payload) => {
        if (active && payload.rate > 0) setExchange(payload);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const effectiveCurrency = currency === "KRW" && exchange ? "KRW" : "USD";
  configureCurrency(effectiveCurrency, exchange?.rate ?? 0);

  const setCurrency = (next: DisplayCurrency) => {
    setCurrencyState(next);
    localStorage.setItem("bvt-currency", next);
  };

  return { currency: effectiveCurrency, requestedCurrency: currency, setCurrency, exchange };
}
