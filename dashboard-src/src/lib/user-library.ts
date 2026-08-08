import { useSyncExternalStore } from "react";

export const USER_LIBRARY_KEY = "bvt:user-library";
export const LEGACY_WATCHLIST_KEY = "bmoWatch";
export const CORRUPT_BACKUP_KEY = "bvt:user-library:corrupt-backup";
export const USER_LIBRARY_VERSION = 1;
export const MAX_WATCHLIST_ITEMS = 500;
export const MAX_SAVED_SCANNERS = 100;

export type ScannerPeriod = "1d" | "5d" | "20d" | "60d";
export type ScannerInsight = "all" | "new" | "persistent" | "overheated";
export type ScannerPreset =
  | "trading-value-surge"
  | "up-with-volume"
  | "down-with-volume"
  | "sector-leader"
  | "large-cap-interest";
export type ScannerSortKey =
  | "price"
  | "change"
  | "volume"
  | ScannerPeriod
  | "marketCap"
  | "signal";
export type ScannerSortMode = "desc" | "asc" | "average";

export type SavedScannerCriteria = {
  query: string;
  period: ScannerPeriod;
  insight: ScannerInsight;
  preset: ScannerPreset | null;
  priceDirection: "up" | "down" | null;
  tradingValueDirection: "up" | "down" | null;
  minMarketCap: number;
  sort: { key: ScannerSortKey; mode: ScannerSortMode };
};

export type WatchlistItem = {
  ticker: string;
  addedAt: string;
  updatedAt: string;
};

export type SavedScanner = {
  id: string;
  name: string;
  criteriaVersion: 1;
  criteria: SavedScannerCriteria;
  createdAt: string;
  updatedAt: string;
};

export type UserLibraryData = {
  schemaVersion: 1;
  storeRevision: number;
  updatedAt: string;
  migrations: { bmoWatch: boolean };
  watchlist: WatchlistItem[];
  savedScanners: SavedScanner[];
};

export type UserLibrarySnapshot = {
  data: UserLibraryData;
  persistence: "persistent" | "memory" | "read-only";
  notice: string | null;
};

export type LibraryMutationResult = {
  ok: boolean;
  persistent: boolean;
  reason?: "duplicate-name" | "duplicate" | "limit" | "not-found" | "read-only";
  item?: SavedScanner;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type StoreOptions = {
  storage?: StorageLike | null | (() => StorageLike | null);
  now?: () => Date;
  randomId?: () => string;
};

const PERIODS = new Set<ScannerPeriod>(["1d", "5d", "20d", "60d"]);
const INSIGHTS = new Set<ScannerInsight>([
  "all",
  "new",
  "persistent",
  "overheated",
]);
const PRESETS = new Set<ScannerPreset>([
  "trading-value-surge",
  "up-with-volume",
  "down-with-volume",
  "sector-leader",
  "large-cap-interest",
]);
const SORT_KEYS = new Set<ScannerSortKey>([
  "price",
  "change",
  "volume",
  "1d",
  "5d",
  "20d",
  "60d",
  "marketCap",
  "signal",
]);
const SORT_MODES = new Set<ScannerSortMode>(["desc", "asc", "average"]);
const DIRECTIONS = new Set(["up", "down"] as const);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const validDate = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function normalizeTicker(value: unknown) {
  if (typeof value !== "string") return null;
  const ticker = value.trim().toUpperCase().replaceAll(".", "-");
  return /^[A-Z0-9-]{1,12}$/.test(ticker) ? ticker : null;
}

export function normalizeScannerName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 50);
}

const comparableName = (value: string) =>
  normalizeScannerName(value).toLocaleLowerCase("ko-KR");

export function normalizeScannerCriteria(
  value: Partial<SavedScannerCriteria> | null | undefined,
): SavedScannerCriteria {
  const period = PERIODS.has(value?.period as ScannerPeriod)
    ? (value?.period as ScannerPeriod)
    : "20d";
  const insight = INSIGHTS.has(value?.insight as ScannerInsight)
    ? (value?.insight as ScannerInsight)
    : "all";
  const preset = PRESETS.has(value?.preset as ScannerPreset)
    ? (value?.preset as ScannerPreset)
    : null;
  const priceDirection = DIRECTIONS.has(
    value?.priceDirection as "up" | "down",
  )
    ? (value?.priceDirection as "up" | "down")
    : null;
  const tradingValueDirection = DIRECTIONS.has(
    value?.tradingValueDirection as "up" | "down",
  )
    ? (value?.tradingValueDirection as "up" | "down")
    : null;
  const key = SORT_KEYS.has(value?.sort?.key as ScannerSortKey)
    ? (value?.sort?.key as ScannerSortKey)
    : "20d";
  const mode = SORT_MODES.has(value?.sort?.mode as ScannerSortMode)
    ? (value?.sort?.mode as ScannerSortMode)
    : "desc";
  const minMarketCap = [0, 0.3, 1, 10].includes(Number(value?.minMarketCap))
    ? Number(value?.minMarketCap)
    : 1;
  return {
    query:
      typeof value?.query === "string" ? value.query.trim().slice(0, 100) : "",
    period,
    insight,
    preset,
    priceDirection,
    tradingValueDirection,
    minMarketCap,
    sort: { key, mode },
  };
}

export function scannerCriteriaEqual(
  left: SavedScannerCriteria,
  right: SavedScannerCriteria,
) {
  return JSON.stringify(normalizeScannerCriteria(left)) ===
    JSON.stringify(normalizeScannerCriteria(right));
}

function emptyData(now: string): UserLibraryData {
  return {
    schemaVersion: 1,
    storeRevision: 0,
    updatedAt: now,
    migrations: { bmoWatch: false },
    watchlist: [],
    savedScanners: [],
  };
}

function normalizeWatchlist(value: unknown, fallbackDate: string) {
  if (!Array.isArray(value)) return [];
  const byTicker = new Map<string, WatchlistItem>();
  for (const entry of value) {
    const source = typeof entry === "string" ? { ticker: entry } : entry;
    if (!isRecord(source)) continue;
    const ticker = normalizeTicker(source.ticker);
    if (!ticker) continue;
    const addedAt = validDate(source.addedAt)
      ? (source.addedAt as string)
      : fallbackDate;
    const updatedAt = validDate(source.updatedAt)
      ? (source.updatedAt as string)
      : addedAt;
    const existing = byTicker.get(ticker);
    if (!existing) {
      byTicker.set(ticker, { ticker, addedAt, updatedAt });
      continue;
    }
    byTicker.set(ticker, {
      ticker,
      addedAt:
        Date.parse(addedAt) < Date.parse(existing.addedAt)
          ? addedAt
          : existing.addedAt,
      updatedAt:
        Date.parse(updatedAt) >= Date.parse(existing.updatedAt)
          ? updatedAt
          : existing.updatedAt,
    });
  }
  return [...byTicker.values()]
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(-MAX_WATCHLIST_ITEMS);
}

function normalizeSavedScanners(value: unknown, fallbackDate: string) {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, SavedScanner>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim().slice(0, 100) : "";
    const name =
      typeof entry.name === "string" ? normalizeScannerName(entry.name) : "";
    if (
      !id ||
      !name ||
      !isRecord(entry.criteria) ||
      (typeof entry.criteriaVersion === "number" && entry.criteriaVersion > 1)
    )
      continue;
    const createdAt = validDate(entry.createdAt)
      ? (entry.createdAt as string)
      : fallbackDate;
    const updatedAt = validDate(entry.updatedAt)
      ? (entry.updatedAt as string)
      : createdAt;
    const item: SavedScanner = {
      id,
      name,
      criteriaVersion: 1,
      criteria: normalizeScannerCriteria(
        entry.criteria as Partial<SavedScannerCriteria>,
      ),
      createdAt,
      updatedAt,
    };
    const existing = byId.get(id);
    if (!existing || Date.parse(updatedAt) >= Date.parse(existing.updatedAt)) {
      byId.set(id, item);
    }
  }

  const names = new Set<string>();
  return [...byId.values()]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-MAX_SAVED_SCANNERS)
    .map((item) => {
      const base = item.name;
      let name = base;
      let suffix = 2;
      while (names.has(comparableName(name))) {
        const tail = ` (${suffix++})`;
        name = `${base.slice(0, 50 - tail.length)}${tail}`;
      }
      names.add(comparableName(name));
      return name === item.name ? item : { ...item, name };
    });
}

export function decodeUserLibrary(
  raw: string,
  fallbackDate = new Date().toISOString(),
): {
  data: UserLibraryData;
  recovered: boolean;
  futureVersion: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { data: emptyData(fallbackDate), recovered: true, futureVersion: false };
  }
  if (!isRecord(parsed)) {
    return { data: emptyData(fallbackDate), recovered: true, futureVersion: false };
  }
  if (
    typeof parsed.schemaVersion === "number" &&
    parsed.schemaVersion > USER_LIBRARY_VERSION
  ) {
    return { data: emptyData(fallbackDate), recovered: false, futureVersion: true };
  }
  const watchlist = normalizeWatchlist(parsed.watchlist, fallbackDate);
  const savedScanners = normalizeSavedScanners(parsed.savedScanners, fallbackDate);
  const data: UserLibraryData = {
    schemaVersion: 1,
    storeRevision:
      typeof parsed.storeRevision === "number" &&
      Number.isSafeInteger(parsed.storeRevision) &&
      parsed.storeRevision >= 0
        ? parsed.storeRevision
        : 0,
    updatedAt: validDate(parsed.updatedAt)
      ? (parsed.updatedAt as string)
      : fallbackDate,
    migrations: {
      bmoWatch:
        isRecord(parsed.migrations) && parsed.migrations.bmoWatch === true,
    },
    watchlist,
    savedScanners,
  };
  const recovered =
    parsed.schemaVersion !== 1 ||
    typeof parsed.storeRevision !== "number" ||
    !validDate(parsed.updatedAt) ||
    !isRecord(parsed.migrations) ||
    !Array.isArray(parsed.watchlist) ||
    !Array.isArray(parsed.savedScanners) ||
    watchlist.length !== parsed.watchlist.length ||
    savedScanners.length !== parsed.savedScanners.length ||
    savedScanners.some((item, index) => {
      const original = Array.isArray(parsed.savedScanners)
        ? parsed.savedScanners[index]
        : null;
      return !isRecord(original) || item.name !== original.name;
    });
  return { data, recovered, futureVersion: false };
}

const fallbackId = () =>
  `scanner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export class UserLibraryStore {
  private initialized = false;
  private listeners = new Set<() => void>();
  private snapshot: UserLibrarySnapshot;
  private readonly now: () => Date;
  private readonly randomId: () => string;
  private readonly storageSource: StoreOptions["storage"];

  constructor(options: StoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.randomId =
      options.randomId ??
      (() => globalThis.crypto?.randomUUID?.() ?? fallbackId());
    this.storageSource = options.storage;
    this.snapshot = {
      data: emptyData(this.now().toISOString()),
      persistence: "memory",
      notice: null,
    };
  }

  private storage() {
    if (typeof this.storageSource === "function") return this.storageSource();
    if (this.storageSource !== undefined) return this.storageSource;
    try {
      return typeof window === "undefined" ? null : window.localStorage;
    } catch {
      return null;
    }
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private write(data: UserLibraryData, notice: string | null = null) {
    let persistence: UserLibrarySnapshot["persistence"] = "memory";
    try {
      const storage = this.storage();
      if (storage) {
        storage.setItem(USER_LIBRARY_KEY, JSON.stringify(data));
        persistence = "persistent";
      }
    } catch {
      notice =
        "브라우저 저장 공간을 사용할 수 없어 이번 세션에서만 변경사항을 유지합니다.";
    }
    this.snapshot = { data, persistence, notice };
    this.emit();
    return persistence === "persistent";
  }

  private backupCorrupt(raw: string) {
    if (raw.length > 100_000) return;
    try {
      const storage = this.storage();
      if (storage && !storage.getItem(CORRUPT_BACKUP_KEY)) {
        storage.setItem(CORRUPT_BACKUP_KEY, raw);
      }
    } catch {
      // Recovery must continue even when the browser refuses backup writes.
    }
  }

  private initialize() {
    if (this.initialized) return;
    this.initialized = true;
    const now = this.now().toISOString();
    const storage = this.storage();
    if (!storage) return;

    let raw: string | null = null;
    try {
      raw = storage.getItem(USER_LIBRARY_KEY);
    } catch {
      this.snapshot = {
        ...this.snapshot,
        notice:
          "브라우저 저장 공간을 읽을 수 없어 이번 세션에서만 저장합니다.",
      };
      return;
    }

    let data = emptyData(now);
    let recovered = false;
    if (raw) {
      const decoded = decodeUserLibrary(raw, now);
      if (decoded.futureVersion) {
        this.snapshot = {
          data,
          persistence: "read-only",
          notice:
            "더 최신 버전에서 저장한 데이터가 있어 현재 버전에서는 변경하지 않습니다.",
        };
        return;
      }
      data = decoded.data;
      recovered = decoded.recovered;
      if (recovered) this.backupCorrupt(raw);
    }

    let migratedLegacy = false;
    let migrationUpdated = false;
    if (!data.migrations.bmoWatch) {
      try {
        const legacyRaw = storage.getItem(LEGACY_WATCHLIST_KEY);
        if (legacyRaw) {
          const legacyParsed = JSON.parse(legacyRaw);
          if (Array.isArray(legacyParsed)) {
            const merged = normalizeWatchlist(
              [...data.watchlist, ...legacyParsed],
              now,
            );
            data = {
              ...data,
              watchlist: merged,
              migrations: { bmoWatch: true },
            };
            migratedLegacy = true;
            migrationUpdated = true;
          }
        } else {
          data = { ...data, migrations: { bmoWatch: true } };
          migrationUpdated = true;
        }
      } catch {
        // Keep the legacy key untouched so a future version can retry recovery.
      }
    }

    const shouldWrite =
      !raw ||
      recovered ||
      migratedLegacy ||
      migrationUpdated ||
      !data.migrations.bmoWatch;
    if (shouldWrite) {
      const next = {
        ...data,
        storeRevision: data.storeRevision + 1,
        updatedAt: now,
      };
      const persistent = this.write(
        next,
        recovered
          ? "손상되거나 잘못된 저장값에서 읽을 수 있는 항목만 복구했습니다."
          : null,
      );
      if (persistent && migratedLegacy) {
        try {
          storage.removeItem(LEGACY_WATCHLIST_KEY);
        } catch {
          // The migrated copy is already safe in the new key.
        }
      }
      return;
    }
    this.snapshot = {
      data,
      persistence: "persistent",
      notice: null,
    };
  }

  getSnapshot = () => {
    this.initialize();
    return this.snapshot;
  };

  getServerSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.initialize();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  reloadFromStorage = () => {
    if (this.snapshot.persistence === "read-only") return;
    try {
      const raw = this.storage()?.getItem(USER_LIBRARY_KEY);
      if (!raw) {
        const now = this.now().toISOString();
        this.snapshot = {
          data: {
            ...emptyData(now),
            migrations: { bmoWatch: true },
          },
          persistence: "persistent",
          notice: null,
        };
        this.emit();
        return;
      }
      const decoded = decodeUserLibrary(raw, this.now().toISOString());
      if (decoded.futureVersion) {
        this.snapshot = {
          ...this.snapshot,
          persistence: "read-only",
          notice:
            "더 최신 버전에서 저장한 데이터가 있어 현재 버전에서는 변경하지 않습니다.",
        };
      } else if (
        decoded.data.storeRevision >= this.snapshot.data.storeRevision
      ) {
        this.snapshot = {
          data: decoded.data,
          persistence: "persistent",
          notice: decoded.recovered
            ? "다른 화면의 손상된 저장값에서 읽을 수 있는 항목만 복구했습니다."
            : null,
        };
      }
      this.emit();
    } catch {
      // Keep the last known-good in-memory snapshot.
    }
  };

  private mutate(
    update: (data: UserLibraryData, now: string) => UserLibraryData,
  ) {
    this.initialize();
    if (this.snapshot.persistence === "read-only") return false;
    const now = this.now().toISOString();
    const next = update(this.snapshot.data, now);
    return this.write({
      ...next,
      schemaVersion: 1,
      storeRevision: this.snapshot.data.storeRevision + 1,
      updatedAt: now,
    });
  }

  toggleWatchlist = (tickerValue: string): LibraryMutationResult => {
    const ticker = normalizeTicker(tickerValue);
    if (!ticker) return { ok: false, persistent: false, reason: "not-found" };
    if (this.getSnapshot().persistence === "read-only") {
      return { ok: false, persistent: false, reason: "read-only" };
    }
    const exists = this.snapshot.data.watchlist.some(
      (item) => item.ticker === ticker,
    );
    if (!exists && this.snapshot.data.watchlist.length >= MAX_WATCHLIST_ITEMS) {
      return { ok: false, persistent: false, reason: "limit" };
    }
    const persistent = this.mutate((data, now) => {
      return {
        ...data,
        watchlist: exists
          ? data.watchlist.filter((item) => item.ticker !== ticker)
          : [...data.watchlist, { ticker, addedAt: now, updatedAt: now }],
      };
    });
    return { ok: true, persistent };
  };

  saveScanner = (
    nameValue: string,
    criteriaValue: SavedScannerCriteria,
    id?: string,
  ): LibraryMutationResult => {
    this.initialize();
    if (this.snapshot.persistence === "read-only") {
      return { ok: false, persistent: false, reason: "read-only" };
    }
    const name = normalizeScannerName(nameValue);
    if (!name) return { ok: false, persistent: false, reason: "not-found" };
    const criteria = normalizeScannerCriteria(criteriaValue);
    if (!id && this.snapshot.data.savedScanners.length >= MAX_SAVED_SCANNERS) {
      return { ok: false, persistent: false, reason: "limit" };
    }
    const duplicateName = this.snapshot.data.savedScanners.find(
      (item) => item.id !== id && comparableName(item.name) === comparableName(name),
    );
    if (duplicateName) {
      return {
        ok: false,
        persistent: this.snapshot.persistence === "persistent",
        reason: "duplicate-name",
        item: duplicateName,
      };
    }
    let saved: SavedScanner | undefined;
    const persistent = this.mutate((data, now) => {
      const current = id
        ? data.savedScanners.find((item) => item.id === id)
        : undefined;
      saved = {
        id: current?.id ?? this.randomId(),
        name,
        criteriaVersion: 1,
        criteria,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      return {
        ...data,
        savedScanners: current
          ? data.savedScanners.map((item) => (item.id === id ? saved! : item))
          : [...data.savedScanners, saved],
      };
    });
    return { ok: true, persistent, item: saved };
  };

  renameScanner = (id: string, nameValue: string): LibraryMutationResult => {
    const current = this.getSnapshot().data.savedScanners.find(
      (item) => item.id === id,
    );
    if (!current) return { ok: false, persistent: false, reason: "not-found" };
    return this.saveScanner(nameValue, current.criteria, id);
  };

  deleteScanner = (id: string): LibraryMutationResult => {
    if (!this.getSnapshot().data.savedScanners.some((item) => item.id === id)) {
      return { ok: false, persistent: false, reason: "not-found" };
    }
    if (this.snapshot.persistence === "read-only") {
      return { ok: false, persistent: false, reason: "read-only" };
    }
    const persistent = this.mutate((data) => ({
      ...data,
      savedScanners: data.savedScanners.filter((item) => item.id !== id),
    }));
    return { ok: true, persistent };
  };
}

export const userLibraryStore = new UserLibraryStore();

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === USER_LIBRARY_KEY) userLibraryStore.reloadFromStorage();
  });
}

export function useUserLibrary() {
  return useSyncExternalStore(
    userLibraryStore.subscribe,
    userLibraryStore.getSnapshot,
    userLibraryStore.getServerSnapshot,
  );
}

export function useWatchlist() {
  const snapshot = useUserLibrary();
  const tickers = snapshot.data.watchlist.map((item) => item.ticker);
  return {
    ...snapshot,
    items: snapshot.data.watchlist,
    tickers,
    has: (ticker: string) => {
      const normalized = normalizeTicker(ticker);
      return Boolean(normalized && tickers.includes(normalized));
    },
    toggle: userLibraryStore.toggleWatchlist,
  };
}

export function useSavedScanners() {
  const snapshot = useUserLibrary();
  return {
    ...snapshot,
    items: snapshot.data.savedScanners,
    save: userLibraryStore.saveScanner,
    rename: userLibraryStore.renameScanner,
    remove: userLibraryStore.deleteScanner,
  };
}
