export type AssetType = "COMMON_STOCK" | "ETF" | "LEVERAGED_ETF" | "INVERSE_ETF" | "LEVERAGED_INVERSE_ETF" | "ETN" | "UNKNOWN";
export type AssetDirection = "LONG" | "SHORT" | "NEUTRAL";

export type EtfMetadata = {
  ticker: string;
  nameKo: string;
  assetType: AssetType;
  leverageMultiple: number;
  direction: AssetDirection;
  underlyingType: "INDEX" | "SECTOR" | "SINGLE_STOCK" | "VOLATILITY";
  underlyingTicker?: string;
  underlyingIndex?: string;
  underlyingIndustry?: string;
  theme: string;
  provider: string;
};

const rows: EtfMetadata[] = [
  { ticker: "SPY", nameKo: "SPDR S&P 500 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "S&P 500", theme: "미국 대형주", provider: "State Street" },
  { ticker: "QQQ", nameKo: "인베스코 QQQ", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "Nasdaq 100", theme: "나스닥 100", provider: "Invesco" },
  { ticker: "IWM", nameKo: "아이셰어즈 러셀 2000 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "Russell 2000", theme: "미국 소형주", provider: "iShares" },
  { ticker: "DIA", nameKo: "SPDR 다우존스 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "Dow Jones", theme: "다우존스", provider: "State Street" },
  { ticker: "SOXX", nameKo: "아이셰어즈 반도체 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "SECTOR", underlyingIndustry: "Semiconductors", theme: "반도체", provider: "iShares" },
  { ticker: "SMH", nameKo: "반에크 반도체 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "SECTOR", underlyingIndustry: "Semiconductors", theme: "반도체", provider: "VanEck" },
  { ticker: "SOXL", nameKo: "디렉시온 반도체 3배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 3, direction: "LONG", underlyingType: "SECTOR", underlyingIndustry: "Semiconductors", theme: "반도체", provider: "Direxion" },
  { ticker: "SOXS", nameKo: "디렉시온 반도체 3배 인버스 ETF", assetType: "LEVERAGED_INVERSE_ETF", leverageMultiple: 3, direction: "SHORT", underlyingType: "SECTOR", underlyingIndustry: "Semiconductors", theme: "반도체", provider: "Direxion" },
  { ticker: "TQQQ", nameKo: "프로셰어즈 나스닥 100 3배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 3, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "Nasdaq 100", theme: "나스닥 100", provider: "ProShares" },
  { ticker: "SQQQ", nameKo: "프로셰어즈 나스닥 100 3배 인버스 ETF", assetType: "LEVERAGED_INVERSE_ETF", leverageMultiple: 3, direction: "SHORT", underlyingType: "INDEX", underlyingIndex: "Nasdaq 100", theme: "나스닥 100", provider: "ProShares" },
  { ticker: "TSLL", nameKo: "디렉시온 테슬라 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "TSLA", theme: "테슬라", provider: "Direxion" },
  { ticker: "TSLZ", nameKo: "테슬라 2배 인버스 ETF", assetType: "LEVERAGED_INVERSE_ETF", leverageMultiple: 2, direction: "SHORT", underlyingType: "SINGLE_STOCK", underlyingTicker: "TSLA", theme: "테슬라", provider: "T-Rex" },
  { ticker: "NVDL", nameKo: "그래닛셰어즈 엔비디아 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "NVDA", theme: "엔비디아", provider: "GraniteShares" },
  { ticker: "NVDS", nameKo: "엔비디아 인버스 ETF", assetType: "INVERSE_ETF", leverageMultiple: 1, direction: "SHORT", underlyingType: "SINGLE_STOCK", underlyingTicker: "NVDA", theme: "엔비디아", provider: "AXS" },
  { ticker: "CONL", nameKo: "그래닛셰어즈 코인베이스 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "COIN", theme: "코인베이스", provider: "GraniteShares" },
  { ticker: "GGLL", nameKo: "디렉시온 구글 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "GOOGL", theme: "알파벳", provider: "Direxion" },
  { ticker: "MSTU", nameKo: "마이크로스트래티지 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "MSTR", theme: "마이크로스트래티지", provider: "T-Rex" },
  { ticker: "MSTZ", nameKo: "마이크로스트래티지 2배 인버스 ETF", assetType: "LEVERAGED_INVERSE_ETF", leverageMultiple: 2, direction: "SHORT", underlyingType: "SINGLE_STOCK", underlyingTicker: "MSTR", theme: "마이크로스트래티지", provider: "T-Rex" },
  { ticker: "UVIX", nameKo: "2배 롱 VIX 선물 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "VOLATILITY", underlyingIndex: "VIX Short-Term Futures", theme: "변동성", provider: "Volatility Shares" },
];

export const ETF_METADATA = Object.fromEntries(rows.map((row) => [row.ticker, row])) as Record<string, EtfMetadata>;
export const getEtfMetadata = (ticker: string) => ETF_METADATA[ticker.toUpperCase()];
