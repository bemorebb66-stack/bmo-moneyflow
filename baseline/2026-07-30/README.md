# BVT Money Flow 수정 전 기준 상태

- 기록 시각: 2026-07-30 KST
- 원본 저장소: `https://github.com/bemorebb66-stack/bmo-moneyflow`
- 기준 커밋: `33625ddc0df0896b66d222b0f15b6e8c9289c632`
- 기준 커밋 설명: `Run close and pre-market refreshes twice daily`
- 기준 브랜치: `baseline-pre-improvement-20260730`
- 작업 브랜치: `work-site-improvements-20260730`
- 최초 상태: `main`과 `origin/main`이 일치하고 추적/미추적 변경 없음

## 실행 구조

- 루트: GitHub Pages용 정적 사이트와 Python 데이터 파이프라인
- 프런트엔드 소스: `dashboard-src`
- 로컬 정적 사이트: 저장소 루트에서 `python -m http.server 8000`
- 프런트 빌드: `dashboard-src`에서 `pnpm install`, `pnpm run build`
- 프런트 테스트: `dashboard-src`에서 `pnpm test`
- Python 테스트: 저장소 루트에서 `python -m unittest discover -s tests -p "test_*.py"`

## 의존성

- Python 3.12.13
- yfinance 1.5.2
- pandas 3.0.1
- lxml 6.0.2
- requests 2.34.2
- pnpm 11.9.0
- 프런트 잠금 파일 기준 449개 패키지 설치

## 빌드와 테스트

- 프런트 프로덕션 빌드: 성공
- 빌드 결과: 2,592개 모듈 변환, 약 2.43초
- 프런트 테스트: 3개 파일, 31개 테스트 전부 통과
- Python 기본 테스트: 28개 전부 통과
- 뉴스 요약 테스트: 3개 전부 통과
- IPO 락업 보강 테스트: 6개 전부 통과
- IPO 락업 반응 테스트: 4개 전부 통과
- IPO 락업 원문 연결 테스트: 4개 전부 통과
- 기존 실패 테스트: 없음

참고: 첫 프런트 빌드 시 실행 환경의 Node 경로가 잡히지 않아 실패했으나, Node 실행 경로를 명시한 동일 빌드는 성공했다. 코드 결함으로 분류하지 않는다.

빌드 경고:

- Vite가 `vite-tsconfig-paths` 대신 내장 `resolve.tsconfigPaths` 사용을 권장한다.

## 데이터 기준

| 파일 | 기준 날짜/범위 | 핵심 행 수 |
| --- | --- | ---: |
| `data.json` | 시장일 2026-07-29, 업데이트 2026-07-29 23:34 UTC | 종목 2,981 |
| `history.json` | 2026-02-05~2026-07-29 | 거래일 120, 종목 2,981 |
| `sector_map.json` | 날짜 필드 없음 | 최상위 항목 3,017 |
| `stock_directory.json` | 날짜 필드 없음 | 종목 5,861 |
| `earnings.json` | 메타데이터 참조 | 이벤트 1,020 |
| `earnings_manual.json` | 메타데이터 참조 | 이벤트 7 |
| `news.json` | 메타데이터 참조 | 기업 240 |
| `economic_events.json` | 메타데이터 참조 | 이벤트 70 |
| `weekly_summary.json` | 생성 2026-07-29 23:45:29 UTC | 주간 요약 21 |
| `custom_groups.json` | 날짜 필드 없음 | 그룹 11 |
| `korean_names.json` | 날짜 필드 없음 | 최상위 항목 1,625 |
| `replay_data/snapshots` | 2026-03-10~2026-07-29 | 스냅샷 98 |

## 주요 화면 기준

로컬 정적 서버에서 저장소 커밋 그대로 데스크톱 첫 화면을 캡처했다.

- `screenshots/home.png`
- `screenshots/scanner.png`
- `screenshots/insider.png`
- `screenshots/ipo-lockup.png`
- `screenshots/today.png`
- `screenshots/replay.png`

화면 관찰값:

- 로컬 정적 자산은 기준일 `2026-07-21`, 종목 `1,596`, `데이터 6거래일 지연`을 표시한다.
- 같은 커밋의 `data.json`은 시장일 `2026-07-29`, 종목 `2,981`이다.
- 따라서 수정 전부터 정적 화면 자산과 루트 데이터 파일 사이에 날짜 및 종목 수 불일치가 있다.
- 공개 배포 사이트는 점검 당시 기준일 `2026-07-29`, 종목 `2,981`을 표시했다.

## 복구 방법

수정 전 코드는 기준 브랜치 또는 기준 커밋으로 확인할 수 있다.

```text
git switch baseline-pre-improvement-20260730
```

특정 파일 비교 시 기준 커밋:

```text
33625ddc0df0896b66d222b0f15b6e8c9289c632
```

기준 브랜치는 수정하지 않고, 이후 기능 작업은 `work-site-improvements-20260730`에서 진행한다.
