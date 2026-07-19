# BVT Money Flow

S&P 500 + 나스닥 100 + 러셀2000 상위권의 **거래대금(종가×거래량)** 변화를 매일 추적해
섹터/산업/커스텀 그룹 간 **자금 이동(로테이션)**을 시각화하는 정적 사이트.

- 종목별: 전일 / 20일 / 60일 / 120일 평균 대비 거래대금 변화율
- 그룹별: 거래대금 변화율 + 시장 점유율 변화(Δ%p) + 유입/유출 신호
- 분류 3단 토글: GICS 대분류(11) / 세부 industry / 커스텀 그룹(반도체 세분화 등)
- 비용: **0원** (GitHub Actions + GitHub Pages)

## 배포 방법 (5분)

1. GitHub에 새 public 저장소 생성 (예: `bmo-moneyflow`)
2. 이 폴더의 파일 전체를 저장소 루트에 push
3. 저장소 **Settings → Actions → General** → Workflow permissions을
   **Read and write permissions**로 변경 (봇이 data.json을 커밋해야 함)
4. **Actions 탭** → "Update market data" → **Run workflow**로 1회 수동 실행
   → 실데이터 `data.json` + `sector_map.json` 생성 확인 (첫 실행은 러셀2000 상위권 섹터 정보 수집 때문에 10~20분 이상 걸릴 수 있음)
5. **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / root
6. 완료. 이후 매 거래일 한국시간 오전 7:30에 자동 갱신

Vercel을 쓰고 싶으면 같은 저장소를 Vercel에 연결만 하면 됨 (정적 사이트라 설정 불필요).

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 프론트엔드 전체 (단일 파일) |
| `fetch_data.py` | 일별 데이터 수집·지표 계산 → `data.json` |
| `custom_groups.json` | **커스텀 그룹 정의 (여기만 수정하면 됨)** |
| `sector_map.json` | 섹터/industry 캐시 (자동 생성·갱신) |
| `data.json` | 사이트가 읽는 데이터 (자동 생성) |
| `.github/workflows/update.yml` | 매일 22:30 UTC 자동 실행 크론 |
| `make_sample.py` | 로컬 미리보기용 샘플 데이터 생성기 (배포엔 불필요) |

## 커스텀 그룹 수정

`custom_groups.json`의 `groups`에 `"그룹명": ["티커", ...]` 형태로 추가/수정 후 커밋.
매핑 안 된 종목은 자동으로 yfinance industry 분류를 따름.
티커의 점(.)은 하이픈(-)으로 표기 (예: BRK.B → BRK-B).

## 유니버스 설정

기본값은 S&P 500 + 나스닥 100에 IWM ETF 보유 상위 600개(러셀2000 상위권 프록시)를 더함.
GitHub Actions 환경 변수로 조절 가능:

- `MONEY_FLOW_RUSSELL_MODE=off|top|all` (기본 `top`)
- `MONEY_FLOW_RUSSELL_MAX=600` (`top`일 때 추가할 IWM 상위 보유 종목 수)
- `MONEY_FLOW_YF_CHUNK_SIZE=250` (Yahoo Finance 가격 다운로드 묶음 크기)

## 로컬 미리보기

```bash
python make_sample.py      # 샘플 데이터 생성 (또는 python fetch_data.py 로 실데이터)
python -m http.server 8000 # http://localhost:8000 접속
```

## 해석 주의

거래대금 증가 ≠ 매수 유입. 거래대금엔 매수·매도가 함께 잡히므로
사이트는 **거래대금 변화 × 가격 방향**을 결합해 유입/유출을 추정하며,
"돈의 이동"에 가장 가까운 지표는 **시장 점유율 변화(Δ%p)**임.
정보 제공 목적이며 투자 권유 아님.

## BVT Replay 기반

시장 데이터 갱신 뒤 `replay_data/snapshots/YYYY-MM-DD.json`에 종목·섹터·산업·시가총액·편입지수별 지표를 저장합니다. 같은 거래일 파일을 덮어써 중복 생성을 막고 `replay_data/manifest.json`에서 적재 범위를 확인합니다.

표준 거래내역 양식은 `replay_data/bvt-standard-trades.csv`입니다. 현재 내부 MVP는 미국주식 USD 거래와 완전히 청산된 거래를 평균단가 방식으로 분석합니다.

```bash
python scripts/build_replay_snapshot.py
python scripts/replay_analyzer.py replay_data/bvt-standard-trades.csv --output replay-result.json
python -m unittest discover -s tests -p "test_*.py"
```

과거 시장환경은 아래 명령으로 최근 90거래일까지 소급 생성할 수 있습니다.

```bash
python scripts/backfill_replay_snapshots.py --days 90
```

과거 백필의 가격과 거래량은 해당 거래일 값이며, 섹터·산업·시총·편입지수는 현재 `data.json`의 분류를 과거에 적용한 근사치입니다. GitHub Actions의 `Backfill BVT Replay history` 작업에서도 대상 거래일 수를 지정해 수동 실행할 수 있습니다.

원본 CSV·XLSX·XLS 파일은 브라우저에서만 읽으며 별도로 복사하거나 저장하지 않습니다. 계좌번호·고객명 등 개인정보 열은 분석에서 제외합니다.

사용자용 2차 화면은 `/replay/`에서 제공합니다. CSV·Excel 시트와 헤더를 자동 탐색하고, 인식이 부족하면 사용자가 열을 직접 연결할 수 있습니다. 검토와 평균단가 계산은 브라우저에서 실행되며, 확인된 완결 거래에 공개 Replay 스냅샷을 연결해 조건별 승률과 평균 수익률을 표시합니다.
