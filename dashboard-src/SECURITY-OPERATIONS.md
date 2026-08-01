# 보안·캐시·운영 적용 메모

## 현재 저장소에서 적용한 기본값

- 브라우저용 CSP와 `Referrer-Policy` 메타 태그를 정적 HTML에 포함한다.
- `_headers`를 지원하는 엣지/정적 호스팅에서는 CSP, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`와 경로별 캐시 정책을 적용한다.
- 해시가 붙은 `/assets/*`만 1년 `immutable`로 캐시한다. HTML과 핵심 JSON은 재검증하고, 보조 JSON과 스냅숏은 5분 뒤 재검증한다.
- HSTS는 의도적으로 포함하지 않는다.
- 분석·오류·Web Vitals는 `VITE_TELEMETRY_ENABLED=false`가 기본이며 수집 주소가 없으면 동작하지 않는다. `VITE_*` 값은 브라우저에 공개되므로 비밀키를 넣지 않는다.
- 빌드마다 `data-status.json`에 원본별 갱신 시각, SHA-256, 지연·미상 상태와 검증된 마지막 시장/리플레이 버전을 기록한다. 구조·개수·날짜 불일치는 빌드를 실패시키며, 지연은 빌드를 막지 않고 운영 경보 입력으로 남긴다.

## HSTS 적용 순서

1. 외부 엣지 계층을 선택하고 apex와 `www`가 모두 의도한 원본으로만 연결되는지 확인한다.
2. 두 호스트 모두 유효한 인증서, HTTP→HTTPS 단일 리디렉션, 혼합 콘텐츠 없음, 인증서 자동 갱신을 확인한다.
3. 먼저 짧은 `Strict-Transport-Security: max-age=300`을 엣지에서 적용하고 장애 여부를 관찰한다.
4. 1일, 1주 순으로 늘린 뒤 모든 하위 도메인이 HTTPS임을 확인한 경우에만 `includeSubDomains`를 검토한다.
5. 최소 수개월 안정화 뒤 `max-age=31536000`을 사용한다. `preload`는 복구가 어려우므로 별도 승인과 사전 점검 없이는 사용하지 않는다.

## GitHub Pages 밖에서 필요한 작업

GitHub Pages는 사용자 지정 응답 헤더와 경로별 `Cache-Control`을 설정할 수 없다. `_headers`는 저장소의 실행 가능한 명세이지만 현재 GitHub Pages에서는 효력이 없다. 실제 `frame-ancestors`, `nosniff`, `Permissions-Policy`, 캐시 정책과 향후 HSTS에는 Cloudflare 같은 프록시/엣지 또는 헤더를 지원하는 호스팅 계층이 필요하다.

분석을 켜려면 개인정보를 저장하지 않는 수집 엔드포인트와 보존 기간을 먼저 결정해야 한다. 외부 HTTPS 엔드포인트를 쓸 경우 해당 출처를 CSP의 `connect-src`에 추가하고 개인정보처리방침의 사업자·처리 위치·보존 기간을 갱신한다. 클라이언트 비밀키는 만들거나 배포하지 않는다.
