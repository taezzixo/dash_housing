# 청약맵 (dash_housing) — 작업 가이드

새 대화를 시작하면 이 파일을 먼저 읽습니다. 진행 상황과 결정 사항은 Notion에 있으니 아래 "인계 문서" 항목을 함께 봅니다.

## 한눈에 보기
- 전국 청약 공고를 카카오 지도에 표시하고, 사용자 조건으로 지원 가능 여부를 참고 판정하는 웹사이트입니다.
- 서버와 DB가 없는 정적 사이트입니다. 데이터는 GitHub Actions가 매일 수집해 저장소의 JSON 파일로 커밋합니다.
- 배포: Cloudflare Workers(정적 자산). `main`에 푸시하면 자동 빌드·배포됩니다. 설정은 `wrangler.jsonc`.
- 운영 주소: https://dash-housing.kth95280.workers.dev (관리자: `/admin.html`)
- 저장소는 **공개**입니다. 키·토큰·개인정보를 절대 커밋하지 않습니다.

## 기술 스택과 원칙
- React 18 + TypeScript + Vite. 외부 런타임 의존성은 `react`, `react-dom`, 계정 기능의 `@supabase/supabase-js`뿐입니다. 새 의존성을 추가하기 전에 확인을 받습니다.
- 자격 판정 기준값은 `src/config/criteria.ts` 한 곳에만 둡니다. 기준이 바뀌면 새 버전을 **추가**하고 기존 버전은 지우지 않습니다.
- 사용자 입력(소득·자산 등)은 서버로 보내지 않습니다. 계정 저장은 사용자가 켠 경우에만 Supabase에 저장합니다.
- 판정·점수 화면에는 "참고용 안내"와 공고 원문 링크를 항상 둡니다.
- 지도 마커 색은 접수 상태만 뜻합니다. 판정은 목록 배지(✓ △ ✗)와 토글로 표현합니다.

## 명령
```bash
npm install            # 의존성 설치
npm run dev            # 개발 서버 (지도는 VITE_KAKAO_JS_KEY 필요)
npm test               # 단위 테스트 (현재 31개, 모두 통과해야 함)
npm run build          # 타입 검사 + 빌드 + 공고별 SEO 페이지 생성
npm run fetch:data     # 공고 수집 (DATA_GO_KR_KEY, KAKAO_REST_KEY 환경변수 필요)
```
- 이 환경은 프록시를 거치므로 수집 시 `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`를 함께 씁니다.

## 디렉터리
- `src/App.tsx` — 메인 화면(필터, 탭, 목록, 상세 패널 연결)
- `src/components/` — `KakaoMap.tsx`(지도·라벨·클러스터), `NoticeDetail.tsx`(공고 상세), `ProfileForm.tsx`(내 조건), `Account.tsx`(계정 저장), `Agenda.tsx`(일정)
- `src/lib/` — `eligibility.ts`(자격 판정), `filters.ts`(접수 상태·필터), `related.ts`(같은 단지 묶기), `checklist.ts`(서류 안내), `schedule.ts`(일정·.ics), `account.ts`(Supabase)
- `src/admin/` — 관리자페이지(수집 현황, 품질, 변경 감지, 수동 보정, 회원 집계)
- `scripts/fetch-notices.mjs` — 수집 메인. 청약홈 API, LH API, 청년안심주택 목록·상세를 모아 정규화하고 위치를 찾습니다.
- `scripts/lib/` — `geo.mjs`(주소·단지명 위치 찾기), `track.mjs`(정정·취소 추적, 보관), `quality.mjs`(정합성 점검), `competition.mjs`(경쟁률·당첨가점)
- `scripts/sources/youth-seoul.mjs` — 서울 청년안심주택 목록과 상세 파싱
- `scripts/prerender.mjs` — 공고별 정적 페이지(`/n/<id>`), 사이트맵, robots
- `public/data/` — `notices.json`(진행 중 공고), `archive.json`(끝난 공고 1년), `run-log.json`(수집 기록), `overrides.json`(관리자 수동 보정)
- `data/geocache.json` — 주소 좌표 캐시 (수집 때마다 자동 갱신)
- `supabase/schema.sql` — 계정 저장 테이블·보안 정책(RLS)·탈퇴·집계 함수
- `docs/` — `ADMIN.md`(관리자 사용법), `ACCOUNT.md`(계정 설정), `API_KEYS.md`(키 목록, 값 없음)

## 데이터 규칙
- 공고 식별자 `id`는 출처별로 고정입니다(`ah-…`, `lh-…`, `ys-…`, `manual-…`). 바꾸면 저장된 관심 공고와 링크가 깨집니다.
- 접수가 끝난 공고는 기본 숨김이고, "지난 공고" 체크 시에만 보입니다. 발표·계약이 남으면 "계약 대기"로 진행 중에 포함합니다.
- 출처가 갑자기 0건을 반환하면(청약홈 자정 갱신 등) 일시 장애로 보고 직전 데이터를 유지합니다.
- 수동 보정은 `public/data/overrides.json`에서 합니다(숨김, 좌표 수정, 수동 등록). 코드를 고칠 필요가 없습니다.
- 공고 원문에서 얻은 정보를 쓸 때는 출처(원문 링크)를 남깁니다.

## 배포와 커밋
- `main`에 푸시하면 Cloudflare가 자동 배포합니다. 배포 확인은 운영 주소의 JS 파일을 받아 새 문구가 있는지 봅니다.
- 매일 06:17 KST에 GitHub Actions가 수집 데이터를 커밋합니다. 이 봇 커밋은 GitHub에서 "Unverified"로 표시되지만, 사이트와 배포에는 영향이 없습니다. 고치려고 `main`을 강제 푸시하지 않습니다.
- 커밋 메시지에는 Claude 공동 작성 줄과 `Claude-Session` 줄을 함께 씁니다.
- 사용자가 요청하지 않은 PR은 만들지 않습니다.

## 보안 체크리스트
- 키 값은 커밋, 로그, 채팅, Notion 일반 페이지에 쓰지 않습니다. 키 목록은 `docs/API_KEYS.md`(값 없음)와 Notion 비공개 보관함을 봅니다.
- 개인정보(이메일, 전화번호, 소득 등)를 로그나 수집 파일에 남기지 않습니다.
- 외부 사이트 크롤링은 robots.txt와 이용 조건을 먼저 확인합니다. SH는 AI 수집기를 막고 있어서 자동 수집하지 않습니다.

## 인계 문서 (Notion)
- 상위 기획서: 「청약맵 (dash_housing) 기획서」
- 인계 문서: 「인계 문서 (새 대화 시작용)」 — 현재 상태, 다음 할 일, 결정 대기 항목
- 진행 보고: 「v0.3 진행 결과 보고 (1차)」, 「v0.2 진행 결과 보고 + 추가 컨펌」
- 키 보관함: 「청약맵 API 키 보관함 (비공개)」 — 접속 주소 표도 여기서 관리합니다.

## 새 대화를 시작할 때 할 일
1. 이 파일을 읽습니다.
2. 인계 문서 페이지를 읽고 "다음 할 일"을 확인합니다.
3. 작업 범위를 한 주제로 정합니다. 주제가 바뀌면 새 대화를 엽니다.
