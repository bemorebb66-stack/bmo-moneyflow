export type AssetType =
  | "COMMON_STOCK"
  | "ETF"
  | "LEVERAGED_ETF"
  | "INVERSE_ETF"
  | "LEVERAGED_INVERSE_ETF"
  | "VOLATILITY_ETP"
  | "ETN"
  | "UNKNOWN";
export type AssetDirection = "LONG" | "SHORT" | "NEUTRAL";
export type MappingStatus = "VERIFIED" | "AUTO_DETECTED" | "REVIEW_REQUIRED" | "UNKNOWN";

export type EtfMetadata = {
  ticker: string;
  productName: string;
  nameKo: string;
  assetType: AssetType;
  leverageMultiple: number;
  direction: AssetDirection;
  underlyingType: "INDEX" | "SECTOR" | "SINGLE_STOCK" | "COMMODITY" | "VOLATILITY" | "CRYPTO" | "UNKNOWN";
  underlyingTicker?: string;
  underlyingSector?: string;
  underlyingIndex?: string;
  underlyingIndustry?: string;
  theme: string;
  provider: string;
  dailyReset: boolean;
  mappingStatus: MappingStatus;
  isActive: boolean;
};

type ProductSeed = Omit<EtfMetadata, "productName" | "dailyReset" | "mappingStatus" | "isActive"> & {
  productName?: string;
  dailyReset?: boolean;
};

const verified = (row: ProductSeed): EtfMetadata => ({
  ...row,
  productName: row.productName ?? row.nameKo,
  dailyReset: row.dailyReset ?? row.leverageMultiple !== 1,
  mappingStatus: "VERIFIED",
  isActive: true,
});

const rows: EtfMetadata[] = [
  verified({ ticker: "SPY", nameKo: "SPDR S&P 500 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "S&P 500", theme: "미국 대형주", provider: "State Street" }),
  verified({ ticker: "QQQ", nameKo: "인베스코 QQQ", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "Nasdaq 100", theme: "나스닥 100", provider: "Invesco" }),
  verified({ ticker: "IWM", nameKo: "아이셰어즈 러셀 2000 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "Russell 2000", theme: "미국 소형주", provider: "iShares" }),
  verified({ ticker: "DIA", nameKo: "SPDR 다우존스 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "Dow Jones", theme: "다우존스", provider: "State Street" }),
  verified({ ticker: "SOXX", nameKo: "아이셰어즈 반도체 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "SECTOR", underlyingSector: "Technology", underlyingIndustry: "Semiconductors", theme: "반도체", provider: "iShares" }),
  verified({ ticker: "SMH", nameKo: "반에크 반도체 ETF", assetType: "ETF", leverageMultiple: 1, direction: "LONG", underlyingType: "SECTOR", underlyingSector: "Technology", underlyingIndustry: "Semiconductors", theme: "반도체", provider: "VanEck" }),
  verified({ ticker: "SOXL", nameKo: "디렉시온 반도체 3배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 3, direction: "LONG", underlyingType: "SECTOR", underlyingSector: "Technology", underlyingIndustry: "Semiconductors", underlyingIndex: "NYSE Semiconductor Index", theme: "반도체", provider: "Direxion" }),
  verified({ ticker: "SOXS", nameKo: "디렉시온 반도체 3배 인버스 ETF", assetType: "LEVERAGED_INVERSE_ETF", leverageMultiple: 3, direction: "SHORT", underlyingType: "SECTOR", underlyingSector: "Technology", underlyingIndustry: "Semiconductors", theme: "반도체", provider: "Direxion" }),
  verified({ ticker: "TQQQ", nameKo: "프로셰어즈 나스닥 100 3배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 3, direction: "LONG", underlyingType: "INDEX", underlyingIndex: "Nasdaq 100", theme: "나스닥 100", provider: "ProShares" }),
  verified({ ticker: "SQQQ", nameKo: "프로셰어즈 나스닥 100 3배 인버스 ETF", assetType: "LEVERAGED_INVERSE_ETF", leverageMultiple: 3, direction: "SHORT", underlyingType: "INDEX", underlyingIndex: "Nasdaq 100", theme: "나스닥 100", provider: "ProShares" }),
  verified({ ticker: "TSLL", nameKo: "디렉시온 테슬라 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "TSLA", theme: "테슬라", provider: "Direxion" }),
  verified({ ticker: "TSLZ", nameKo: "테슬라 2배 인버스 ETF", assetType: "LEVERAGED_INVERSE_ETF", leverageMultiple: 2, direction: "SHORT", underlyingType: "SINGLE_STOCK", underlyingTicker: "TSLA", theme: "테슬라", provider: "T-Rex" }),
  verified({ ticker: "NVDL", nameKo: "그래닛셰어즈 엔비디아 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "NVDA", theme: "엔비디아", provider: "GraniteShares" }),
  verified({ ticker: "NVDS", nameKo: "엔비디아 인버스 ETF", assetType: "INVERSE_ETF", leverageMultiple: 1, direction: "SHORT", underlyingType: "SINGLE_STOCK", underlyingTicker: "NVDA", theme: "엔비디아", provider: "AXS" }),
  verified({ ticker: "CONL", nameKo: "그래닛셰어즈 코인베이스 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "COIN", theme: "코인베이스", provider: "GraniteShares" }),
  verified({ ticker: "GGLL", nameKo: "디렉시온 구글 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "GOOGL", theme: "알파벳", provider: "Direxion" }),
  verified({ ticker: "MSTU", nameKo: "마이크로스트래티지 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "MSTR", theme: "마이크로스트래티지", provider: "T-Rex" }),
  verified({ ticker: "MSTZ", nameKo: "마이크로스트래티지 2배 인버스 ETF", assetType: "LEVERAGED_INVERSE_ETF", leverageMultiple: 2, direction: "SHORT", underlyingType: "SINGLE_STOCK", underlyingTicker: "MSTR", theme: "마이크로스트래티지", provider: "T-Rex" }),
  verified({ ticker: "WDCX", productName: "Tradr 2X Long WDC Daily ETF", nameKo: "트래더 웨스턴디지털 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "WDC", theme: "웨스턴디지털", provider: "Tradr" }),
  verified({ ticker: "MRVU", productName: "Direxion Daily MRVL Bull 2X ETF", nameKo: "디렉시온 마벨 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "MRVL", theme: "마벨 테크놀로지", provider: "Direxion" }),
  verified({ ticker: "ADBG", productName: "Leverage Shares 2x Long ADBE Daily ETF", nameKo: "레버리지셰어즈 어도비 2배 ETF", assetType: "LEVERAGED_ETF", leverageMultiple: 2, direction: "LONG", underlyingType: "SINGLE_STOCK", underlyingTicker: "ADBE", theme: "어도비", provider: "Leverage Shares" }),
  verified({ ticker: "UVIX", nameKo: "2배 롱 VIX 선물 ETF", assetType: "VOLATILITY_ETP", leverageMultiple: 2, direction: "LONG", underlyingType: "VOLATILITY", underlyingIndex: "VIX Short-Term Futures", theme: "변동성", provider: "Volatility Shares" }),
];

export const ETF_METADATA = Object.fromEntries(rows.map((row) => [row.ticker, row])) as Record<string, EtfMetadata>;
export const getEtfMetadata = (ticker: string) => ETF_METADATA[ticker.toUpperCase()];

const leveragedNamePattern = /(?:\b(?:2x|3x|-1x|-2x|short|inverse|bull|bear|daily|ultra|ultrapro)\b)/i;

export function detectLeveragedProduct(ticker: string, productName: string): EtfMetadata | undefined {
  const known = getEtfMetadata(ticker);
  if (known) return known;
  if (!leveragedNamePattern.test(productName)) return undefined;
  const short = /(?:short|inverse|bear|-1x|-2x)/i.test(productName);
  const multiple = Number(productName.match(/(?:^|\s)([23])x\b/i)?.[1] ?? 1);
  return {
    ticker: ticker.toUpperCase(), productName, nameKo: productName,
    assetType: short ? "LEVERAGED_INVERSE_ETF" : "LEVERAGED_ETF",
    leverageMultiple: multiple, direction: short ? "SHORT" : "LONG",
    underlyingType: "UNKNOWN", theme: "검수 대기", provider: "",
    dailyReset: /daily/i.test(productName), mappingStatus: "REVIEW_REQUIRED", isActive: true,
  };
}
