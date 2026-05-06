# My Space — Phase 3.5 작업 분해 (레시피 read-only 뷰 + 재료·단계 체크)

_작성일: 2026-05-06_
_연관 결정사항: [docs/decisions/my-space-phase-3-decisions.md](../decisions/my-space-phase-3-decisions.md) §3.5 (5.1~5.2)_

## 결정사항 (확정값)

- **5.1 Read-only 상세 뷰**: B — `/recipes/:id/view` 별도 페이지 신설 (편집과 분리)
- **5.2 진행 상태 저장**: A — localStorage (디바이스 별, 서버 미저장)

## 현재 상태 (main `3e0af41`)

- 레시피 카드 클릭 → 편집 페이지 (`/my-space/recipes/:id?spaceId=`) 직행. read-only 뷰 없음.
- 요리 중 재료/단계를 체크하는 UI 없음. 사용자가 머리속/종이로 추적해야 함.
- 편집 화면은 자동저장이라 요리 중 실수 입력 → 데이터 변경 위험.

## 목표

- 사용자가 카드 클릭 시 **read-only 뷰** 로 이동 → 안전하게 요리 중 활용
- 재료 / 단계 옆에 체크박스 → 체크 상태가 localStorage 에 영속화 → 페이지 reload 후에도 유지
- 뷰 우상단 **편집 버튼** → 편집 페이지로 명시적 진입
- "초기화" 버튼 → localStorage 진행 상태 클리어 (다시 요리 시작용)
- localStorage 키 컨벤션: `recipe-progress-${spaceId}-${recipeId}` 값 `{ ingredients: { idx: bool, ... }, steps: { idx: bool, ... } }` (인덱스 기반 — v1 단순화, 재료/단계 추가/삭제 시 정합성 약간 깨질 수 있으나 허용)

## UX 변경 (확인 필요)

기존 "카드 클릭 → 편집" 흐름이 변경됨:
- **카드 클릭 → view** (요리 시 가장 흔한 동작에 최적화)
- View 페이지의 **편집 버튼** → edit 페이지
- Edit 페이지의 **보기 모드** 링크 → view 페이지

이게 결정 §5.1 의 의도와 일치 (요리 중 실수 편집 방지). 반대 의견 있으면 카드에 "보기" / "편집" 두 버튼 노출 옵션 가능 — 본 페이즈는 단일 클릭 단순화.

---

## Worker A — View 페이지 (HTML + JS + CSS) (branch: `recipe-view`)

**소유 파일**:
- `frontend/pages/my-space-recipe-view.html` (NEW)
- `frontend/src/js/pages/my-space-recipe-view.js` (NEW)
- `frontend/src/css/my-space-recipe-view.css` (NEW)

### 작업

1. **HTML 페이지** (`my-space-recipe-view.html`):
   - 기존 `my-space-recipe-edit.html` 구조 참고 — head 의 link 들 + theme.js, body 의 topbar + ms-main 컨테이너 + script tags
   - 추가 link: `<link rel="stylesheet" href="/src/css/my-space-recipe-view.css" />`
   - 추가 script: `<script src="/src/js/pages/my-space-recipe-view.js"></script>` (loaded after api.js + recipes.js)

2. **`my-space-recipe-view.js`**:
   - URL 패턴 파싱: `/my-space/recipes/:id/view?spaceId=...` → 파라미터 추출
   - `init()`:
     - auth 체크 (기존 패턴 — getMe → /login redirect)
     - `recipes.get(spaceId, recipeId)` 호출
     - 404 → "레시피를 찾을 수 없습니다" 메시지 + "← 목록" 버튼
     - 성공 → `renderView(recipe)`
   - `renderView(recipe)`:
     - **헤더 영역**: 좌측 "← 목록" 버튼 (`/my-space/recipes?spaceId=`), 가운데 레시피 이름 (h1), 우측 "편집" 버튼 (`/my-space/recipes/${recipeId}?spaceId=`)
     - **메타 row**: 카테고리 배지, 난이도 토큰, 조리시간, 인분
     - **커버 이미지**: `recipe.coverImage` 있으면 `<img>`, 없으면 placeholder (이모지 🍳)
     - **설명 영역**: `recipe.description` 있으면 표시, 없으면 hide
     - **재료 섹션**: 헤더 "재료" + 우측 progress 카운트 ("3 / 5"), 리스트
       - 각 항목: `<input type="checkbox">` + `recipe.ingredients[i].name` + `(${amount})`
       - 체크 변경 → localStorage update + progress 카운트 갱신
     - **단계 섹션**: 헤더 "조리 단계" + progress 카운트, 리스트
       - 각 항목: `<input type="checkbox">` + `${order}.` + `text` (textContent)
     - **하단 우측**: "체크 초기화" 버튼 (확인 후 localStorage 키 삭제 + UI 갱신)
   - localStorage helpers:
     - `loadProgress(spaceId, recipeId)`:
       ```js
       try { return JSON.parse(localStorage.getItem(`recipe-progress-${spaceId}-${recipeId}`)) || { ingredients: {}, steps: {} }; }
       catch { return { ingredients: {}, steps: {} }; }
       ```
     - `saveProgress(spaceId, recipeId, progress)`:
       `localStorage.setItem(key, JSON.stringify(progress))`
     - `resetProgress(spaceId, recipeId)`:
       `localStorage.removeItem(key)` + 모든 체크박스 unchecked 재설정
   - **innerHTML 0** — 모든 동적 DOM 은 createElement / textContent
   - 이미지 `<img>` 도 createElement로

3. **CSS** (`my-space-recipe-view.css`):
   - `.ms-recipe-view` — main wrapper
   - `.ms-recipe-view__header` — flex row (back + title + edit), padding
   - `.ms-recipe-view__title` — h1, larger
   - `.ms-recipe-view__meta` — flex wrap, badges
   - `.ms-recipe-view__cover` — 16:9 aspect, max-width responsive
   - `.ms-recipe-view__cover-placeholder` — emoji centered
   - `.ms-recipe-view__section` — section block, margin-bottom
   - `.ms-recipe-view__section-header` — flex (title + progress), bold
   - `.ms-recipe-view__progress` — small badge "3 / 5"
   - `.ms-recipe-view__check-row` — flex row, checkbox + text, hover bg
   - `.ms-recipe-view__check-row--done` — text strikethrough, opacity 0.6
   - `.ms-recipe-view__reset-btn` — danger 색조 (--color-error or 빨강)
   - 반응형 ≤768px: header stacked, reduce padding
   - 다크/라이트 양쪽 토큰 사용

### Verify
- `grep -nE "innerHTML\s*=|outerHTML\s*=" frontend/src/js/pages/my-space-recipe-view.js` → 빈 결과
- 페이지 reload 후 체크 상태 유지 (localStorage)

### 커밋 (per-unit, 2개)
- `feat(frontend): add recipe read-only view page with cover, meta, ingredient/step checklist`
- `feat(frontend): add localStorage-backed progress tracking with reset for recipe view`

---

## Worker B — 진입점 변경 (카드 + edit 헤더) (branch: `recipe-view-glue`)

**소유 파일**:
- `frontend/src/js/my-space/recipes.js`
- `frontend/src/js/pages/my-space-recipe-edit.js`
- `frontend/src/js/pages/my-space-recipes.js`
- `frontend/src/js/pages/my-space.js`
- `frontend/src/css/my-space-recipe.css`

### 작업

1. **`recipes.js`** `renderRecipeCard()`:
   - 카드 클릭 핸들러를 `/my-space/recipes/:id/view?spaceId=` 로 변경 (기존 `:id?spaceId=` 편집 경로에서)
   - 검색 결과 카드 (`search.js`) 도 view 로 가도록 — 단 search.js 는 본 페이즈 owner 가 아니므로 NOT 변경. 후속 페이즈에서 또는 추후. 또는 plan 이 잘못 owner 분배됐으면 search.js 도 Worker B 에 추가.
   - 단순화: search.js 의 navigate 는 plan 외 — 본 페이즈는 카드 그리드 (recipes.js, my-space.js dashboard) 만 변경. search 결과는 일단 편집 페이지 직행 유지 후 후속 페이즈에서 view 로 통일.

2. **`my-space-recipes.js`** (목록 페이지):
   - `recipes.list()` 결과 클릭 → view 로 이동 (card click 핸들러 변경)

3. **`my-space.js`** dashboard 의 recipe pane:
   - top-3 recipe 카드들 클릭 → view 로 이동

4. **`my-space-recipe-edit.js`** 편집 페이지 헤더:
   - 우상단 영역에 "보기 모드" 링크 추가 → `/my-space/recipes/${recipeId}/view?spaceId=`
   - recipeId 가 새 레시피라 미존재 시 (URL 이 /new) 링크 hide 또는 disabled
   - 저장 indicator 옆에 배치, 디자인 일관성 유지

5. **`my-space-recipe.css`**:
   - 필요 시 "보기 모드" 링크 스타일 (small button or text-link)
   - 카드 cursor 등은 그대로 — view 갈 때도 클릭 의도 동일

### 의존성
- Worker A 가 만드는 `/my-space/recipes/:id/view` 경로에 navigation. Worker A 의 페이지가 머지 후 동작 검증.
- 단 작업 자체는 동시 진행 가능 (Worker A 의 file paths 만 알면 됨).

### Verify
- 모든 카드 클릭 → view URL 패턴
- 편집 페이지 헤더에 "보기 모드" 링크 노출 (existing recipe만)
- 콘솔 에러 0

### 커밋 (per-unit, 2개)
- `feat(frontend): route recipe card clicks to read-only view page`
- `feat(frontend): add view mode link in recipe edit header`

---

## Worker C — Infra + QA (branch: `recipe-view-qa`)

**소유 파일**:
- `frontend/nginx.conf`
- `qa/my-space-recipe-view.spec.js` (NEW)

### 작업

1. **nginx**:
   - 추가 location block: `/my-space/recipes/:id/view` → `pages/my-space-recipe-view.html`
   - 정규식: `location ~ ^/my-space/recipes/\d+/view$ { try_files /pages/my-space-recipe-view.html =404; }`
   - 기존 `^/my-space/recipes/\d+$` 보다 더 specific 한 패턴이므로 **기존 패턴 위에** 배치 (nginx regex 매칭은 첫 매치 기준이지만 location 우선순위 규칙 점검)

2. **Playwright** (`my-space-recipe-view.spec.js`):
   - 로그인 → recipe space 생성 → 새 레시피 작성 (재료 3개, 단계 3개)
   - 저장 후 목록 (`/my-space/recipes`) → 카드 클릭
   - **클릭 후 URL이 `/my-space/recipes/:id/view`** 인지 확인 (편집 X)
   - 페이지에 레시피 이름 + 재료 3개 + 단계 3개 노출
   - 재료 1번 + 2번 체크 → progress count "2 / 3" 노출
   - 페이지 reload → 체크 상태 유지 (localStorage)
   - 단계 모두 체크 → "3 / 3" + strikethrough 적용
   - "체크 초기화" 클릭 → 모든 체크 해제 + progress "0 / 3"
   - "편집" 버튼 클릭 → URL `/my-space/recipes/:id?spaceId=`
   - "← 목록" 버튼 → URL `/my-space/recipes`
   - 콘솔/pageerror 0

### 의존성
- Worker A, B 머지 후 마지막 검증

### 커밋 (per-unit, 2개)
- `chore(infra): add nginx route for /my-space/recipes/:id/view`
- `test(e2e): add Phase 3.5 recipe view + checklist Playwright spec`

---

## 머지 / Synthesis 순서

1. Worker A → main (view 페이지 — 단독)
2. Worker C → main (nginx — Worker A 페이지 path 의존)
3. Worker B → main (진입점 변경 — Worker A view 페이지 도달성 의존)
4. `npm --prefix backend test` 통과 (변경 없으니 62 그대로)
5. `docker compose down && build frontend && up -d`
6. `cd qa && npx playwright test --workers=1` (7 spec + 신규)

---

## Done 정의 (Phase 3.5)

- [x] `/my-space/recipes/:id/view` 페이지 노출
- [x] 재료 / 단계 체크박스 + localStorage 영속화 (페이지 reload 후 유지)
- [x] progress count (`X / N`) 표시
- [x] 체크된 항목 strikethrough + 흐림 처리
- [x] "체크 초기화" 버튼 동작
- [x] "편집" 버튼 → edit 페이지
- [x] "← 목록" 버튼 → 목록
- [x] 카드 클릭 시 view 로 이동 (모든 진입점: 그리드, dashboard top-3)
- [x] 편집 페이지 헤더에 "보기 모드" 링크
- [x] innerHTML 0
- [x] Playwright happy path + reload 영속성 + 초기화 + 진입점 회귀 통과

---

## 미루는 항목 (Phase 3.5 외)

- 진행 상태 서버 저장 (Phase 3.5b 가능성) — 디바이스 동기화 필요 시
- 인덱스 기반 → ingredient/step id 기반 정합성 보장 (재료 추가/삭제 후에도 진행 상태 유지)
- 검색 결과 카드도 view 로 라우팅 (search.js — 본 페이즈 owner 외)
- 음성 안내 / 타이머 / 단위 변환 등 요리 보조 기능
