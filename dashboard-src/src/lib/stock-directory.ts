import { loadDataSourceOnce } from "./data-runtime";

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

export function loadStockDirectory(signal?: AbortSignal) {
  return loadDataSourceOnce<DirectoryPayload>("stockDirectory", signal)
    .then((state) => {
      if (!state.data) {
        throw new Error(
          state.error?.message || "상장 종목 목록을 불러오지 못했습니다.",
        );
      }
      return state.data.stocks ?? [];
    })
    .catch((error) => {
      if (!signal?.aborted && import.meta.env.DEV) {
        console.error("Stock directory load failed", {
          errorKind: error instanceof Error ? error.name : "UnknownError",
        });
      }
      return [];
    });
}
