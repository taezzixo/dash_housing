# 관리자 가이드

## 관리자페이지
- **주소:** `/admin.html` (검색엔진 노출 안 함)
- **보여주는 정보:** 수집 현황, 데이터 품질(위치 정확도), 변경 감지(일정 변경·정정·취소 의심), 수동 보정, 판정 기준 버전
- **공개 여부:** 이미 공개된 데이터만 읽기 전용으로 보여줍니다. 수정은 GitHub 로그인이 필요한 `public/data/overrides.json` 편집으로만 할 수 있습니다.
- **접근 제한:** 도메인을 연결한 뒤 Cloudflare Access에서 `/admin.html` 경로에 이메일 인증을 걸 수 있습니다(아래 참고).

## 수동 보정 — `public/data/overrides.json`
GitHub 앱이나 웹에서 파일을 열고 연필(✏️) 아이콘을 눌러 수정한 뒤 **Commit changes**를 누릅니다. 1~2분 뒤 사이트에 반영됩니다.

```json
{
  "hide": ["lh-2015122300021031"],
  "patch": {
    "lh-2015122300020975": { "lat": 37.1325, "lng": 128.1912, "geoPrecision": "address", "note": "제천 장락동 단지 위치" }
  },
  "manual": [
    {
      "id": "manual-20261110-sh1",
      "category": "LH",
      "subType": "SH 행복주택",
      "name": "2026년 4차 SH 행복주택 입주자 모집",
      "region": "서울",
      "address": "서울특별시 강서구 마곡동",
      "url": "https://www.i-sh.co.kr/...",
      "dates": { "announce": "2026-11-10", "receiptStart": "2026-11-20", "receiptEnd": "2026-11-22" }
    }
  ]
}
```
- **`hide`:** 숨길 공고 id 목록입니다. 공고 id는 관리자페이지 목록의 회색 코드입니다.
- **`patch`:** 공고별 수정값입니다. `lat`, `lng`, `geoPrecision`, `address`, `name`, `url`, `note`를 고칠 수 있습니다.
- **`manual`:** 직접 등록하는 공고입니다. 관리자페이지 「수동 보정」 탭의 양식으로 JSON을 만들어 복사해 붙여넣으면 됩니다.
- **좌표 찾기:** 카카오맵에서 위치를 길게 누르면 좌표가 나옵니다.
- **JSON 문법:** 쉼표와 따옴표를 틀리면 보정 전체가 적용되지 않습니다. 저장한 뒤 관리자페이지 숫자가 바뀌었는지 확인하세요.

## Cloudflare Access로 관리자페이지 잠그기 (도메인 연결 후)
1. Cloudflare 대시보드 → Zero Trust → Access → Applications → Add an application → **Self-hosted**를 고릅니다.
2. Application domain에 `(내 도메인)/admin.html`을 입력합니다.
3. Policy는 Action을 `Allow`로, Include를 `Emails`로 하고 관리자 이메일을 넣습니다.
4. 저장하면 `/admin.html`에 접속할 때 이메일로 받은 인증번호를 입력해야 합니다. 50명까지 무료입니다.
