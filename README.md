# BVT Money Flow by BMO Value Talks

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
