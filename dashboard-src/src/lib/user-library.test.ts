import { describe, expect, it, vi } from "vitest";
import {
  CORRUPT_BACKUP_KEY,
  LEGACY_WATCHLIST_KEY,
  MAX_SAVED_SCANNERS,
  MAX_WATCHLIST_ITEMS,
  USER_LIBRARY_KEY,
  UserLibraryStore,
  decodeUserLibrary,
  normalizeScannerCriteria,
} from "./user-library";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const fixedDate = new Date("2026-08-01T12:00:00.000Z");
const criteria = normalizeScannerCriteria({
  query: "NVDA",
  period: "5d",
  insight: "new",
  preset: "up-with-volume",
  sort: { key: "volume", mode: "asc" },
});

describe("UserLibraryStore", () => {
  it("migrates, normalizes and deduplicates the legacy watchlist once", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_WATCHLIST_KEY,
      JSON.stringify([" nvda ", "NVDA", "brk.b", 7, "bad ticker"]),
    );
    const store = new UserLibraryStore({ storage, now: () => fixedDate });

    expect(store.getSnapshot().data.watchlist.map((item) => item.ticker)).toEqual([
      "NVDA",
      "BRK-B",
    ]);
    expect(store.getSnapshot().data.schemaVersion).toBe(1);
    expect(storage.getItem(LEGACY_WATCHLIST_KEY)).toBeNull();

    const reloaded = new UserLibraryStore({ storage, now: () => fixedDate });
    expect(reloaded.getSnapshot().data.watchlist).toHaveLength(2);
  });

  it("keeps every subscribed screen in sync and survives a reload", () => {
    const storage = new MemoryStorage();
    const store = new UserLibraryStore({ storage, now: () => fixedDate });
    const searchScreen = vi.fn();
    const stockScreen = vi.fn();
    const scannerScreen = vi.fn();
    store.subscribe(searchScreen);
    store.subscribe(stockScreen);
    store.subscribe(scannerScreen);

    const result = store.toggleWatchlist("aapl");
    expect(result).toMatchObject({ ok: true, persistent: true });
    expect(searchScreen).toHaveBeenCalled();
    expect(stockScreen).toHaveBeenCalled();
    expect(scannerScreen).toHaveBeenCalled();
    expect(store.getSnapshot().data.watchlist[0]?.ticker).toBe("AAPL");

    const reloaded = new UserLibraryStore({ storage, now: () => fixedDate });
    expect(reloaded.getSnapshot().data.watchlist[0]?.ticker).toBe("AAPL");

    storage.removeItem(USER_LIBRARY_KEY);
    reloaded.reloadFromStorage();
    expect(reloaded.getSnapshot().data.watchlist).toEqual([]);
  });

  it("backs up malformed JSON and starts with a usable empty library", () => {
    const storage = new MemoryStorage();
    storage.setItem(USER_LIBRARY_KEY, "{broken-json");
    const store = new UserLibraryStore({ storage, now: () => fixedDate });

    expect(store.getSnapshot().data.watchlist).toEqual([]);
    expect(store.getSnapshot().notice).toContain("복구");
    expect(storage.getItem(CORRUPT_BACKUP_KEY)).toBe("{broken-json");
    expect(() => JSON.parse(storage.getItem(USER_LIBRARY_KEY)!)).not.toThrow();
  });

  it("salvages valid entries and removes invalid or duplicate values", () => {
    const decoded = decodeUserLibrary(
      JSON.stringify({
        schemaVersion: 1,
        storeRevision: 4,
        updatedAt: fixedDate.toISOString(),
        migrations: { bmoWatch: true },
        watchlist: [
          { ticker: "msft", addedAt: "bad", updatedAt: "bad" },
          { ticker: "MSFT", addedAt: fixedDate.toISOString(), updatedAt: fixedDate.toISOString() },
          { ticker: "not valid" },
        ],
        savedScanners: [{ id: "", name: "bad", criteria: {} }],
      }),
      fixedDate.toISOString(),
    );
    expect(decoded.data.watchlist).toHaveLength(1);
    expect(decoded.data.watchlist[0]?.ticker).toBe("MSFT");
    expect(decoded.data.savedScanners).toEqual([]);
    expect(decoded.recovered).toBe(true);
  });

  it("merges duplicate timestamps without losing the original add date", () => {
    const older = "2026-07-01T00:00:00.000Z";
    const newer = "2026-07-31T00:00:00.000Z";
    const decoded = decodeUserLibrary(
      JSON.stringify({
        schemaVersion: 1,
        watchlist: [
          { ticker: "NVDA", addedAt: newer, updatedAt: newer },
          { ticker: "nvda", addedAt: older, updatedAt: older },
        ],
        savedScanners: [],
      }),
      fixedDate.toISOString(),
    );

    expect(decoded.data.watchlist).toEqual([
      { ticker: "NVDA", addedAt: older, updatedAt: newer },
    ]);
  });

  it("caps recovered collections and rejects new items at the safe limits", () => {
    const watchlist = Array.from({ length: MAX_WATCHLIST_ITEMS + 1 }, (_, index) => ({
      ticker: `T${index}`,
      addedAt: fixedDate.toISOString(),
      updatedAt: fixedDate.toISOString(),
    }));
    const savedScanners = Array.from(
      { length: MAX_SAVED_SCANNERS + 1 },
      (_, index) => ({
        id: `scanner-${index}`,
        name: `Scanner ${index}`,
        criteriaVersion: 1,
        criteria,
        createdAt: fixedDate.toISOString(),
        updatedAt: fixedDate.toISOString(),
      }),
    );
    const raw = JSON.stringify({
      schemaVersion: 1,
      storeRevision: 1,
      updatedAt: fixedDate.toISOString(),
      migrations: { bmoWatch: true },
      watchlist,
      savedScanners,
    });
    const decoded = decodeUserLibrary(raw, fixedDate.toISOString());
    expect(decoded.data.watchlist).toHaveLength(MAX_WATCHLIST_ITEMS);
    expect(decoded.data.savedScanners).toHaveLength(MAX_SAVED_SCANNERS);
    expect(decoded.recovered).toBe(true);

    const storage = new MemoryStorage();
    storage.setItem(USER_LIBRARY_KEY, JSON.stringify(decoded.data));
    const store = new UserLibraryStore({ storage, now: () => fixedDate });
    expect(store.toggleWatchlist("OVER").reason).toBe("limit");
    expect(store.saveScanner("Over limit", criteria).reason).toBe("limit");
  });

  it("drops saved scanner criteria from unsupported future versions", () => {
    const decoded = decodeUserLibrary(
      JSON.stringify({
        schemaVersion: 1,
        watchlist: [],
        savedScanners: [
          {
            id: "future-scanner",
            name: "Future scanner",
            criteriaVersion: 2,
            criteria,
            createdAt: fixedDate.toISOString(),
            updatedAt: fixedDate.toISOString(),
          },
        ],
      }),
      fixedDate.toISOString(),
    );

    expect(decoded.data.savedScanners).toEqual([]);
    expect(decoded.recovered).toBe(true);
  });

  it("keeps mutations in memory when localStorage quota is exceeded", () => {
    const storage = new MemoryStorage();
    const originalSet = storage.setItem.bind(storage);
    let initialized = false;
    storage.setItem = (key, value) => {
      if (initialized) throw new DOMException("Quota exceeded", "QuotaExceededError");
      originalSet(key, value);
      initialized = true;
    };
    const store = new UserLibraryStore({ storage, now: () => fixedDate });
    store.getSnapshot();

    const result = store.toggleWatchlist("TSLA");
    expect(result).toMatchObject({ ok: true, persistent: false });
    expect(store.getSnapshot().data.watchlist[0]?.ticker).toBe("TSLA");
    expect(store.getSnapshot().persistence).toBe("memory");
    expect(store.getSnapshot().notice).toContain("이번 세션");
  });

  it("does not overwrite data from a future schema version", () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ schemaVersion: 99, watchlist: ["NVDA"] });
    storage.setItem(USER_LIBRARY_KEY, raw);
    const store = new UserLibraryStore({ storage, now: () => fixedDate });

    expect(store.getSnapshot().persistence).toBe("read-only");
    expect(store.toggleWatchlist("AAPL").ok).toBe(false);
    expect(storage.getItem(USER_LIBRARY_KEY)).toBe(raw);
  });

  it("creates, reloads, renames, deduplicates and deletes saved scanners", () => {
    const storage = new MemoryStorage();
    const store = new UserLibraryStore({
      storage,
      now: () => fixedDate,
      randomId: () => "scanner-1",
    });
    const created = store.saveScanner("  급증   종목  ", criteria);
    expect(created.item).toMatchObject({ id: "scanner-1", name: "급증 종목", criteria });
    expect(store.saveScanner("급증 종목", criteria).reason).toBe("duplicate-name");

    expect(store.renameScanner("scanner-1", "  장중 확인 ").item?.name).toBe("장중 확인");
    const reloaded = new UserLibraryStore({ storage, now: () => fixedDate });
    expect(reloaded.getSnapshot().data.savedScanners[0]?.criteria).toEqual(criteria);
    expect(reloaded.deleteScanner("scanner-1").ok).toBe(true);
    expect(reloaded.getSnapshot().data.savedScanners).toEqual([]);
  });
});
