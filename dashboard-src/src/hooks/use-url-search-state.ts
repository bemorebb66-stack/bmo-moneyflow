import * as React from "react";

const URL_SEARCH_EVENT = "bvt:url-search-change";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(URL_SEARCH_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(URL_SEARCH_EVENT, callback);
  };
}

function getSnapshot() {
  return window.location.search;
}

function getServerSnapshot() {
  return "";
}

export function useUrlSearchState() {
  const search = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const params = React.useMemo(() => new URLSearchParams(search), [search]);

  const update = React.useCallback(
    (
      mutate: (next: URLSearchParams) => void,
      options: { replace?: boolean } = {},
    ) => {
      const url = new URL(window.location.href);
      mutate(url.searchParams);
      const method = options.replace === false ? "pushState" : "replaceState";
      window.history[method]({}, "", url);
      window.dispatchEvent(new Event(URL_SEARCH_EVENT));
    },
    [],
  );

  return { params, update };
}
