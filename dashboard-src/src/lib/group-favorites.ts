import { useEffect, useState } from "react";

const STORAGE_KEY = "bvt-favorite-groups";
const CHANGE_EVENT = "bvt-group-favorites-change";

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
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);
  const toggle = (id: string) => {
    const current = readFavorites();
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return { ids, has: (id: string) => ids.includes(id), toggle };
}
