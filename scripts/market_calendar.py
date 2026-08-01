"""Deterministic US regular-session calendar used by signal and Replay rules.

The module intentionally owns the small calendar contract needed by this
project instead of guessing trading days from weekdays.  Dates are exchange
session labels in America/New_York; timestamps are timezone-aware UTC values.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


CALENDAR_VERSION = "XNYS-regular/2026.2"
EXCHANGE_TIMEZONE = ZoneInfo("America/New_York")
REGULAR_OPEN = time(9, 30)
REGULAR_CLOSE = time(16, 0)
EARLY_CLOSE = time(13, 0)

# Exchange-wide exceptional closures that cannot be derived from weekday rules.
# The Replay product currently accepts modern electronic brokerage exports, so
# the catalog starts with the 2001 closure and is versioned when extended.
EXCEPTIONAL_CLOSURES = frozenset(
    {
        date(2001, 9, 11),
        date(2001, 9, 12),
        date(2001, 9, 13),
        date(2001, 9, 14),
        date(2004, 6, 11),
        date(2007, 1, 2),
        date(2012, 10, 29),
        date(2012, 10, 30),
        date(2018, 12, 5),
        date(2025, 1, 9),
    }
)


def _nth_weekday(year: int, month: int, weekday: int, occurrence: int) -> date:
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (occurrence - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    last = date(year, month, monthrange(year, month)[1])
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _observed(day: date) -> date:
    if day.weekday() == 5:  # Saturday -> preceding Friday
        return day - timedelta(days=1)
    if day.weekday() == 6:  # Sunday -> following Monday
        return day + timedelta(days=1)
    return day


def _new_year_holiday(year: int) -> date | None:
    """Return the NYSE New Year's closure for the named calendar year.

    Unlike other exchange holidays, a Saturday January 1 is not observed on
    the preceding Friday because that Friday is a month/year-end session.
    """
    day = date(year, 1, 1)
    if day.weekday() == 5:
        return None
    if day.weekday() == 6:
        return day + timedelta(days=1)
    return day


def _easter_sunday(year: int) -> date:
    # Anonymous Gregorian algorithm, valid for the Gregorian calendar.
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return date(year, month, day)


def full_holidays(year: int) -> frozenset[date]:
    holidays = {
        _nth_weekday(year, 1, 0, 3),  # Martin Luther King Jr. Day
        _nth_weekday(year, 2, 0, 3),  # Washington's Birthday
        _easter_sunday(year) - timedelta(days=2),
        _last_weekday(year, 5, 0),
        _observed(date(year, 7, 4)),
        _nth_weekday(year, 9, 0, 1),
        _nth_weekday(year, 11, 3, 4),
        _observed(date(year, 12, 25)),
    }
    new_year = _new_year_holiday(year)
    if new_year is not None:
        holidays.add(new_year)
    if year >= 2022:
        holidays.add(_observed(date(year, 6, 19)))
    return frozenset(holidays)


def early_close_days(year: int) -> frozenset[date]:
    thanksgiving = _nth_weekday(year, 11, 3, 4)
    candidates = {thanksgiving + timedelta(days=1)}

    july_fourth = date(year, 7, 4)
    if july_fourth.weekday() in range(1, 6):
        candidates.add(july_fourth - timedelta(days=1))

    christmas_eve = date(year, 12, 24)
    if christmas_eve.weekday() < 5:
        candidates.add(christmas_eve)
    return frozenset(day for day in candidates if is_trading_day(day))


def is_trading_day(day: date) -> bool:
    return day.weekday() < 5 and day not in full_holidays(day.year) and day not in EXCEPTIONAL_CLOSURES


def session_bounds(day: date) -> tuple[datetime, datetime]:
    if not is_trading_day(day):
        raise ValueError(f"{day.isoformat()} is not an XNYS trading session")
    close_time = EARLY_CLOSE if day in early_close_days(day.year) else REGULAR_CLOSE
    session_open = datetime.combine(day, REGULAR_OPEN, EXCHANGE_TIMEZONE)
    session_close = datetime.combine(day, close_time, EXCHANGE_TIMEZONE)
    return session_open.astimezone(timezone.utc), session_close.astimezone(timezone.utc)


def previous_trading_day(day: date) -> date:
    candidate = day - timedelta(days=1)
    while not is_trading_day(candidate):
        candidate -= timedelta(days=1)
    return candidate


def next_trading_day(day: date) -> date:
    candidate = day + timedelta(days=1)
    while not is_trading_day(candidate):
        candidate += timedelta(days=1)
    return candidate


def first_session_after(available_at: datetime) -> date:
    if available_at.tzinfo is None:
        raise ValueError("available_at must include a timezone")
    local = available_at.astimezone(EXCHANGE_TIMEZONE)
    candidate = local.date()
    if is_trading_day(candidate):
        session_open, _ = session_bounds(candidate)
        if available_at.astimezone(timezone.utc) < session_open:
            return candidate
    return next_trading_day(candidate)
