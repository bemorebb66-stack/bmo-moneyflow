import type { Metric } from "web-vitals";

export const TELEMETRY_EVENTS = [
  "page_view",
  "data_load_result",
  "error_boundary_shown",
  "web_vital",
  "daily_summary_view",
  "quadrant_view",
  "quadrant_point_click",
  "participation_view",
  "concentration_view",
  "surge_stock_click",
  "surge_stock_more_click",
  "sector_chart_interaction",
  "summary_share_click",
  "briefing_view",
  "share",
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[number];

type TelemetryConfig = {
  enabled: boolean;
  endpoint?: string;
  siteId?: string;
  sampleRate: number;
};

type SafePayload = Record<string, string | number | boolean>;

const EVENT_NAMES = new Set<string>(TELEMETRY_EVENTS);
const DATA_SOURCES = new Set([
  "market",
  "history",
  "insider",
  "lockup",
  "lockupReactions",
  "earnings",
  "economic",
  "news",
  "weekly",
  "stockDirectory",
  "replayManifest",
]);
const RATINGS = new Set(["good", "needs-improvement", "poor"]);
const VITAL_NAMES = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);

function asBoolean(value: unknown) {
  return String(value).toLowerCase() === "true";
}

function parseSampleRate(value: unknown) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1;
}

function safeEndpoint(value: unknown, origin: string) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value, origin);
    if (url.protocol !== "https:" && url.origin !== origin) return undefined;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function createTelemetryConfig(
  env: Record<string, unknown>,
  origin = "https://www.bvtmoneyflow.xyz",
): TelemetryConfig {
  const endpoint = safeEndpoint(env.VITE_TELEMETRY_ENDPOINT, origin);
  const siteId =
    typeof env.VITE_TELEMETRY_SITE_ID === "string" &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(env.VITE_TELEMETRY_SITE_ID)
      ? env.VITE_TELEMETRY_SITE_ID
      : undefined;
  return {
    enabled: asBoolean(env.VITE_TELEMETRY_ENABLED) && Boolean(endpoint),
    endpoint,
    siteId,
    sampleRate: parseSampleRate(env.VITE_TELEMETRY_SAMPLE_RATE),
  };
}

export function normalizeRoute(pathname: string) {
  if (/^\/stocks\/[^/]+\/?$/.test(pathname)) return "/stocks/:ticker";
  if (/^\/briefings\/weeks\/\d{4}-\d{2}-\d{2}\/?$/.test(pathname)) {
    return "/briefings/weeks/:weekId";
  }
  if (/^\/briefings\/\d{4}-\d{2}-\d{2}\/?$/.test(pathname)) {
    return "/briefings/:date";
  }
  const staticRoutes = new Set([
    "/",
    "/scanner",
    "/insider",
    "/lockup",
    "/today",
    "/stock",
    "/replay",
    "/about",
    "/methodology",
    "/privacy-policy",
  ]);
  const route = pathname.replace(/\/$/, "") || "/";
  return staticRoutes.has(route) ? route : "/other";
}

function rounded(value: unknown, decimals = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sanitizeTelemetryPayload(
  event: string,
  input: Record<string, unknown> = {},
  pathname = "/",
): SafePayload | null {
  if (!EVENT_NAMES.has(event)) return null;
  const payload: SafePayload = { event, route: normalizeRoute(pathname) };

  if (event === "data_load_result") {
    if (DATA_SOURCES.has(String(input.source)))
      payload.source = String(input.source);
    if (["success", "error"].includes(String(input.result)))
      payload.result = String(input.result);
    if (
      ["normal", "delayed", "unknown", "error"].includes(String(input.health))
    )
      payload.health = String(input.health);
    if (typeof input.from_cache === "boolean")
      payload.from_cache = input.from_cache;
    const attempt = rounded(input.attempt);
    if (attempt !== undefined)
      payload.attempt = Math.max(0, Math.min(3, attempt));
  } else if (event === "web_vital") {
    if (VITAL_NAMES.has(String(input.metric_name)))
      payload.metric_name = String(input.metric_name);
    if (RATINGS.has(String(input.rating)))
      payload.rating = String(input.rating);
    const value = rounded(input.value, 3);
    const delta = rounded(input.delta, 3);
    if (value !== undefined) payload.value = value;
    if (delta !== undefined) payload.delta = delta;
    if (
      [
        "navigate",
        "reload",
        "back-forward",
        "back-forward-cache",
        "prerender",
        "restore",
      ].includes(String(input.navigation_type))
    ) {
      payload.navigation_type = String(input.navigation_type);
    }
  } else if (event === "error_boundary_shown") {
    payload.boundary =
      input.boundary === "tanstack_root" ? "tanstack_root" : "global";
    payload.error_kind = safeErrorKind(input.error_kind);
    if (
      typeof input.fingerprint === "string" &&
      /^[a-f0-9]{8}$/.test(input.fingerprint)
    ) {
      payload.fingerprint = input.fingerprint;
    }
  } else if (event === "briefing_view") {
    if (["daily", "weekly"].includes(String(input.period)))
      payload.period = String(input.period);
    if (
      ["complete", "in_progress", "partial", "delayed"].includes(
        String(input.briefing_status),
      )
    )
      payload.briefing_status = String(input.briefing_status);
    if (["today", "archive", "shared_link"].includes(String(input.entry_point)))
      payload.entry_point = String(input.entry_point);
    if (typeof input.has_watchlist_section === "boolean")
      payload.has_watchlist_section = input.has_watchlist_section;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(input.date_key)))
      payload.date_key = String(input.date_key);
  } else if (event === "share") {
    if (["copy_link", "copy_summary", "web_share"].includes(String(input.method)))
      payload.method = String(input.method);
    if (["daily", "weekly"].includes(String(input.period)))
      payload.period = String(input.period);
    if (["success", "cancel", "error", "fallback"].includes(String(input.result)))
      payload.result = String(input.result);
    if (
      ["complete", "in_progress", "partial", "delayed"].includes(
        String(input.briefing_status),
      )
    )
      payload.briefing_status = String(input.briefing_status);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(input.date_key)))
      payload.date_key = String(input.date_key);
  }

  return payload;
}

function runtimeConfig() {
  const origin =
    typeof location === "undefined"
      ? "https://www.bvtmoneyflow.xyz"
      : location.origin;
  return createTelemetryConfig(
    import.meta.env as Record<string, unknown>,
    origin,
  );
}

function privacySignalEnabled() {
  if (typeof navigator === "undefined") return false;
  const privateNavigator = navigator as Navigator & {
    globalPrivacyControl?: boolean;
  };
  return (
    privateNavigator.globalPrivacyControl === true ||
    navigator.doNotTrack === "1"
  );
}

export function trackTelemetry(
  event: TelemetryEventName,
  input: Record<string, unknown> = {},
) {
  if (typeof window === "undefined" || privacySignalEnabled()) return;
  const config = runtimeConfig();
  if (!config.enabled || !config.endpoint || Math.random() > config.sampleRate)
    return;
  const payload = sanitizeTelemetryPayload(
    event,
    input,
    window.location.pathname,
  );
  if (!payload) return;
  if (config.siteId) payload.site_id = config.siteId;
  void fetch(config.endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
    cache: "no-store",
  }).catch(() => undefined);
}

function safeErrorKind(value: unknown) {
  const allowed = new Set([
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "NetworkError",
  ]);
  return allowed.has(String(value)) ? String(value) : "UnknownError";
}

function hashSafeText(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function safeErrorDescriptor(error: unknown) {
  const kind = safeErrorKind(error instanceof Error ? error.name : undefined);
  // Error messages and the first stack line may contain user input. Never inspect or transmit them.
  const frames =
    error instanceof Error && typeof error.stack === "string"
      ? error.stack
          .split("\n")
          .slice(1)
          .flatMap((line) => {
            const match = line.match(/\/assets\/[a-zA-Z0-9._-]+(?::\d+){0,2}/);
            return match ? [match[0]] : [];
          })
          .slice(0, 3)
      : [];
  return {
    error_kind: kind,
    fingerprint: hashSafeText(`${kind}|${frames.join("|")}`),
  };
}

export function reportPrivacySafeError(
  error: unknown,
  boundary: "tanstack_root" | "global" = "global",
) {
  trackTelemetry("error_boundary_shown", {
    boundary,
    ...safeErrorDescriptor(error),
  });
}

function reportVital(metric: Metric) {
  trackTelemetry("web_vital", {
    metric_name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigation_type: metric.navigationType,
  });
}

let initialized = false;
export async function initializePrivacySafeTelemetry() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const config = runtimeConfig();
  if (!config.enabled || privacySignalEnabled()) return;

  window.addEventListener("bvt:analytics", (event) => {
    const detail =
      event instanceof CustomEvent &&
      event.detail &&
      typeof event.detail === "object"
        ? (event.detail as Record<string, unknown>)
        : {};
    const name = String(detail.event ?? "");
    if (EVENT_NAMES.has(name))
      trackTelemetry(name as TelemetryEventName, detail);
  });
  window.addEventListener("error", (event) =>
    reportPrivacySafeError(event.error, "global"),
  );
  window.addEventListener("unhandledrejection", (event) =>
    reportPrivacySafeError(event.reason, "global"),
  );
  trackTelemetry("page_view");

  const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import("web-vitals");
  onCLS(reportVital);
  onFCP(reportVital);
  onINP(reportVital);
  onLCP(reportVital);
  onTTFB(reportVital);
}
