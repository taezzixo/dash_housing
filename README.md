# 청약맵 (dash_housing)

전국 청약 공고를 지도에서 보고, 내 조건(나이·통장·소득·자산 등)으로 지원 가능한 공고를 매칭해 주는 사이트입니다.

## 기능
- **공고 지도:** 청약홈의 APT, 오피스텔·도시형, 무순위, 공공지원 민간임대, 임의공급 공고와 LH 공고를 카카오맵에 표시합니다.
- **공고 목록과 필터:** 유형, 지역, 검색어, 진행·예정 여부로 걸러 보고, 내 조건 매칭 점수 순으로 정렬할 수 있습니다.
- **자격 판정:** 일반 1순위와 특별공급(신혼부부, 생애최초, 다자녀, 신생아, 노부모, 청년)을 유형별로 판정합니다. 결과는 가능성 높음, 확인 필요, 어려움 세 단계이고 판정 근거를 함께 보여줍니다.
- **제출 서류 체크리스트:** 지원 가능한 유형에 맞춰 서류 목록을 만들고, 체크한 상태를 저장합니다.
- **일정 알림:** 관심 공고의 일정을 `.ics` 파일로 받아 폰 캘린더에 추가하면, 각 일정 전날 오전 9시에 알림이 옵니다. 서버가 필요 없습니다.
- **개인정보 보호:** 입력한 조건은 서버로 보내지 않고 브라우저(localStorage)에만 저장합니다. 사용자가 저장 여부를 직접 고릅니다.
- **광고:** 애드센스 광고 자리가 있으며, 키를 설정했을 때만 표시됩니다.

## 아키텍처 (서버·DB 없음)
```
GitHub Actions (매일 06:17 KST)
  청약홈 API · LH 공고 API ─▶ scripts/fetch-notices.mjs
      ─▶ 정규화 · LH 주택만 필터 · 카카오 지오코딩(캐시, 위치 신뢰도)
      ─▶ 직전 데이터와 비교 (일정 변경 · 정정 · 취소 의심 추적)
      ─▶ public/data/notices.json 커밋
                      │ (main 푸시)
                      ▼
Cloudflare Pages 자동 빌드·배포 (무료, 상업 이용 가능)
                      │
브라우저: 카카오맵 · 자격판정(기준 버전 관리) · 서류 안내 · .ics  ← 모두 클라이언트
```

## 설정
1. **GitHub Secrets** (완료): `DATA_GO_KR_KEY`, `KAKAO_REST_KEY`, `KAKAO_JS_KEY`
2. **Cloudflare Pages 연결**
   - Cloudflare 대시보드 → Workers & Pages → Create → Pages → **Connect to Git**에서 `taezzixo/dash_housing`를 고릅니다.
   - Framework preset: `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - 환경 변수(Production)는 두 개를 넣습니다.
     - `VITE_KAKAO_JS_KEY` = 카카오 JavaScript 키
     - `NODE_VERSION` = `22`
3. **카카오 도메인 등록**: 카카오 개발자센터 → 앱 → 플랫폼 → Web에 배포 주소를 등록합니다.
   - 기본 주소: `https://<프로젝트>.pages.dev`
   - 도메인을 구매하면 그 주소도 추가합니다.
4. **첫 수집**: GitHub → Actions → "공고 수집" → Run workflow를 누릅니다. 이후에는 매일 자동으로 실행됩니다.

## 판정 기준 버전 관리
`src/config/criteria.ts`의 `CRITERIA_VERSIONS`에 기준이 바뀔 때마다 새 버전을 **추가**합니다. 각 공고는 모집공고일에 맞는 버전으로 판정합니다.

## 로컬 개발
```bash
npm install
node scripts/make-sample.mjs
npm run dev
```
- `node scripts/make-sample.mjs`는 키가 없을 때 쓰는 샘플 데이터를 만듭니다.
- 프록시 환경에서 수집할 때는 `NODE_USE_ENV_PROXY=1`을 지정하세요.
- 실제 데이터로 개발하려면 `DATA_GO_KR_KEY=... npm run fetch:data`를 실행하세요.
- 테스트는 `npm test`로 실행합니다. 자격판정 규칙을 검사합니다.
