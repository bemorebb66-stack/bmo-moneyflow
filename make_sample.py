# 미리보기용 샘플 데이터 생성기 (실서비스에선 fetch_data.py가 대체)
import json, random, os
random.seed(66)

U = [
 # t, name, sector, industry, custom_grp(optional), base_price, base_dv($B)
 ("NVDA","NVIDIA","Information Technology","Semiconductors","반도체 · GPU/AI가속",1180,42),
 ("AMD","Advanced Micro Devices","Information Technology","Semiconductors","반도체 · GPU/AI가속",162,7.5),
 ("MU","Micron Technology","Information Technology","Semiconductors","반도체 · 메모리/스토리지",148,4.2),
 ("WDC","Western Digital","Information Technology","Technology Hardware","반도체 · 메모리/스토리지",78,0.9),
 ("STX","Seagate","Information Technology","Technology Hardware","반도체 · 메모리/스토리지",112,0.7),
 ("INTC","Intel","Information Technology","Semiconductors","반도체 · CPU/IP",31,2.8),
 ("ARM","Arm Holdings","Information Technology","Semiconductors","반도체 · CPU/IP",139,1.6),
 ("AVGO","Broadcom","Information Technology","Semiconductors","반도체 · 네트워킹/커스텀ASIC",245,8.9),
 ("MRVL","Marvell Technology","Information Technology","Semiconductors","반도체 · 네트워킹/커스텀ASIC",68,2.1),
 ("TXN","Texas Instruments","Information Technology","Semiconductors","반도체 · 아날로그/전력",198,1.4),
 ("ADI","Analog Devices","Information Technology","Semiconductors","반도체 · 아날로그/전력",232,1.1),
 ("MPWR","Monolithic Power","Information Technology","Semiconductors","반도체 · 아날로그/전력",710,0.8),
 ("ON","ON Semiconductor","Information Technology","Semiconductors","반도체 · 아날로그/전력",54,0.9),
 ("QCOM","Qualcomm","Information Technology","Semiconductors","반도체 · RF/모바일",171,2.4),
 ("SWKS","Skyworks","Information Technology","Semiconductors","반도체 · RF/모바일",89,0.4),
 ("QRVO","Qorvo","Information Technology","Semiconductors","반도체 · RF/모바일",92,0.3),
 ("NXPI","NXP Semiconductors","Information Technology","Semiconductors","반도체 · 차량/MCU",228,0.8),
 ("MCHP","Microchip Technology","Information Technology","Semiconductors","반도체 · 차량/MCU",62,0.7),
 ("AMAT","Applied Materials","Information Technology","Semiconductor Equipment","반도체 · 장비",212,2.2),
 ("LRCX","Lam Research","Information Technology","Semiconductor Equipment","반도체 · 장비",98,1.8),
 ("KLAC","KLA Corp","Information Technology","Semiconductor Equipment","반도체 · 장비",842,1.3),
 ("ASML","ASML Holding","Information Technology","Semiconductor Equipment","반도체 · 장비",812,1.5),
 ("TER","Teradyne","Information Technology","Semiconductor Equipment","반도체 · 장비",132,0.5),
 ("MSFT","Microsoft","Information Technology","Software - Infrastructure",None,468,9.8),
 ("PLTR","Palantir","Information Technology","Software - Infrastructure",None,148,8.4),
 ("ORCL","Oracle","Information Technology","Software - Infrastructure",None,218,3.1),
 ("ADBE","Adobe","Information Technology","Software - Application",None,392,1.9),
 ("CRM","Salesforce","Information Technology","Software - Application",None,246,2.0),
 ("NOW","ServiceNow","Information Technology","Software - Application",None,1020,1.7),
 ("INTU","Intuit","Information Technology","Software - Application",None,742,1.2),
 ("PANW","Palo Alto Networks","Information Technology","Software - Infrastructure","소프트웨어 · 사이버보안",198,1.6),
 ("CRWD","CrowdStrike","Information Technology","Software - Infrastructure","소프트웨어 · 사이버보안",478,1.9),
 ("FTNT","Fortinet","Information Technology","Software - Infrastructure","소프트웨어 · 사이버보안",102,0.8),
 ("GEN","Gen Digital","Information Technology","Software - Infrastructure","소프트웨어 · 사이버보안",29,0.2),
 ("AAPL","Apple","Information Technology","Consumer Electronics",None,232,8.7),
 ("DELL","Dell Technologies","Information Technology","Computer Hardware",None,142,1.8),
 ("ANET","Arista Networks","Information Technology","Computer Hardware",None,118,2.3),
 ("GOOGL","Alphabet","Communication Services","Internet Content & Information",None,196,6.4),
 ("META","Meta Platforms","Communication Services","Internet Content & Information",None,712,7.2),
 ("NFLX","Netflix","Communication Services","Entertainment",None,1284,2.6),
 ("DIS","Walt Disney","Communication Services","Entertainment",None,118,1.4),
 ("TMUS","T-Mobile US","Communication Services","Telecom Services",None,242,0.9),
 ("AMZN","Amazon","Consumer Discretionary","Internet Retail",None,228,7.9),
 ("TSLA","Tesla","Consumer Discretionary","Auto Manufacturers",None,342,18.5),
 ("HD","Home Depot","Consumer Discretionary","Home Improvement Retail",None,368,1.3),
 ("MCD","McDonald's","Consumer Discretionary","Restaurants",None,302,0.8),
 ("SBUX","Starbucks","Consumer Discretionary","Restaurants",None,94,0.9),
 ("NKE","Nike","Consumer Discretionary","Footwear & Accessories",None,76,1.1),
 ("JPM","JPMorgan Chase","Financials","Banks - Diversified",None,284,2.4),
 ("BAC","Bank of America","Financials","Banks - Diversified",None,48,1.6),
 ("GS","Goldman Sachs","Financials","Capital Markets",None,642,1.2),
 ("V","Visa","Financials","Credit Services",None,342,1.7),
 ("MA","Mastercard","Financials","Credit Services",None,562,1.4),
 ("BRK-B","Berkshire Hathaway","Financials","Insurance - Diversified",None,478,1.1),
 ("LLY","Eli Lilly","Health Care","Drug Manufacturers",None,812,3.2),
 ("UNH","UnitedHealth","Health Care","Healthcare Plans",None,318,2.8),
 ("JNJ","Johnson & Johnson","Health Care","Drug Manufacturers",None,156,1.2),
 ("PFE","Pfizer","Health Care","Drug Manufacturers",None,26,0.9),
 ("ISRG","Intuitive Surgical","Health Care","Medical Devices",None,528,1.0),
 ("XOM","Exxon Mobil","Energy","Oil & Gas Integrated",None,118,1.9),
 ("CVX","Chevron","Energy","Oil & Gas Integrated",None,162,1.3),
 ("COP","ConocoPhillips","Energy","Oil & Gas E&P",None,108,0.9),
 ("SLB","Schlumberger","Energy","Oil & Gas Equipment",None,42,0.7),
 ("GE","GE Aerospace","Industrials","Aerospace & Defense",None,248,1.5),
 ("RTX","RTX Corp","Industrials","Aerospace & Defense",None,132,0.9),
 ("LMT","Lockheed Martin","Industrials","Aerospace & Defense",None,478,0.8),
 ("CAT","Caterpillar","Industrials","Farm & Construction Equipment",None,398,1.1),
 ("ETN","Eaton","Industrials","Electrical Equipment",None,342,1.0),
 ("VRT","Vertiv Holdings","Industrials","Electrical Equipment",None,112,1.8),
 ("PWR","Quanta Services","Industrials","Engineering & Construction",None,338,0.7),
 ("NEE","NextEra Energy","Utilities","Utilities - Regulated Electric",None,74,0.9),
 ("VST","Vistra","Utilities","Utilities - Independent Producers",None,168,2.4),
 ("CEG","Constellation Energy","Utilities","Utilities - Independent Producers",None,298,2.1),
 ("DUK","Duke Energy","Utilities","Utilities - Regulated Electric",None,118,0.5),
 ("PG","Procter & Gamble","Consumer Staples","Household Products",None,168,0.9),
 ("KO","Coca-Cola","Consumer Staples","Beverages",None,68,0.8),
 ("COST","Costco","Consumer Staples","Discount Stores",None,982,1.6),
 ("WMT","Walmart","Consumer Staples","Discount Stores",None,98,1.5),
 ("LIN","Linde","Materials","Specialty Chemicals",None,448,0.7),
 ("FCX","Freeport-McMoRan","Materials","Copper",None,46,0.9),
 ("NEM","Newmont","Materials","Gold",None,52,0.8),
 ("PLD","Prologis","Real Estate","REIT - Industrial",None,112,0.5),
 ("AMT","American Tower","Real Estate","REIT - Specialty",None,208,0.4),
]

# 시나리오: 반도체(특히 메모리/네트워킹)로 자금 유입, 소프트웨어에서 유출
BIAS = {
 "반도체 · 메모리/스토리지": (28, 3.0), "반도체 · 네트워킹/커스텀ASIC": (22, 2.2),
 "반도체 · GPU/AI가속": (12, 1.5), "반도체 · 장비": (9, 1.0),
 "Software - Application": (-16, -1.4), "Software - Infrastructure": (-12, -1.0),
 "소프트웨어 · 사이버보안": (-8, -0.6),
 "Utilities - Independent Producers": (14, 1.8), "Electrical Equipment": (10, 1.2),
 "Internet Retail": (-6, -0.5), "Entertainment": (-4, -0.3),
}

stocks = []
for t, n, sec, ind, grp, price, dvB in U:
    key = grp if grp in BIAS else ind
    dv_bias, pc_bias = BIAS.get(key, (0, 0))
    dv = dvB * 1e9
    d1 = dv_bias + random.uniform(-8, 8)
    dvp = dv / (1 + d1 / 100)
    a20 = dv / (1 + (d1 * 0.7 + random.uniform(-6, 6)) / 100)
    a60 = dv / (1 + (d1 * 0.45 + random.uniform(-7, 7)) / 100)
    a120 = dv / (1 + (d1 * 0.3 + random.uniform(-8, 8)) / 100)
    pc = pc_bias + random.uniform(-1.6, 1.6)
    row = {"t": t, "n": n, "sec": sec, "ind": ind,
           "c": round(price * (1 + random.uniform(-0.01, 0.01)), 2),
           "pc": round(pc, 2), "dv": round(dv), "dvp": round(dvp),
           "a20": round(a20), "a60": round(a60), "a120": round(a120)}
    if grp:
        row["grp"] = grp
    stocks.append(row)

out = {"updated": "2026-07-01 22:35 UTC (샘플 데이터)", "market_date": "2026-07-01",
       "count": len(stocks), "stocks": stocks}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "data.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(f"샘플 {len(stocks)}종목 생성")
