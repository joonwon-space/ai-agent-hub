# My Space — Phase 1.5 작업 분해 (Recipe)

소스 PRD: [docs/prd/my-space.md](../prd/my-space.md) §10 Phase 1.5
선행 페이즈: [my-space-phase-1.md](./my-space-phase-1.md) (Diary, 머지 완료 가정)

본 문서는 `team-implement` 오케스트레이터가 3개 워커를 git worktree 로 병렬 구동할 때 각 워커의 책임/파일 경계를 명시한다. **다른 워커가 같은 파일을 만지지 못하도록 분리**되어 있다.

---

## 공통 전제

- Phase 1 (`team-implement/20260503-2148`) 이 main 에 머지되어 있다는 가정
- 디자인 핸드오프(화면 04 카드 그리드, 화면 05 폼) 검증 완료 가정
- 응답 envelope: 성공 raw object, 실패 `{ error, details? }` (Phase 1 과 통일)
- 인증: 모든 `/api/my-space/*` 는 `requireAuth` (Phase 1 의 라우터 수준 적용 그대로)
- 토큰: `--color-recipe-*` 는 Phase 1 에서 이미 정의됨 — 재정의 금지
- 동적 콘텐츠: `textContent` / `createElement` 만 사용, `innerHTML` 금지

---

## Worker A — Recipe Backend

**Branch suffix**: `recipe-be`
**소유 파일**:
- `backend/src/routes/mySpace.js` (확장)
- `backend/src/services/mySpaceValidation.js` (확장)
- `backend/__tests__/mySpace.recipes.test.js` (신규)

### 작업 항목

1. Recipe CRUD (PRD §5.3 그대로):
   - `GET /api/my-space/:spaceId/recipes?category=` — 카테고리 필터, 정렬 `updatedAt desc`
   - `POST /api/my-space/:spaceId/recipes` — body: `{ name, category, cookTimeMin?, difficulty, servings?, description?, ingredients, steps, coverImage? }`
   - `GET /api/my-space/:spaceId/recipes/:id`
   - `PATCH /api/my-space/:spaceId/recipes/:id` (자동저장에서 호출)
   - `DELETE /api/my-space/:spaceId/recipes/:id`
2. 소유자 검증: 기존 `loadOwnedSpace(spaceId, userId)` 재사용. recipe `:id` 진입 시 `space.userId` 까지 거슬러 검증, 미일치 → 404.
3. 검증 헬퍼 추가 (`mySpaceValidation.js`):
   - `assertCategory(v)` — 1~24자
   - `assertDifficulty(v)` — `'easy' | 'medium' | 'hard'`
   - `assertCookTime(v?)` — null 허용, int 0~6000
   - `assertServings(v?)` — null 허용, int 1~99
   - `assertIngredients(arr)` — 배열, 최대 50, 각 원소 `{ name: 1~80자, amount: 0~40자 }`
   - `assertSteps(arr)` — 배열, 최대 50, 각 원소 `{ order: int>=1, text: 1~1000자 }`
4. 모든 핸들러 `try/catch` + `next(err)` (CLAUDE.md 컨벤션)

### 통합 테스트 (≥ 7개)

- 생성 happy path → 200 + recipe 객체
- 목록 happy path (2건 생성 → 2건 반환)
- 카테고리 필터 (한식 1건/디저트 1건 → `?category=한식` 으로 1건만)
- 수정 happy path
- 삭제 happy path
- 다른 유저 recipe 접근 → 404
- 검증 실패 3건: `difficulty: 'extreme'`, `ingredients` 51개, `steps` text 1001자

### Verify
- `npm --prefix backend test` 모두 통과 (Phase 1 24개 + 새 7개 = 31개 이상)

---

## Worker B — Recipe Frontend

**Branch suffix**: `recipe-fe`
**소유 파일** (이 워커만 수정):
- `frontend/pages/my-space-recipes.html` (신규)
- `frontend/pages/my-space-recipe-edit.html` (신규)
- `frontend/src/js/pages/my-space-recipes.js` (신규)
- `frontend/src/js/pages/my-space-recipe-edit.js` (신규)
- `frontend/src/js/my-space/recipes.js` (신규 — API wrapper + 카드 렌더 + 재료/단계 폼 헬퍼)
- `frontend/src/css/my-space-recipe.css` (신규)

### 의존성
- Worker A 의 API 계약(PRD §5.3)에만 의존 → 동시 진행 가능
- Phase 1 의 `autosave.js`, `components.js`, `api.js` 재사용 — **수정 금지** (읽기만)

### 작업 항목

1. **화면 04** (`my-space-recipes.html` + `.js`):
   - URL: `/my-space/recipes?spaceId=<id>`
   - 진입 시 `recipes.list(spaceId)` 호출
   - 상단 카테고리 탭: `전체 / 한식 / 양식 / 디저트 / 기타` — 클릭 시 `?category=` 쿼리 + 재요청 (URL state 동기화)
   - 카드 그리드: 이름 / 카테고리 배지 / 난이도 / 시간 / 인분 표시
   - "+ 새 레시피" 버튼 → `/my-space/recipes/new?spaceId=<id>`
   - 빈 상태: 일러스트 + "첫 레시피를 추가하세요" 메시지

2. **화면 05** (`my-space-recipe-edit.html` + `.js`):
   - URL 패턴:
     - 신규: `/my-space/recipes/new?spaceId=<id>` → 첫 저장 시 POST, 이후 PATCH
     - 편집: `/my-space/recipes/:id?spaceId=<id>` → 진입 시 GET, 변경 시 PATCH
   - `:id` 는 `location.pathname.match(/\/my-space\/recipes\/(\d+)/)`
   - 폼 필드:
     - 이름 (input, 1~120자)
     - 카테고리 (select, 4종)
     - 난이도 (3-button toggle: easy/medium/hard)
     - 조리시간 (input number, 분 단위, optional)
     - 인분 (input number 1~99, optional)
     - 설명 (textarea)
   - **재료 리스트** (`recipes.js` 에 헬퍼):
     - 행마다 name input + amount input + 삭제 버튼
     - "+ 재료 추가" 버튼 (행 추가, 최대 50)
     - 빈 행 자동 정리 (저장 시점)
   - **단계 리스트**:
     - 행마다 자동 번호 + textarea + 삭제 버튼
     - "+ 단계 추가" (최대 50)
     - 행 삭제 시 번호 재계산
   - 자동저장: Phase 1 의 `autosave.js` 재사용. `body` 가 아닌 모든 필드 변경 시 트리거. debounce 500ms.
   - 인디케이터: 우상단 idle/saving/saved/error

3. **CSS** (`my-space-recipe.css`):
   - `--color-recipe-*` 토큰 사용 (Phase 1 의 `my-space-tokens.css` 가 제공)
   - 카드: border-radius/padding/hover 효과 — Phase 1 의 `my-space.css` 와 시각 일관성
   - 카테고리 배지: pill 모양, accent bg
   - 난이도 토글: 3-segment

4. **`recipes.js`** — 모듈:
   - API: `recipes.list(spaceId, opts)`, `recipes.create(spaceId, payload)`, `recipes.get(spaceId, id)`, `recipes.update(spaceId, id, patch)`, `recipes.remove(spaceId, id)`
   - 모두 Phase 1 의 `authFetch` 재사용 (api.js 의 패턴 그대로 새 파일에 복제 X — `import { authFetch }` 패턴 점검 후 채택)
   - 카드 렌더: `renderRecipeCard(recipe, onClick)` — `createElement` 트리
   - 재료/단계 행 헬퍼: `renderIngredientRow(idx, value, onChange, onRemove)`, `renderStepRow(idx, value, onChange, onRemove)`

### Verify
- 콘솔 에러 0
- innerHTML 사용 0 (`grep -n "innerHTML" frontend/src/js/my-space/recipes.js frontend/src/js/pages/my-space-recipe*.js` → 빈 결과)

---

## Worker C — Glue & QA

**Branch suffix**: `recipe-glue`
**소유 파일**:
- `frontend/nginx.conf` (확장)
- `frontend/src/js/pages/my-space.js` (대시보드 template-aware 분기)
- `qa/my-space.spec.js` (신규 — Phase 1 happy path 보강분)
- `qa/my-space-recipes.spec.js` (신규)

### 의존성
- Worker A, B 의 머지 후 마지막에 통합 — 단, nginx/대시보드는 페이지 파일명만 알면 되므로 작업 자체는 동시 진행 가능

### 작업 항목

1. **nginx 라우팅** 추가 (`nginx.conf`):
   ```
   location = /my-space/recipes        { try_files /pages/my-space-recipes.html =404; }
   location = /my-space/recipes/new    { try_files /pages/my-space-recipe-edit.html =404; }
   location ~ ^/my-space/recipes/\d+$  { try_files /pages/my-space-recipe-edit.html =404; }
   ```

2. **대시보드 분기** (`my-space.js`):
   - 현재 space 의 `template` 에 따라 inner main 영역 다르게 fetch + 카드 렌더:
     - `diary` → 기존 동작 유지 (`diary.list`)
     - `recipe` → `recipes.list` (모듈 import 추가) + 카드 그리드
     - `freeform` → "Phase 2 에서 지원 예정" placeholder (Sprint 2 에서 교체)
   - "+ 새로 작성" 링크도 분기:
     - diary → `/my-space/diary/new?spaceId=`
     - recipe → `/my-space/recipes/new?spaceId=`

3. **Playwright happy path** (`qa/my-space-recipes.spec.js`):
   - 로그인 → 사이드바 My Space → 레시피 템플릿 카드 클릭 → space 이름 "내 레시피" 입력 → 생성
   - 대시보드 → "+ 새 레시피" 클릭 → 화면 05
   - 이름/카테고리/난이도 입력 → 재료 2개/단계 2개 추가 → body 입력
   - 700ms 대기 → 인디케이터 "저장됨 ✓" 확인
   - `/my-space/recipes` 복귀 → 방금 만든 레시피 카드 노출 확인
   - 콘솔 에러 0 검증 (`page.on('console')`, `page.on('pageerror')`)

4. **Phase 1 happy path** (`qa/my-space.spec.js`):
   - 이전 페이즈에서 보류된 일기 happy path 작성: 로그인 → 일기장 템플릿 → space 생성 → 신규 일기 → 자동저장 → 목록
   - 사이드바의 기존 jira 에이전트 링크 회귀 (클릭 → 패널 노출)

### Verify
- `npx playwright test qa/` 전부 통과
- `nginx -t` (Dockerfile 빌드 시) 통과

---

## 머지 / Synthesis 순서

`team-implement` 의 `implement-synthesizer` 가 다음 순서로 처리:

1. **Worker A → main** (백엔드 단독, 충돌 없음)
2. **Worker B → main** (Worker A 의 API 위에서 동작 검증)
3. **Worker C → main** (Worker B 의 페이지 파일명에 의존하는 nginx + 대시보드)
4. 전체 빌드: `docker compose down -v`, `docker compose build`, `docker compose up -d`, healthcheck 폴링
5. 백엔드 테스트: `npm --prefix backend test`
6. Playwright 전체 회귀: `npx playwright test qa/`

머지 중 충돌 발생 시 synthesizer 가 해당 워커에게 rebase 지시 + 재실행.

---

## Done 정의 (Phase 1.5)

- [ ] Recipe 5개 엔드포인트 인증 + 소유자 검증 통과
- [ ] 카테고리 필터 (5탭) 동작
- [ ] 화면 05 재료/단계 동적 추가/삭제, 자동저장 (debounce 500ms + 3회 백오프)
- [ ] 대시보드가 recipe space 진입 시 레시피 카드 그리드로 전환
- [ ] Playwright recipe happy path 통과 + Phase 1 diary happy path 통과
- [ ] `docs/architecture/api-reference.md` 에 `/api/my-space/:spaceId/recipes` 섹션 추가
- [ ] `docs/prd/my-space.md` §10 Phasing — Phase 1.5 ✓ 표기

---

## 미루는 항목 (Phase 1.5 스코프 외)

- 재료 체크박스 클라이언트 상태 (PRD §10 Phase 1.5 후순위) → Phase 3 백로그
- 카테고리 enum 사용자 정의 → Phase 3 백로그
- 레시피 커버 이미지 업로드 → [phase-3-extras.md](./my-space-phase-3-extras.md)
