# API 키 목록 (값은 저장하지 않음)

이 저장소는 **공개 저장소**이므로 키 값을 커밋하지 않습니다.
- 키 값: 소유자의 Notion 비공개 페이지 「청약맵 API 키 보관함」에 있습니다.
- 서비스용: GitHub → Settings → Secrets and variables → Actions에만 등록합니다.

| 서비스 | 발급처 | GitHub Secret | 사용 위치 | 상태 |
|---|---|---|---|---|
| 청약홈 분양정보 조회 (한국부동산원) | data.go.kr | `DATA_GO_KR_KEY` | scripts/fetch-notices.mjs | 발급됨 · 미적용 |
| LH 분양임대공고문 조회 | data.go.kr | `DATA_GO_KR_KEY` (동일 키) | scripts/fetch-notices.mjs | 발급됨 · 미적용 |
| LH 분양임대공고문 조회 (사전청약) | data.go.kr | `DATA_GO_KR_KEY` | — | 발급됨 · 연동 검토 |
| LH 분양임대공고별 공급정보 조회 (사전청약) | data.go.kr | `DATA_GO_KR_KEY` | — | 발급됨 · 연동 검토 |
| LH 분양임대공고별 상세정보 조회 (사전청약) | data.go.kr | `DATA_GO_KR_KEY` | — | 발급됨 · 연동 검토 |
| SH 공사계약 정보 / 장기전세 공급계획 / 국민임대 공급계획 / 주택관리현황 | 서울 열린데이터광장 | `SEOUL_OPENDATA_KEY_*` (안) | — | 발급됨 · 활용 여부 검토 |
| 카카오맵 JavaScript 키 | developers.kakao.com | `KAKAO_JS_KEY` | 빌드 시 `VITE_KAKAO_JS_KEY` | 발급됨 · 미적용 (도메인 제한 필수) |
| 카카오 REST API 키 | developers.kakao.com | `KAKAO_REST_KEY` | 지오코딩 | 발급됨 · 미적용 |
| 카카오 네이티브 앱 키 | developers.kakao.com | — | 웹에서는 사용하지 않음 | 불필요 |
