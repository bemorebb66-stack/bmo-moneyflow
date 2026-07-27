export type DirectoryStock = {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  ipoYear: string;
};

type DirectoryPayload = {
  stocks?: DirectoryStock[];
};

let directoryPromise: Promise<DirectoryStock[]> | null = null;

export function loadStockDirectory() {
  if (!directoryPromise) {
    directoryPromise = fetch("/stock_directory.json", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("상장 종목 목록을 불러오지 못했습니다.");
        return response.json() as Promise<DirectoryPayload>;
      })
      .then((payload) => payload.stocks ?? [])
      .catch((error) => {
        console.error("Stock directory load failed", error);
        directoryPromise = null;
        return [];
      });
  }
  return directoryPromise;
}
