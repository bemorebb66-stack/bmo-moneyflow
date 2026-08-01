const ticker = new URLSearchParams(window.location.search).get("ticker");
if (ticker && /^[A-Za-z0-9-]{1,12}$/.test(ticker)) {
  try {
    const response = await fetch("/static-stock-pages.json");
    const slugs = await response.json();
    const slug = ticker.toLowerCase();
    if (Array.isArray(slugs) && slugs.includes(slug)) {
      window.location.replace(`/stocks/${slug}/`);
    }
  } catch {
    // The client route remains available when the static lookup fails.
  }
}
