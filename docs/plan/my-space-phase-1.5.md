# My Space — Phase 1.5 작업 분해 (Recipe 풀 패스)

본 문서는 `team-implement` 오케스트레이터가 3개 워커를 git worktree로 병렬 구동할 때
각 워커의 책임/파일 경계를 명시한다.

Base branch: `team-implement/20260503-2148`

---

## Worker A — Recipe Backend (`recipe-be` branch)

**소유 파일** (이 워커만 수정):
- `backend/src/routes/mySpace.js` (extend with recipe CRUD)
- `backend/src/services/mySpaceValidation.js` (extend with recipe validators)
- `backend/__tests__/mySpace.recipes.test.js` (new file)

### 작업 항목

1. **Recipe CRUD** routes under `/api/my-space/:spaceId/recipes`:
   - `GET ?category=` — list (optionally filter by category)
   - `POST` — create recipe
   - `GET /:id` — single recipe
   - `PATCH /:id` — update recipe
   - `DELETE /:id` — delete recipe
   - All use `requireAuth` (already at router level) + `loadOwnedSpace()` owner check (404 on miss)
   - Recipe `:id` lookup must verify `recipe.spaceId === :spaceId` AND `space.userId === req.user.id`

2. **Validators** in `mySpaceValidation.js`:
   - `assertCategory(value)` — 1–24 chars
   - `assertDifficulty(value)` — `'easy'|'medium'|'hard'`
   - `assertCookTime(value)` — null or int 0–6000
   - `assertServings(value)` — null or int 1–99
   - `assertIngredients(value)` — array max 50, each `{name:1-80, amount:0-40}`
   - `assertSteps(value)` — array max 50, each `{order: int>=1, text: 1-1000}`

   Note: validators already exist in the file — verify they match the spec, fix if needed.

3. **Tests** (≥7 test cases) in `backend/__tests__/mySpace.recipes.test.js`:
   - Create happy path
   - List (2 items)
   - Category filter (한식 only returns 1/2)
   - Update happy
   - Delete happy
   - Cross-user 404
   - Validation failures (difficulty='extreme', ingredients length 51, steps[0].text length 1001)

### Verify
- `npm --prefix backend test` passes including new file
- Phase 1 tests still pass (24 → 31+ total)

---

## Worker B — Recipe Frontend (`recipe-fe` branch)

**소유 파일** (이 워커만 수정):
- `frontend/pages/my-space-recipes.html` (new)
- `frontend/pages/my-space-recipe-edit.html` (new)
- `frontend/src/js/pages/my-space-recipes.js` (new)
- `frontend/src/js/pages/my-space-recipe-edit.js` (new)
- `frontend/src/js/my-space/recipes.js` (new)
- `frontend/src/css/my-space-recipe.css` (new)

**DO NOT MODIFY**: api.js, autosave.js, components.js, my-space.js (Worker C owns my-space.js extension)

### 작업 항목

1. **Screen 04** (`my-space-recipes.html` + `.js`):
   - URL `/my-space/recipes?spaceId=<id>`
   - Category tabs: 전체 / 한식 / 양식 / 디저트 / 기타 (URL state sync)
   - Card grid: name + category badge + difficulty + time + servings
   - "+ 새 레시피" button → `/my-space/recipes/new?spaceId=<id>`
   - Empty state

2. **Screen 05** (`my-space-recipe-edit.html` + `.js`):
   - URL `/my-space/recipes/new?spaceId=<id>` (POST then PATCH)
   - URL `/my-space/recipes/:id?spaceId=<id>` (GET + PATCH)
   - Form fields: name, category select, difficulty radio, cookTime, servings, description,
     ingredients (dynamic rows), steps (dynamic rows)
   - Ingredient/step row helpers in `recipes.js`
   - Autosave reusing Phase 1's `autosave.js` (global via script tag)
   - "저장됨 ✓" indicator top-right

3. **CSS** (`my-space-recipe.css`):
   - Uses `--color-recipe-*` tokens from `my-space-tokens.css`
   - Cards/hover/border-radius consistent with `my-space.css`

4. **`recipes.js`** API wrapper:
   - `recipes.list(spaceId, opts)` — with optional category filter
   - `recipes.create(spaceId, payload)`
   - `recipes.get(spaceId, id)`
   - `recipes.update(spaceId, id, patch)`
   - `recipes.remove(spaceId, id)`
   - `renderRecipeCard(recipe, onClick)` — card render function
   - `renderIngredientRow(item, index)` — ingredient form row
   - `renderStepRow(item, index)` — step form row
   - **Reuse `authFetch`** via import/global, do not redefine

5. **Zero `innerHTML`** — use `textContent`/`createElement` throughout

---

## Worker C — Glue & QA (`recipe-glue` branch)

**소유 파일** (이 워커만 수정):
- `frontend/nginx.conf` (extend with recipe routes)
- `frontend/src/js/pages/my-space.js` (extend dashboard with template-aware branching)
- `qa/my-space-recipes.spec.js` (new)

**DO NOT TOUCH**: `qa/my-space.spec.js` (Phase 1, already exists)

### 작업 항목

1. **nginx**: 3 location blocks:
   - `/my-space/recipes` → `pages/my-space-recipes.html`
   - `/my-space/recipes/new` → `pages/my-space-recipe-edit.html`
   - `/my-space/recipes/:id pattern` → `pages/my-space-recipe-edit.html`

2. **Dashboard branching** in `my-space.js`, switch on `space.template`:
   - `diary` → existing diary list behavior (already implemented)
   - `recipe` → call `recipes.list(spaceId)`, render top-3 recent cards,
     "+ 새로 작성" → `/my-space/recipes/new?spaceId=`
   - `freeform` → placeholder div with text "Phase 2 에서 지원 예정"
   Note: `recipes.js` is loaded via `<script>` tag so the `recipes` global is available.

3. **`qa/my-space-recipes.spec.js`** Playwright happy path:
   - login → create recipe space → navigate to recipe list →
     "+ 새 레시피" → fill form (2 ingredients + 2 steps) →
     wait 700ms → "저장됨 ✓" → back to list → card visible
   - Console + pageerror = 0

---

## 머지 / Synthesis 순서

1. Verify each worker only touched its owned files
2. Create `team-implement-phase-1.5/<timestamp>` off `team-implement/20260503-2148`
3. Merge `recipe-be` → new branch
4. Merge `recipe-fe` → new branch
5. Merge `recipe-glue` → new branch
6. `npx prisma generate`
7. `npm --prefix backend test` (31+ tests)
8. Grep verifications (innerHTML, auth)
9. Push branch

---

## Done 정의 (Phase 1.5)

- [ ] Recipe CRUD API with owner verification (404 on mismatch)
- [ ] Validation: category, difficulty, cookTime, servings, ingredients, steps
- [ ] Backend tests ≥ 7 new cases (31+ total)
- [ ] Recipe list page (Screen 04) with category tabs
- [ ] Recipe edit page (Screen 05) with autosave
- [ ] Dashboard branching: diary/recipe/freeform
- [ ] nginx routes for recipe pages
- [ ] Playwright happy path for recipe flow
- [ ] Zero innerHTML in new recipe JS files
