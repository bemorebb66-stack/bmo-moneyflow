export function formatKstTimestamp(value: string) {
  if (!value || value === "-") return "확인 중";
  const normalized = value.endsWith(" UTC")
    ? value.replace(" UTC", "Z").replace(" ", "T")
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")} ${part("hour")}:${part("minute")} KST`;
}

export function formatMarketDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.replaceAll("-", ".")
    : "확인 중";
}
