export const fmtPct = (n: number, digits = 2) =>
  `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const fmtBp = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(0)} bp`;

export const fmtMoney = (n: number) => {
  // n in millions USD
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}B`;
  return `$${n.toFixed(0)}M`;
};

export const fmtPrice = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMcap = (n: number) => {
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}T`;
  return `$${n.toFixed(0)}B`;
};
