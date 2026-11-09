# 계정 저장 기능 설정 (Supabase + 카카오·구글 로그인)

환경변수가 없으면 이 기능은 **꺼져 있고**, 사이트는 기존처럼 브라우저 저장만 씁니다.
켜는 순서는 아래와 같습니다. 모두 무료 범위입니다.

## 1. Supabase 프로젝트 만들기
1. [supabase.com](https://supabase.com)에 가입하고 New project를 누릅니다.
   - Region: **Northeast Asia (Seoul)**
   - Database password: 임의로 정하고 따로 보관합니다.
2. 왼쪽 메뉴 **SQL Editor**에서 이 저장소의 `supabase/schema.sql` 내용을 붙여넣고 Run을 누릅니다.
3. **Project Settings → API**에서 두 값을 확인합니다.
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` 키 → `VITE_SUPABASE_ANON_KEY`
   - 이 키는 공개용입니다. 데이터는 행 단위 보안(RLS)으로 보호됩니다.

## 2. 카카오 로그인 (고유번호만, 이메일 없음)
1. 카카오 개발자센터 → 앱(1577754) → **카카오 로그인**을 활성화합니다.
2. **Redirect URI**에 `https://<프로젝트ID>.supabase.co/auth/v1/callback`을 추가합니다.
3. **동의항목**: 닉네임·프로필 사진은 "선택 동의"로 두고, 이메일은 설정하지 않습니다.
4. 보안 → **Client Secret**을 생성하고 활성화합니다.
5. Supabase → Authentication → Providers → **Kakao**를 켜고 다음을 설정합니다.
   - Client ID: 카카오 **REST API 키**
   - Client Secret: 4번에서 만든 값
   - **"Allow users without an email"을 켭니다.** 이메일 없이 로그인하기 위한 설정입니다.

## 3. Google 로그인 (선택)
1. Google Cloud Console → OAuth 클라이언트 ID(웹)를 만듭니다.
   - 승인된 리디렉션 URI: `https://<프로젝트ID>.supabase.co/auth/v1/callback`
2. Supabase → Providers → **Google**에 Client ID와 Secret을 입력합니다.

## 4. 사이트 주소 등록
Supabase → Authentication → URL Configuration에 다음을 입력합니다.
- Site URL: `https://dash-housing.kth95280.workers.dev`
- Redirect URLs: 같은 주소 + 나중에 연결할 도메인

## 5. 빌드 변수 넣고 배포
1. Cloudflare → dash-housing → 설정 → 빌드 → 변수 및 비밀에 다음을 추가합니다.
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. 배포 탭 → **빌드 다시 시도**를 누릅니다. 화면 오른쪽 위에 "💾 내 정보 저장" 버튼이 나타납니다.

## 6. (권장) 1년 미접속 자동 삭제
Supabase → Database → Extensions에서 `pg_cron`을 켭니다. 그다음 `schema.sql` 맨 아래 주석의 `cron.schedule` 문을 실행합니다.

## 운영 메모
- 무료 플랜은 **7일 동안 요청이 없으면 일시정지**됩니다. 이용자가 있으면 문제가 없고, 일시정지되면 대시보드에서 Restore를 누릅니다.
- 관리자페이지 「회원」 탭은 집계만 보여줍니다(가입자 수, 최근 접속, 많이 저장된 공고).
