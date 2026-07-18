import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Users,
} from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";
import { INSIDER_ROWS, LIVE_META, LOCKUP_ROWS } from "@/lib/mock-data";
import { fmtMoney } from "@/lib/format";

type EventKind = "insider" | "lockup";
type EventFilter = "all" | EventKind;

type CalendarEvent = {
  id: string;
  date: string;
  kind: EventKind;
  ticker: string;
  title: string;
  detail: string;
  href: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStartFromMarketDate() {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(LIVE_META.asOf)
    ? parseDate(LIVE_META.asOf)
    : new Date();
  return new Date(base.getFullYear(), base.getMonth(), 1);
}

function buildEvents(): CalendarEvent[] {
  const insiderEvents = INSIDER_ROWS.filter((row) => row.filedDate).map(
    (row, index) => ({
      id: `insider-${row.ticker}-${row.filedDate}-${index}`,
      date: row.filedDate,
      kind: "insider" as const,
      ticker: row.ticker,
      title: `${row.type === "buy" ? "내부자 매수" : "내부자 매도"} · ${row.ticker}`,
      detail: `${row.insider} (${row.role}) · ${fmtMoney(row.amount)}`,
      href: `/insider/?ticker=${encodeURIComponent(row.ticker)}`,
    }),
  );
  const lockupEvents = LOCKUP_ROWS.filter((row) => row.unlockDate).map(
    (row) => ({
      id: `lockup-${row.ticker}-${row.unlockDate}`,
      date: row.unlockDate,
      kind: "lockup" as const,
      ticker: row.ticker,
      title: `IPO 락업 해제 · ${row.ticker}`,
      detail: `${row.company}${row.estValue > 0 ? ` · 예상 ${fmtMoney(row.estValue)}` : ""}`,
      href: `/ipo-lockup/?ticker=${encodeURIComponent(row.ticker)}`,
    }),
  );
  return [...insiderEvents, ...lockupEvents].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function EventCalendar() {
  const [month, setMonth] = useState(monthStartFromMarketDate);
  const [filter, setFilter] = useState<EventFilter>("all");
  const [selectedDate, setSelectedDate] = useState(
    /^\d{4}-\d{2}-\d{2}$/.test(LIVE_META.asOf)
      ? LIVE_META.asOf
      : dateKey(new Date()),
  );
  const events = useMemo(buildEvents, []);
  const filteredEvents = useMemo(
    () => events.filter((event) => filter === "all" || event.kind === filter),
    [events, filter],
  );
  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) {
      const rows = map.get(event.date) ?? [];
      rows.push(event);
      map.set(event.date, rows);
    }
    return map;
  }, [filteredEvents]);

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(1 - firstDay.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
  const selectedEvents = eventMap.get(selectedDate) ?? [];
  const monthEvents = filteredEvents.filter((event) => {
    const date = parseDate(event.date);
    return (
      date.getFullYear() === month.getFullYear() &&
      date.getMonth() === month.getMonth()
    );
  });

  const moveMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(dateKey(next));
  };
  const moveToLatest = () => {
    const latest = monthStartFromMarketDate();
    setMonth(latest);
    setSelectedDate(
      /^\d{4}-\d{2}-\d{2}$/.test(LIVE_META.asOf)
        ? LIVE_META.asOf
        : dateKey(new Date()),
    );
  };

  return (
    <Card className="mt-5">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold sm:text-lg">
                통합 이벤트 캘린더
              </h2>
              <p className="text-[11px] text-muted-foreground">
                내부자 공시일과 IPO 락업 해제일 · 이번 달 {monthEvents.length}건
              </p>
            </div>
          </div>
          <div className="inline-flex h-9 w-fit items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
            {(
              [
                ["all", "전체"],
                ["insider", "내부자"],
                ["lockup", "IPO 락업"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-medium",
                  filter === id
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="이전 달"
              className="grid h-9 w-9 place-items-center rounded-md border border-border hover:bg-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3">
              <strong className="text-sm tabular sm:text-base">
                {month.getFullYear()}년 {month.getMonth() + 1}월
              </strong>
              <button
                type="button"
                onClick={moveToLatest}
                className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
              >
                기준월
              </button>
            </div>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="다음 달"
              className="grid h-9 w-9 place-items-center rounded-md border border-border hover:bg-secondary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 border-l border-t border-border/70 text-center text-[10px] font-medium text-muted-foreground">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="border-b border-r border-border/70 py-1.5"
              >
                {weekday}
              </div>
            ))}
            {days.map((day) => {
              const key = dateKey(day);
              const dayEvents = eventMap.get(key) ?? [];
              const inMonth = day.getMonth() === month.getMonth();
              const selected = selectedDate === key;
              const insiderCount = dayEvents.filter(
                (event) => event.kind === "insider",
              ).length;
              const lockupCount = dayEvents.length - insiderCount;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  aria-label={`${key} · 이벤트 ${dayEvents.length}건`}
                  aria-pressed={selected}
                  className={cn(
                    "min-h-14 border-b border-r border-border/70 p-1 text-left align-top transition-colors sm:min-h-24 sm:p-1.5",
                    !inMonth && "bg-surface-2/40 text-muted-foreground/45",
                    selected && "bg-brand/5 ring-1 ring-inset ring-brand/45",
                    !selected && "hover:bg-secondary/50",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded-full text-[10px] tabular sm:h-6 sm:w-6 sm:text-xs",
                      key === LIVE_META.asOf && "bg-brand text-white",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 sm:block">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div
                          key={event.id}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full sm:mb-1 sm:h-auto sm:w-full sm:truncate sm:rounded px-0 sm:px-1 sm:py-0.5 sm:text-[9px]",
                            event.kind === "insider"
                              ? "bg-info sm:bg-info/10 sm:text-info"
                              : "bg-danger sm:bg-danger/10 sm:text-danger",
                          )}
                        >
                          <span className="hidden sm:inline">
                            {event.ticker}
                          </span>
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[8px] text-muted-foreground sm:text-[9px]">
                          +{dayEvents.length - 2}
                        </div>
                      )}
                    </div>
                  )}
                  <span className="sr-only">
                    내부자 {insiderCount}건, IPO 락업 {lockupCount}건
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-border/70 bg-surface-2/35">
            <div className="border-b border-border/70 px-3 py-2.5 text-xs font-semibold tabular sm:px-4">
              {selectedDate.replace(/-/g, ".")} · {selectedEvents.length}건
            </div>
            <div className="divide-y divide-border/60">
              {selectedEvents.map((event) => (
                <a
                  key={event.id}
                  href={event.href}
                  className="flex min-h-14 items-center gap-3 px-3 py-2.5 hover:bg-secondary/50 sm:px-4"
                >
                  <div
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-md",
                      event.kind === "insider"
                        ? "bg-info/10 text-info"
                        : "bg-danger/10 text-danger",
                    )}
                  >
                    {event.kind === "insider" ? (
                      <Users className="h-4 w-4" />
                    ) : (
                      <LockKeyhole className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold sm:text-sm">
                      {event.title}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {event.detail}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              ))}
              {selectedEvents.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  선택한 날짜에 등록된 이벤트가 없습니다.
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-info" /> 내부자 거래 공시일
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-danger" /> IPO 락업 해제일
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
