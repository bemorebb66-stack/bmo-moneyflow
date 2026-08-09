import { useEffect, useState } from "react";

const STORAGE_KEY = "bvt-favorite-groups";

function readFavorites() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function useGroupFavorites() {
  const [ids, setIds] = useState<string[]>(readFavorites);
  useEffect(() => {
    const sync = () => setIds(readFavorites());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const toggle = (id: string) => setIds((current) => {
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
  return { ids, has: (id: string) => ids.includes(id), toggle };
}
