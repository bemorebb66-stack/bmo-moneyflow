const routeKind = (route) => {
  const path = String(route || "/").replace(/^https?:\/\/[^/]+/, "");
  if (/^\/stocks\//.test(path) || path === "/stock/" || path === "stock") return "stock";
  if (/^\/briefings\/weeks\//.test(path)) return "briefing-week";
  if (/^\/briefings\//.test(path)) return "briefing-day";
  if (/^\/?replay\/?/.test(path)) return "replay";
  if (/^\/?today\/?/.test(path)) return "today";
  if (path === "/" || path === "") return "home";
  return "static";
};

const allowedForRoute = (href, kind) => {
  if (/(?:^|\/)(?:replay-|broker-import-|image-trade-import-|pdf-trade-import-|pdf\.worker)/.test(href)) {
    return kind === "replay";
  }
  if (/(?:LineChart-|stocks\._ticker-)/.test(href)) return kind === "stock";
  if (/briefings\._date-/.test(href)) return kind === "briefing-day";
  if (/briefings\.weeks\._weekId-/.test(href)) return kind === "briefing-week";
  if (/(?:generateCategoricalChart-|accessible-chart-)/.test(href)) {
    return kind === "home" || kind === "today" || kind === "stock";
  }
  return true;
};

export function limitRouteModulePreloads(html, route) {
  const kind = routeKind(route);
  return html.replace(
    /^\s*<link rel="modulepreload"[^>]+href="([^"]+)"[^>]*>\s*\r?\n?/gm,
    (line, href) => (allowedForRoute(href, kind) ? line : ""),
  );
}
