import { useEffect, useMemo, useSyncExternalStore } from "react";
import { hydrateLiveData, type HydrationPayloads } from "./hydrate-live-data";
import { LIVE_META } from "./mock-data";
import { trackTelemetry } from "./telemetry";

export type DataSourceId =
  | "market"
  | "history"
  | "insider"
  | "lockup"
  | "lockupReactions"
  | "earnings"
  | "economic"
  | "news"
  | "weekly"
  | "stockDirectory"
  | "replayManifest";

export type DataSourcePhase =
  | "idle"
  | "loading"
  | "refreshing"
  | "success"
  | "error";

export type DataSourceHealth = "unknown" | "normal" | "delayed" | "error";

export type DataSourceErrorKind =
  | "timeout"
  | "network"
  | "http"
  | "parse"
  | "aborted";

export interface DataSourceError {
  kind: DataSourceErrorKind;
  message: string;
  retryable: boolean;
  status?: number;
}

export interface DataSourceState<T = unknown> {
  id: DataSourceId;
  phase: DataSourcePhase;
  health: DataSourceHealth;
  data?: T;
  fromCache: boolean;
  sourceUpdatedAt?: string;
  lastSuccessAt?: number;
  attempt: number;
  error?: DataSourceError;
}

type SourceConfig = {
  url: string;
  timeoutMs: number;
  retries: number;
  hydrationPath?: keyof HydrationPayloads;
};

export const DATA_SOURCE_CONFIG: Record<DataSourceId, SourceConfig> = {
  market: {
    url: "/data.json",
    timeoutMs: 8_000,
    retries: 2,
    hydrationPath: "/data.json",
  },
  history: {
    url: "/history.json",
    timeoutMs: 12_000,
    retries: 2,
    hydrationPath: "/history.json",
  },
  insider: {
    url: "/insider/data/insider.json",
    timeoutMs: 8_000,
    retries: 2,
    hydrationPath: "/insider/data/insider.json",
  },
  lockup: {
    url: "/ipo-lockup/data/lockup.json",
    timeoutMs: 8_000,
    retries: 2,
    hydrationPath: "/ipo-lockup/data/lockup.json",
  },
  lockupReactions: {
    url: "/ipo-lockup/data/reactions.json",
    timeoutMs: 8_000,
    retries: 2,
    hydrationPath: "/ipo-lockup/data/reactions.json",
  },
  earnings: {
    url: "/earnings.json",
    timeoutMs: 8_000,
    retries: 2,
    hydrationPath: "/earnings.json",
  },
  economic: {
    url: "/economic_events.json",
    timeoutMs: 8_000,
    retries: 2,
    hydrationPath: "/economic_events.json",
  },
  news: {
    url: "/news.json",
    timeoutMs: 8_000,
    retries: 2,
    hydrationPath: "/news.json",
  },
  weekly: {
    url: "/weekly_summary.json",
    timeoutMs: 8_000,
    retries: 2,
  },
  stockDirectory: {
    url: "/stock_directory.json",
    timeoutMs: 10_000,
    retries: 2,
  },
  replayManifest: {
    url: "/replay_data/manifest.json",
    timeoutMs: 8_000,
    retries: 2,
  },
};

export const ROUTE_DATA_SOURCES = {
  home: ["market", "history"],
  scanner: ["market"],
  insider: ["market", "insider"],
  lockup: ["market", "history", "lockup", "lockupReactions"],
  today: ["market", "insider", "lockup", "earnings", "economic"],
  stock: ["market", "history", "insider", "lockup", "earnings", "news"],
  static: [],
  replay: [],
} as const satisfies Record<string, readonly DataSourceId[]>;

const initialState = (id: DataSourceId): DataSourceState => ({
  id,
  phase: "idle",
  health: "unknown",
  fromCache: false,
  attempt: 0,
});

const states = new Map<DataSourceId, DataSourceState>(
  (Object.keys(DATA_SOURCE_CONFIG) as DataSourceId[]).map((id) => [
    id,
    initialState(id),
  ]),
);
const listeners = new Set<() => void>();
const consumers = new Map<DataSourceId, number>();
const oneOffConsumers = new Map<DataSourceId, number>();
const controllers = new Map<DataSourceId, AbortController>();
const requests = new Map<DataSourceId, Promise<unknown>>();
const requestGenerations = new Map<DataSourceId, number>();
let snapshotVersion = 0;
let hydrationQueue = Promise.resolve();

function emit() {
  snapshotVersion += 1;
  for (const listener of listeners) listener();
}

function setState<T>(
  id: DataSourceId,
  update: Partial<DataSourceState<T>>,
) {
  states.set(id, { ...states.get(id)!, ...update } as DataSourceState);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshotVersion;
}

export function getDataSourceState<T = unknown>(id: DataSourceId) {
  return states.get(id)! as DataSourceState<T>;
}

export function getSourceUpdatedAt(payload: any): string | undefined {
  return (
    payload?.updated ??
    payload?.market_date ??
    payload?.generatedAt ??
    payload?.updated_at ??
    payload?.meta?.updated ??
    payload?.meta?.generatedAt ??
    payload?.meta?.validatedAt
  );
}

export function assessSourceHealth(
  id: DataSourceId,
  payload: any,
  updatedAt?: string,
): DataSourceHealth {
  if (id === "market") {
    return LIVE_META.status === "stale" ? "delayed" : "normal";
  }
  if (id === "history") {
    const lastDate = Array.isArray(payload?.dates) ? payload.dates.at(-1) : null;
    const marketDate = getDataSourceState<any>("market").data?.market_date;
    if (!lastDate || !marketDate) return "unknown";
    return lastDate < marketDate ? "delayed" : "normal";
  }
  if (!updatedAt) return "unknown";
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return "unknown";
  const generousSources: DataSourceId[] = [
    "economic",
    "weekly",
    "stockDirectory",
  ];
  const maxAge = generousSources.includes(id)
    ? 8 * 24 * 60 * 60 * 1_000
    : 72 * 60 * 60 * 1_000;
  return Date.now() - timestamp > maxAge ? "delayed" : "normal";
}

function cacheKey(id: DataSourceId) {
  return `source:${id}`;
}

type CacheRecord = {
  key: string;
  data: unknown;
  savedAt: number;
  sourceUpdatedAt?: string;
  version: 1;
};

const memoryCache = new Map<string, CacheRecord>();
const DB_NAME = "bvt-money-flow-data";
const STORE_NAME = "last-good";

function openCacheDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readLastGood(id: DataSourceId): Promise<CacheRecord | undefined> {
  const key = cacheKey(id);
  const memory = memoryCache.get(key);
  if (memory) return memory;
  const db = await openCacheDatabase();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      const record = request.result as CacheRecord | undefined;
      if (record?.version === 1) memoryCache.set(key, record);
      resolve(record?.version === 1 ? record : undefined);
    };
    request.onerror = () => resolve(undefined);
    transaction.oncomplete = () => db.close();
  });
}

async function writeLastGood(
  id: DataSourceId,
  data: unknown,
  updatedAt?: string,
) {
  const record: CacheRecord = {
    key: cacheKey(id),
    data,
    savedAt: Date.now(),
    sourceUpdatedAt: updatedAt,
    version: 1,
  };
  memoryCache.set(record.key, record);
  const db = await openCacheDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
}

function abortError(): DataSourceError {
  return {
    kind: "aborted",
    message: "요청이 취소되었습니다.",
    retryable: false,
  };
}

function normalizeError(error: unknown, timedOut = false): DataSourceError {
  if (timedOut) {
    return {
      kind: "timeout",
      message: "요청 시간이 초과되었습니다.",
      retryable: true,
    };
  }
  if (error instanceof DataFetchError) return error.detail;
  if (error instanceof DOMException && error.name === "AbortError") {
    return abortError();
  }
  return {
    kind: "network",
    message:
      error instanceof Error
        ? error.message
        : "데이터를 불러오지 못했습니다.",
    retryable: true,
  };
}

export class DataFetchError extends Error {
  constructor(public detail: DataSourceError) {
    super(detail.message);
  }
}

function waitForRetry(attempt: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(new DataFetchError(abortError()));
  }
  return new Promise<void>((resolve, reject) => {
    const delay = Math.round(
      (attempt === 1 ? 500 : 1_500) * (0.9 + Math.random() * 0.2),
    );
    const cleanup = () => signal?.removeEventListener("abort", cancel);
    const complete = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(complete, delay);
    const cancel = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DataFetchError(abortError()));
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export async function fetchJsonWithPolicy<T>(
  url: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    retries?: number;
    fetchImpl?: typeof fetch;
    onAttempt?: (attempt: number) => void;
  } = {},
): Promise<T> {
  const {
    signal,
    timeoutMs = 8_000,
    retries = 2,
    fetchImpl = fetch,
    onAttempt,
  } = options;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    if (signal?.aborted) throw new DataFetchError(abortError());
    onAttempt?.(attempt);
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        cache: "no-cache",
      });
      if (!response.ok) {
        const retryable = response.status >= 500;
        throw new DataFetchError({
          kind: "http",
          message: `${url} 응답 오류 (${response.status})`,
          retryable,
          status: response.status,
        });
      }
      try {
        return (await response.json()) as T;
      } catch {
        throw new DataFetchError({
          kind: "parse",
          message: `${url} JSON 형식이 올바르지 않습니다.`,
          retryable: false,
        });
      }
    } catch (error) {
      const detail = normalizeError(error, timedOut);
      if (signal?.aborted) throw new DataFetchError(abortError());
      if (!detail.retryable || attempt > retries) {
        throw new DataFetchError(detail);
      }
      await waitForRetry(attempt, signal);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new DataFetchError({
    kind: "network",
    message: "데이터를 불러오지 못했습니다.",
    retryable: true,
  });
}

export async function fetchTextWithPolicy(
  url: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    retries?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<string> {
  const {
    signal,
    timeoutMs = 8_000,
    retries = 2,
    fetchImpl = fetch,
  } = options;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    if (signal?.aborted) throw new DataFetchError(abortError());
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        cache: "no-cache",
      });
      if (!response.ok) {
        throw new DataFetchError({
          kind: "http",
          message: `${url} 응답 오류 (${response.status})`,
          retryable: response.status >= 500,
          status: response.status,
        });
      }
      return await response.text();
    } catch (error) {
      const detail = normalizeError(error, timedOut);
      if (signal?.aborted) throw new DataFetchError(abortError());
      if (!detail.retryable || attempt > retries) {
        throw new DataFetchError(detail);
      }
      await waitForRetry(attempt, signal);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new DataFetchError({
    kind: "network",
    message: "데이터를 불러오지 못했습니다.",
    retryable: true,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertValidDataSourcePayload(
  id: DataSourceId,
  data: unknown,
) {
  const payload = isRecord(data) ? data : null;
  const hasArray = (key: string, requireRecords = false) =>
    Array.isArray(payload?.[key]) &&
    (!requireRecords || (payload?.[key] as unknown[]).length > 0);
  const valid =
    id === "market"
      ? hasArray("stocks", true) && typeof payload?.market_date === "string"
      : id === "history"
        ? hasArray("dates", true)
        : id === "insider"
          ? hasArray("trades") && hasArray("pendingTrades")
          : id === "lockup"
            ? hasArray("events")
            : id === "lockupReactions"
              ? hasArray("reactions")
              : id === "earnings" || id === "economic"
                ? hasArray("events")
                : id === "news"
                  ? isRecord(payload?.companies)
                  : id === "weekly"
                    ? hasArray("weeks")
                    : id === "stockDirectory"
                      ? hasArray("stocks")
                      : hasArray("dates");
  if (!valid) {
    throw new DataFetchError({
      kind: "parse",
      message: `${DATA_SOURCE_CONFIG[id].url} 데이터 구조가 올바르지 않습니다.`,
      retryable: false,
    });
  }
}

async function applyHydrationPayload(
  id: DataSourceId,
  data: unknown,
  isCurrent?: () => boolean,
) {
  const path = DATA_SOURCE_CONFIG[id].hydrationPath;
  if (!path) return;
  hydrationQueue = hydrationQueue
    .catch(() => undefined)
    .then(() => {
      if (isCurrent && !isCurrent()) return;
      return hydrateLiveData({ [path]: data } as HydrationPayloads);
    });
  await hydrationQueue;
}

function cancelRequest(id: DataSourceId) {
  requestGenerations.set(id, (requestGenerations.get(id) ?? 0) + 1);
  controllers.get(id)?.abort();
  controllers.delete(id);
  requests.delete(id);
}

function hasActiveConsumers(id: DataSourceId) {
  return (consumers.get(id) ?? 0) + (oneOffConsumers.get(id) ?? 0) > 0;
}

async function startRequest(id: DataSourceId, force = false) {
  if (!force && requests.has(id)) return requests.get(id);
  if (force) cancelRequest(id);

  const config = DATA_SOURCE_CONFIG[id];
  const controller = new AbortController();
  const generation = (requestGenerations.get(id) ?? 0) + 1;
  requestGenerations.set(id, generation);
  const isCurrent = () =>
    requestGenerations.get(id) === generation && !controller.signal.aborted;
  controllers.set(id, controller);
  const existing = getDataSourceState(id);
  setState(id, {
    phase: existing.data ? "refreshing" : "loading",
    health: existing.data ? "delayed" : "unknown",
    error: undefined,
    attempt: 0,
  });

  const request = fetchJsonWithPolicy(config.url, {
    signal: controller.signal,
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    onAttempt: (attempt) => {
      if (isCurrent()) setState(id, { attempt });
    },
  })
    .then(async (data) => {
      assertValidDataSourcePayload(id, data);
      if (!isCurrent()) return undefined;
      await applyHydrationPayload(id, data, isCurrent);
      if (!isCurrent()) return undefined;
      const updatedAt = getSourceUpdatedAt(data);
      const health = assessSourceHealth(id, data, updatedAt);
      setState(id, {
        data,
        phase: "success",
        health,
        fromCache: false,
        sourceUpdatedAt: updatedAt,
        lastSuccessAt: Date.now(),
        error: undefined,
      });
      if (id === "market") {
        const historyState = getDataSourceState("history");
        if (historyState.data) {
          setState("history", {
            health: assessSourceHealth(
              "history",
              historyState.data,
              historyState.sourceUpdatedAt,
            ),
          });
        }
      }
      void writeLastGood(id, data, updatedAt);
      trackTelemetry("data_load_result", {
        source: id,
        result: "success",
        health,
        from_cache: false,
        attempt: getDataSourceState(id).attempt,
      });
      return data;
    })
    .catch((error: unknown) => {
      const detail = normalizeError(error);
      if (detail.kind === "aborted" || !isCurrent()) return undefined;
      const current = getDataSourceState(id);
      setState(id, {
        phase: "error",
        health: current.data ? "delayed" : "error",
        error: detail,
      });
      trackTelemetry("data_load_result", {
        source: id,
        result: "error",
        health: current.data ? "delayed" : "error",
        from_cache: current.fromCache,
        attempt: current.attempt,
      });
      return undefined;
    })
    .finally(() => {
      if (controllers.get(id) === controller) controllers.delete(id);
      if (requests.get(id) === request) requests.delete(id);
    });
  requests.set(id, request);
  return request;
}

async function restoreThenLoad(id: DataSourceId, onlyIfObserved = false) {
  const before = getDataSourceState(id);
  if (!before.data) {
    const cached = await readLastGood(id);
    const current = getDataSourceState(id);
    if (
      cached &&
      (!onlyIfObserved || hasActiveConsumers(id)) &&
      (!current.lastSuccessAt || cached.savedAt > current.lastSuccessAt)
    ) {
      try {
        assertValidDataSourcePayload(id, cached.data);
        await applyHydrationPayload(id, cached.data);
        setState(id, {
          data: cached.data,
          fromCache: true,
          lastSuccessAt: cached.savedAt,
          sourceUpdatedAt: cached.sourceUpdatedAt,
          phase: "refreshing",
          health: "delayed",
        });
      } catch {
        memoryCache.delete(cacheKey(id));
      }
    }
  }
  if (onlyIfObserved && !hasActiveConsumers(id)) {
    return undefined;
  }
  return startRequest(id);
}

function acquire(id: DataSourceId) {
  consumers.set(id, (consumers.get(id) ?? 0) + 1);
  const state = getDataSourceState(id);
  const shouldRefresh =
    state.phase !== "success" ||
    !state.lastSuccessAt ||
    Date.now() - state.lastSuccessAt > 5 * 60 * 1_000;
  if (!requests.has(id) && shouldRefresh) {
    void restoreThenLoad(id, true);
  }
  return () => {
    const next = Math.max(0, (consumers.get(id) ?? 1) - 1);
    consumers.set(id, next);
    if (next === 0 && (oneOffConsumers.get(id) ?? 0) === 0) {
      cancelRequest(id);
    }
  };
}

export function retryDataSource(id: DataSourceId) {
  return startRequest(id, true);
}

export async function loadDataSourceOnce<T = unknown>(
  id: DataSourceId,
  signal?: AbortSignal,
) {
  oneOffConsumers.set(id, (oneOffConsumers.get(id) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const next = Math.max(0, (oneOffConsumers.get(id) ?? 1) - 1);
    oneOffConsumers.set(id, next);
    if (next === 0 && (consumers.get(id) ?? 0) === 0) {
      cancelRequest(id);
    }
  };
  const abort = () => {
    release();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) {
      release();
      return getDataSourceState<T>(id);
    }
    await restoreThenLoad(id, true);
    return getDataSourceState<T>(id);
  } finally {
    signal?.removeEventListener("abort", abort);
    release();
  }
}

export function useDataSources<const T extends readonly DataSourceId[]>(
  sourceIds: T,
) {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const stableKey = sourceIds.join("|");
  useEffect(() => {
    const releases = sourceIds.map(acquire);
    return () => releases.forEach((release) => release());
  }, [stableKey]);
  return useMemo(
    () =>
      Object.fromEntries(
        sourceIds.map((id) => [id, getDataSourceState(id)]),
      ) as Record<T[number], DataSourceState>,
    [stableKey, snapshotVersion],
  );
}

export function sourceRecordCount(id: DataSourceId, data: any): number | null {
  if (!data) return null;
  if (id === "market") return Array.isArray(data.stocks) ? data.stocks.length : 0;
  if (id === "history") return Array.isArray(data.dates) ? data.dates.length : 0;
  if (id === "insider")
    return (data.trades?.length ?? 0) + (data.pendingTrades?.length ?? 0);
  if (id === "lockup" || id === "earnings" || id === "economic")
    return Array.isArray(data.events) ? data.events.length : 0;
  if (id === "lockupReactions")
    return Array.isArray(data.reactions) ? data.reactions.length : 0;
  if (id === "news")
    return data.companies && typeof data.companies === "object"
      ? Object.keys(data.companies).length
      : 0;
  if (id === "weekly") return Array.isArray(data.weeks) ? data.weeks.length : 0;
  if (id === "stockDirectory")
    return Array.isArray(data.stocks) ? data.stocks.length : 0;
  if (id === "replayManifest")
    return Array.isArray(data.dates) ? data.dates.length : 0;
  return null;
}

export function hasUsableSourceData(state: DataSourceState) {
  const count = sourceRecordCount(state.id, state.data);
  return Boolean(state.data) && count !== 0;
}

export function resetDataRuntimeForTests() {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  requests.clear();
  requestGenerations.clear();
  consumers.clear();
  oneOffConsumers.clear();
  memoryCache.clear();
  for (const id of Object.keys(DATA_SOURCE_CONFIG) as DataSourceId[]) {
    states.set(id, initialState(id));
  }
  emit();
}

export function seedLastGoodForTests(
  id: DataSourceId,
  data: unknown,
  savedAt = Date.now(),
) {
  memoryCache.set(cacheKey(id), {
    key: cacheKey(id),
    data,
    savedAt,
    sourceUpdatedAt: getSourceUpdatedAt(data),
    version: 1,
  });
}
