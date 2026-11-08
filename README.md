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
  ├─ 청약홈 API (api.odcloud.kr) ─┐
  ├─ LH 공고 API (apis.data.go.kr) ┼─▶ scripts/fetch-notices.mjs ─▶ 정규화 + 카카오 지오코딩(캐시)
  └─────────────────────────────────┘                                   │
                                                          public/data/notices.json
                                                                        │
                                              Vite 빌드 ─▶ GitHub Pages (정적 사이트)
                                                                        │
                                브라우저: 카카오맵 · 자격판정 · 체크리스트 · .ics (모두 클라이언트)
```

## 설정 (최초 1회)
1. **공공데이터포털 키:** [공공데이터포털](https://www.data.go.kr)에서 아래 두 API를 활용신청하고 인증키를 받습니다. 둘 다 자동승인입니다.
   - 한국부동산원_청약홈 분양정보 조회 서비스 (15098547)
   - 한국토지주택공사_분양임대공고문 조회 서비스 (15058530)
2. **카카오 키:** [카카오 개발자센터](https://developers.kakao.com)에서 앱을 만들고 다음을 설정합니다.
   - JavaScript 키를 발급받고, 플랫폼 → Web에 `https://taezzixo.github.io`를 등록합니다.
   - REST API 키를 발급받습니다. 주소를 좌표로 바꾸는 데 씁니다.
3. **GitHub Secrets 등록:** GitHub 저장소 → Settings → Secrets and variables → Actions에 다음 이름으로 등록합니다.
   - `DATA_GO_KR_KEY`
   - `KAKAO_REST_KEY`
   - `KAKAO_JS_KEY`
4. **Pages 켜기:** GitHub 저장소 → Settings → Pages → Source를 **GitHub Actions**로 바꿉니다.
5. **실행:** Actions → "공고 수집 및 배포" → Run workflow를 누릅니다. 배포되면 https://taezzixo.github.io/dash_housing/ 에서 볼 수 있습니다.

## 로컬 개발
```bash
npm install
node scripts/make-sample.mjs
npm run dev
```
- `node scripts/make-sample.mjs`는 키가 없을 때 쓰는 샘플 데이터를 만듭니다.
- 실제 데이터로 개발하려면 `DATA_GO_KR_KEY=... npm run fetch:data`를 실행하세요.
- 테스트는 `npm test`로 실행합니다. 자격판정 규칙을 검사합니다.

## 판정 기준 업데이트
소득·자산 기준값은 `src/config/criteria.ts`에 모여 있습니다. 매년 도시근로자 월평균소득이 발표되면 이 파일만 고치면 됩니다. 판정 결과는 참고용 안내이며, 최종 자격은 공고문에서 확인해야 합니다.
