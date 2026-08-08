import { currencySnapshot } from "./currency";

export const fmtPct = (n: number, digits = 2) =>
  `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const fmtBp = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(0)} bp`;

export const fmtMoney = (n: number) => {
  // n in millions USD
  const { currency, rate } = currencySnapshot();
  if (currency === "KRW") {
    const won = n * 1_000_000 * rate;
    if (won >= 1_000_000_000_000) return `${(won / 1_000_000_000_000).toFixed(2)}조원`;
    if (won >= 100_000_000) return `${Math.round(won / 100_000_000).toLocaleString("ko-KR")}억원`;
    return `${Math.round(won).toLocaleString("ko-KR")}원`;
  }
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}B`;
  return `$${n.toFixed(0)}M`;
};

export const fmtPrice = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMcap = (n: number) => {
  const { currency, rate } = currencySnapshot();
  if (currency === "KRW") {
    const won = n * 1_000_000_000 * rate;
    if (won >= 1_000_000_000_000) return `${(won / 1_000_000_000_000).toFixed(1)}조원`;
    return `${(won / 100_000_000).toFixed(0)}억원`;
  }
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}T`;
  return `$${n.toFixed(0)}B`;
};

export const fmtQuote = (n: number) => {
  const { currency, rate } = currencySnapshot();
  return currency === "KRW"
    ? `${Math.round(n * rate).toLocaleString("ko-KR")}원`
    : `$${fmtPrice(n)}`;
};
