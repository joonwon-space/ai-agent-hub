# My Space — Phase 3.2 작업 분해 (통합 검색)

_작성일: 2026-05-06_
_연관 결정사항: [docs/decisions/my-space-phase-3-decisions.md](../decisions/my-space-phase-3-decisions.md) §3.2 (2.1~2.2)_

## 결정사항 (확정값)

- **2.1 검색 방식**: A — PostgreSQL `ILIKE '%q%'` (콘텐츠 1000건 이상 누적 시 B `tsvector` 로 마이그레이션 — 본 페이즈는 A 만 구현)
- **2.2 검색 UI 위치**: B — `/my-space` 페이지 상단 (다른 페이지 확장은 후속)

## 현재 상태 (main `a9484ba`)

- 4개 데이터 모델 — `Space`, `DiaryEntry`, `Recipe`, `FreeformNote`. 모두 `space.userId` 로 사용자 격리.
- 검색 라우트 / UI 없음. 사용자가 콘텐츠 찾으려면 카드 그리드 스크롤 또는 `Ctrl+F` 브라우저 검색.
- Phase 3.4 가 axe-core 통합 + ≤768px 반응형 + 다크/라이트 토글 a11y 마감.

## 목표

- 사용자가 `/my-space` 진입 시 상단에서 자유 텍스트로 검색 → diary / recipe / note 그룹별 결과
- 검색 대상 필드:
  - **DiaryEntry**: `title`, `body`
  - **Recipe**: `name`, `description` (ingredients / steps 의 JSON 텍스트는 본 페이즈 제외 — 후속 확장)
  - **FreeformNote**: `title`, `body`
- 권한: 모든 결과는 `space.userId === req.user.id` 필수 — 다른 사용자 콘텐츠 누출 0
- 결과 클릭 → 해당 편집 화면 navigation
- Snippet: 검색어 주변 텍스트 ~80자 (양옆 트림 + ellipsis)

## 비목표 (본 페이즈 외)

- ingredients / steps JSON 풀텍스트 검색 (Recipe 내부)
- 카테고리 / 날짜 / mood 필터 + 검색 조합
- 페이지네이션 (limit 만 지원 — 기본 10건/그룹, 최대 50)
- 한국어 형태소 분석 (tsvector 도입 시점에 검토)
- 검색 히스토리 / autocomplete

---

## Worker A — Backend search route + tests (branch: `search-be`)

**소유 파일**:
- `backend/src/routes/mySpaceSearch.js` (NEW — 별도 파일)
- `backend/src/services/searchSnippet.js` (NEW — snippet 헬퍼)
- `backend/src/createApp.js` (라우트 등록 1줄)
- `backend/__tests__/mySpaceSearch.test.js` (NEW)

### 작업

1. **검색 라우트** (`mySpaceSearch.js`):
   - `GET /api/my-space/search?q=<query>&limit=<10>` — `requireAuth`
   - 검증: `q` 길이 1~100. `limit` 정수 1~50, 기본 10. 위반 시 400 + `details`.
   - 사용자 owned space 들의 id 목록 먼저 조회 (또는 `space.userId` join 으로 한방 처리)
   - 3 쿼리 병렬 (`Promise.all`):
     ```js
     prisma.diaryEntry.findMany({
       where: {
         space: { userId: req.user.id },
         OR: [
           { title: { contains: q, mode: 'insensitive' } },
           { body:  { contains: q, mode: 'insensitive' } },
         ],
       },
       orderBy: { updatedAt: 'desc' },
       take: limit,
       include: { space: { select: { id: true, name: true } } },
     })
     ```
     Recipe / FreeformNote 도 동일 패턴
   - Recipe 검색 필드: `name`, `description`. (NOT `ingredients` / `steps`)
   - 응답 envelope:
     ```json
     {
       "query": "찌개",
       "total": 5,
       "groups": {
         "diary": [{ "id": 1, "spaceId": 2, "spaceName": "내 일기", "title": "...", "snippet": "...", "updatedAt": "..." }],
         "recipe": [{ "id": 3, "spaceId": 4, "spaceName": "쿠킹", "name": "...", "snippet": "...", "updatedAt": "..." }],
         "note": []
       }
     }
     ```
   - `total` = 3 그룹 길이 합
   - 검색 결과에 본문 전체 포함 X — `snippet` 만 (서버 사이드 트림)

2. **`searchSnippet.js`** 헬퍼:
   - `extractSnippet(text, query, contextChars = 40)`:
     - 대소문자 무시로 첫 매치 위치 찾음 (`text.toLowerCase().indexOf(query.toLowerCase())`)
     - 매치 없으면 → 앞 `2*contextChars` 자만 ellipsis 와 함께
     - 매치 있으면 → `[max(0, pos-contextChars) ~ pos+query.length+contextChars]` 추출, 양 끝 ellipsis
     - 결과 길이 cap (예: 200자)
   - HTML escape 는 프론트에서 — 서버는 plain text 만 반환

3. **`createApp.js`** 등록:
   - `app.use('/api/my-space', requireAuth, mySpaceSearchRouter)` 또는 mySpaceRouter 안에 mount

4. **통합 테스트** (`mySpaceSearch.test.js`, ≥6):
   - 사용자 A: diary "맛있는 김치찌개" + recipe "김치찌개" + note "오늘 저녁 김치찌개" 생성
   - `?q=김치찌개` → 그룹별 1/1/1 = 총 3건
   - `?q=KIMCHI` (대소문자 무시 검증 — but 한글 mode insensitive 는 별 의미 없음, 대신 영문 케이스로): "Pasta" body 의 diary, "pasta" name 의 recipe, "PASTA" title 의 note → 3/3/3 = 9
   - `?q=` (빈 쿼리) → 400
   - `?q=A`.repeat(101) → 400
   - **소유자 격리**: 사용자 B 가 동일 키워드로 검색 → A 의 콘텐츠 노출 X (groups 모두 빈 배열)
   - `?limit=2` → 그룹별 최대 2건
   - snippet 추출 검증: 본문에 키워드 양옆 ellipsis 있는지 (`/^…|…$/` 매칭)

### Verify
- `npm --prefix backend test` 통과 (55 + 6+ = 61+)
- `grep -n "userId.*req.user.id" backend/src/routes/mySpaceSearch.js` 또는 동등한 owner check 존재

### 커밋 (per-unit, 2개)
- `feat(backend): add unified search route across diary/recipe/note with owner isolation`
- `test(backend): add Phase 3.2 search integration tests (cross-user, limit, snippet, validation)`

---

## Worker B — Frontend search UI (branch: `search-fe`)

**소유 파일**:
- `frontend/src/js/my-space/search.js` (NEW — API wrapper + 결과 렌더)
- `frontend/src/js/pages/my-space.js` (확장 — 상단 검색바 + 결과 영역)
- `frontend/src/css/my-space-search.css` (NEW)
- `frontend/pages/my-space.html` (link/script tags 추가만 — Worker C 가 만지지 않음)

### 작업

1. **검색바** (`my-space.js` `init()` 또는 `renderDashboard()` 의 main 영역 상단):
   - `<input type="search" id="ms-search-input" placeholder="검색…" maxlength="100">` (label 은 `aria-label="My Space 검색"`)
   - 검색 결과 표시 영역 `<div id="ms-search-results">`
   - 검색어 비어있으면 결과 영역 hide, 기존 onboarding/dashboard 노출
   - 검색어 입력 시 결과 영역 노출, 기존 dashboard 는 hide (또는 결과 위에 dim 처리)
   - 디바운스 300ms `input` 이벤트 → `search.query(q)` 호출

2. **`search.js`** 모듈:
   - `search.query(q, limit)` — `authFetch(/api/my-space/search?q=...&limit=10)` 호출
   - `renderSearchResults(container, response)`:
     - `total === 0` 이면 "검색 결과 없음" 표시
     - 그룹별 섹션 (diary / recipe / note) — 카운트 0 인 그룹은 hide
     - 각 결과 카드:
       - 타입 배지 (diary `--color-diary`, recipe `--color-recipe`, note `--color-freeform`)
       - 제목/이름 (highlight: 검색어 부분 `<mark>` 으로 감싸 — 단 `textContent` 만 쓰면서 만들려면 createElement(`mark`) 로 split)
       - snippet (역시 highlight)
       - 작성 space 이름 + 작성일 (relative time 또는 ISO short)
       - 클릭 → 해당 편집 화면으로 navigate:
         - diary → `/my-space/diary/${id}?spaceId=${spaceId}`
         - recipe → `/my-space/recipes/${id}?spaceId=${spaceId}`
         - note → `/my-space/notes/${id}?spaceId=${spaceId}`
   - **innerHTML 0**, hightlight 도 `createElement('mark')` + `textContent` 로

3. **CSS** (`my-space-search.css`):
   - `.ms-search-bar` — 페이지 상단, 너비 100%, focus 시 accent border
   - `.ms-search-results` — 결과 영역
   - `.ms-search-group` — 그룹 컨테이너, 헤더 ("일기 (3)") + 카드 리스트
   - `.ms-search-card` — hover 시 elevation, 클릭 가능한 cursor
   - `.ms-search-badge` — 작은 pill, 그룹별 토큰 색
   - `.ms-search-mark` — `<mark>` highlight 색
   - 반응형: ≤768px 에서 검색바 padding 축소

4. **HTML**:
   - `<link rel="stylesheet" href="/src/css/my-space-search.css">` 추가
   - `<script src="/src/js/my-space/search.js"></script>` 추가 (my-space.js 보다 이전 로드)

### 의존성
- Worker A 의 API 계약 (`GET /api/my-space/search`) 에만 의존 → 동시 진행 가능
- 다른 my-space 모듈 (`api.js`, `components.js`, `recipes.js`, `notes.js` 등) 은 import 만 — 수정 X

### Verify
- 콘솔 에러 0
- `grep -nE "innerHTML\s*=" frontend/src/js/my-space/search.js frontend/src/js/pages/my-space.js` → 빈 결과
- ≤768px viewport 에서 검색바/결과 layout 정상

### 커밋 (per-unit, 2-3개)
- `feat(frontend): add search.js my-space module with API wrapper and result renderer`
- `feat(frontend): add search bar at /my-space top + result panel with type-badged grouping`
- `chore(frontend): wire search CSS link and script tag in my-space.html`

---

## Worker C — Playwright + 회귀 (branch: `search-qa`)

**소유 파일**:
- `qa/my-space-search.spec.js` (NEW)

### 작업

1. **Playwright** (`my-space-search.spec.js`, mirror existing helper pattern):
   - 로그인 → My Space → diary space + recipe space + freeform space 각각 1개씩 생성
   - 각 space 에 검색용 콘텐츠 삽입 (API 직접 호출 가능):
     - diary: `{ title: "스프린트 회고", body: "오늘 sprint 마무리" }`
     - recipe: `{ name: "스프링 채소 샐러드", category: "양식", ... }`
     - note: `{ title: "마크다운 메모", body: "**spring** 정리" }`
   - `/my-space` 진입 → 상단 검색바 노출 확인
   - 검색바에 "스프"" 입력 → 300ms 후 결과 노출
   - 그룹별 카운트 검증: diary 1 / recipe 1 / note 0 (note 본문은 "spring" 영문이라 매치 안 됨 의도)
   - 또 다른 검색어 "spring" → diary 1 / recipe 0 / note 1
   - 결과 카드 클릭 (recipe) → `/my-space/recipes/<id>` 로 이동 확인
   - 검색바 비우기 → 결과 영역 hide, 기존 dashboard 노출 확인
   - **소유자 격리 회귀**: 다른 사용자로 로그인 → 동일 검색어 → 결과 0
   - 콘솔 / pageerror 0

2. (선택) **a11y 회귀**: `auditA11y(page, '/my-space (search active)')` 한 번 호출 — 검색 결과 노출 상태에서 axe 검증

### 의존성
- Worker A, B 머지 후 마지막 검증

### 커밋 (per-unit, 1개)
- `test(e2e): add Phase 3.2 unified search Playwright spec (cross-user isolation, snippet, navigation)`

---

## 머지 / Synthesis 순서

1. Worker A → main (백엔드 + 테스트)
2. Worker B → main (프론트 — Worker A API 위에서 동작)
3. Worker C → main (Playwright — 머지 후 통합 검증)
4. `npm --prefix backend test` 통과 (61+)
5. `docker compose down && build frontend && up -d` (CSS/HTML/JS 변경 → frontend rebuild)
6. `cd qa && npx playwright test --workers=1` 회귀 (6 + search 신규)

---

## Done 정의 (Phase 3.2)

- [ ] `GET /api/my-space/search` 라우트 + owner 격리 + 검증
- [ ] snippet 헬퍼 (양옆 ellipsis, 키워드 주변 80자)
- [ ] 백엔드 통합 테스트 6+ 추가 (소유자 격리 + 검증 + 그룹별 limit)
- [ ] `/my-space` 페이지 상단 검색바 (디바운스 300ms)
- [ ] 그룹별 결과 (diary / recipe / note), 빈 그룹 hide
- [ ] 결과 클릭 → 해당 편집 화면 navigation
- [ ] innerHTML 0 (mark highlight 포함)
- [ ] Playwright happy path + 소유자 격리 회귀 통과
- [ ] ≤768px 반응형 ok (Phase 3.4 axe spec 회귀 통과)

---

## 미루는 항목 (Phase 3.2 외)

- Recipe ingredients / steps JSON 검색 (구조 파싱 필요 — 후속)
- 카테고리 / 날짜 / pinned 필터 조합
- 페이지네이션 (`?cursor=`)
- 한국어 형태소 분석 (`tsvector` + pg_trgm 또는 pgroonga 도입 시 별 페이즈)
- 검색 히스토리 / autocomplete
