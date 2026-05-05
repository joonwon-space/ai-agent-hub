# My Space — Phase 3.4 작업 분해 (접근성 / 반응형 / 다크모드 토글)

_작성일: 2026-05-05_
_연관 결정사항: [docs/decisions/my-space-phase-3-decisions.md](../decisions/my-space-phase-3-decisions.md) §3.4 (4.1~4.3)_

## 결정사항 (확정값)

- **4.1 axe-core 도입**: YES — `@axe-core/playwright` 1줄 import, Playwright 시나리오에 audit 통합
- **4.2 모바일 반응형**: B — `≤768px` breakpoint 기본 지원 (편집 화면은 데스크톱 권장 유지)
- **4.3 다크/라이트 토글**: A 결정이었으나 Jira-as-template 머지로 외부 사이드바가 제거됨 → 현재 topbar 토글이 사실상 옵션 B 와 동일. **현 위치 유지 + 접근성 보강** 으로 재해석. dashboard inner sidebar 하단에 보조 토글 추가는 옵션 (시간 남으면).

## 현재 상태 (main `0671458` 기준)

- `frontend/src/js/theme.js` — 기능은 동작 (toggleTheme + localStorage). aria-label/role/aria-pressed 부재.
- 모든 페이지 topbar 에 `<button id="theme-toggle" onclick="toggleTheme()">☀️ Light</button>` 동일 패턴
- CSS 8 파일 중 `@media` 쿼리 있는 파일 2개 (`my-space.css`, `my-space-note.css`) — 사실상 반응형 미지원
- light-mode 토큰은 `[data-theme="light"]` selector 로 일부 정의됨 (검증 필요)
- Playwright 5 spec 모두 데스크톱 viewport 기본
- axe-core 의존성 없음

## 목표

1. `axe-core` 자동 감사 통합 — 핵심 페이지에서 critical/serious 위반 0
2. ≤ 768px 에서 layout 깨지지 않음 (topbar/inner sidebar/카드 그리드/폼/모달)
3. 다크/라이트 토글에 적절한 aria 속성 + 키보드 접근성
4. 모든 신규 토큰 (`--color-diary-*`, `--color-recipe-*`, `--color-freeform-*`) 의 light-mode 변수 누락 0

---

## Worker A — axe-core 통합 + 접근성 검증 (branch: `a11y-axe`)

**소유 파일**:
- `qa/package.json` (의존성 추가)
- `qa/package-lock.json` (자동)
- `qa/a11y.js` (NEW — 공유 헬퍼)
- `qa/my-space-a11y.spec.js` (NEW — 전용 spec)

### 작업

1. **의존성 추가**: `npm install --save-dev @axe-core/playwright` from `qa/`. 결과 commit.

2. **`a11y.js`** 공유 헬퍼:
   ```js
   const { AxeBuilder } = require('@axe-core/playwright');
   async function auditA11y(page, label) {
     const result = await new AxeBuilder({ page })
       .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
       .analyze();
     const critical = result.violations.filter((v) => ['critical','serious'].includes(v.impact));
     if (critical.length > 0) {
       const msg = critical.map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elem)`).join('\n');
       throw new Error(`${label} — ${critical.length} critical/serious a11y violations:\n${msg}`);
     }
     return result;
   }
   module.exports = { auditA11y };
   ```

3. **`my-space-a11y.spec.js`**: 핵심 5 페이지 audit
   - `/login` (로그인 폼 a11y)
   - `/my-space` 온보딩 (4-card 화면 + 사이드바 X 상태)
   - `/my-space` 대시보드 (inner sidebar + ✏️/🗑️ 버튼들)
   - `/my-space/diary/new` (편집 폼 + 자동저장 인디케이터)
   - `/my-space/notes/new` (좌-textarea / 우-preview split)
   - 각 페이지에서 `auditA11y(page, page-name)` 호출
   - **3가지 viewport 검증**: 데스크톱 1280×800, 태블릿 768×1024, 모바일 360×740 (반응형 회귀)
   - 다크/라이트 모드 모두 (`data-theme` 속성 변경 후 재검증)

4. **위반 처리 정책**:
   - critical/serious → 즉시 fix (Worker C 협조 필요 — aria 속성)
   - moderate/minor → 보고서로 문서화 (`qa/a11y-report.md` 생성), 본 페이즈 외 후속 작업
   - 위반 fix 가 다른 워커 파일을 건드려야 하면 → Worker A 가 발견 보고만, fix 는 해당 워커에서

### Verify
- `npx playwright test qa/my-space-a11y.spec.js` 통과 (critical/serious 0)
- `qa/a11y-report.md` 에 moderate/minor 위반 정리 (있다면)

### 커밋 (per-unit, 2-3개)
- `chore(qa): add @axe-core/playwright dependency`
- `test(e2e): add a11y audit helper and dedicated spec for 5 core pages × 3 viewports × 2 themes`

---

## Worker B — 반응형 CSS (≤768px) (branch: `responsive-css`)

**소유 파일**:
- `frontend/src/css/main.css`
- `frontend/src/css/my-space.css`
- `frontend/src/css/my-space-recipe.css`
- `frontend/src/css/my-space-note.css`
- `frontend/src/css/my-space-modal.css`
- `frontend/src/css/my-space-jira.css`
- `frontend/src/css/auth.css`
- `frontend/src/css/my-space-tokens.css` (light-mode 누락 보강만, 새 토큰 X)

**HTML 미수정** — Worker C 와 충돌 회피. 반응형은 CSS only 로 처리.

### 작업

1. **main.css 의 topbar**:
   - `@media (max-width: 768px)`:
     - `.topbar-email` `display: none`
     - `.topbar-right` 의 padding/gap 축소
     - 로고 텍스트 축소

2. **my-space.css**:
   - `.ms-dashboard` flex direction `row` → 모바일에서 `column`
   - `.ms-inner-sidebar` 너비 180px → 모바일에서 `width: 100%; flex-direction: row; overflow-x: auto;` (가로 스크롤 탭처럼)
   - 또는 더 간단히: 사이드바 위 / pane 아래 (`flex-direction: column`)
   - `.ms-template-grid` 4-card grid → 모바일에서 1열 (`grid-template-columns: 1fr`)
   - `.ms-onboarding__title` 폰트 크기 조정

3. **my-space-recipe.css**:
   - 카드 그리드 → 모바일 1열
   - `.ms-recipe-cover-dropzone` padding 축소
   - 편집 화면 form 너비 100%

4. **my-space-note.css**:
   - 노트 편집 화면의 50/50 split → 모바일에서 stacked column (editor 위, preview 아래)
   - 노트 카드 그리드 → 모바일 1열

5. **my-space-modal.css**:
   - `.ms-modal-card` `max-width: 480px` → 모바일에서 `width: calc(100vw - 32px)`
   - 모달 padding 축소

6. **my-space-jira.css**:
   - 폼 너비 100%
   - 버튼 행 wrap 가능

7. **auth.css**:
   - 로그인/회원가입 카드 → 모바일에서 padding/border-radius 조정

8. **my-space-tokens.css** light-mode 누락 검증:
   - 모든 `--color-diary-*`, `--color-recipe-*`, `--color-freeform-*` 가 `:root` (dark) + `[data-theme="light"]` 양쪽에 정의됐는지 확인
   - 누락분 보강

### 제약
- HTML 변경 0
- 기존 데스크톱 레이아웃 회귀 없음 (768px 초과는 동일하게 보여야 함)
- `@media (max-width: 768px)` 만 사용 (mobile-first 재작성 X)

### Verify
- 데스크톱 viewport 에서 변경 무 (vis 회귀 0)
- 모바일 viewport 에서 layout overflow / 가독성 점검 (Worker A 의 axe spec 이 검증)

### 커밋 (per-unit, 2-3개)
- `feat(css): add responsive ≤768px breakpoint for topbar, sidebar, dashboard layout`
- `feat(css): add responsive layout for recipe/note/modal/jira/auth pages`
- `fix(css): backfill missing light-mode token definitions`

---

## Worker C — 테마 토글 a11y + topbar HTML (branch: `theme-a11y`)

**소유 파일**:
- `frontend/src/js/theme.js`
- `frontend/pages/my-space.html`
- `frontend/pages/my-space-diary-edit.html`
- `frontend/pages/my-space-recipes.html`
- `frontend/pages/my-space-recipe-edit.html`
- `frontend/pages/my-space-notes.html`
- `frontend/pages/my-space-note-edit.html`
- `frontend/pages/login.html`
- `frontend/pages/signup.html`
- `frontend/pages/settings.html`

### 작업

1. **`theme.js`**:
   - 토글 버튼에 `aria-label="테마 전환 — 현재: 다크"` (현재 모드에 따라 동적 갱신)
   - `aria-pressed="true|false"` 추가 (true = light, false = dark — 기준은 일관 유지)
   - 키보드 지원 — `<button>` 이라 기본 Enter/Space 동작. 추가 작업 X.
   - `applyTheme()` 내부에서 모든 토글 인스턴스에 aria 속성 동기화 (페이지에 1개만 있어도 다중 안전)

2. **모든 9 HTML 파일의 topbar**:
   - `<button id="theme-toggle" onclick="toggleTheme()" aria-label="테마 전환" aria-pressed="false" type="button">☀️ Light</button>`
   - `<button onclick="logout()" class="btn-text" aria-label="로그아웃" type="button">로그아웃</button>` — `type="button"` 누락 가능성 점검 (form 안일 때 의도치 않은 submit 방지)

3. **추가 a11y 표시** (Worker A 가 surfacing 한 violation 들):
   - `<aside id="sidebar">` 이 남아있는 페이지 (settings.html 등) → 적절한 `aria-label="메인 사이드바"`
   - `<main>` 에 `id="main-content"` 가 있다면 skip-link 추가 가능 (선택)
   - 폼 input 들이 label 과 연결되어 있는지 (`for=` / `aria-labelledby`)

### Verify
- `theme.js` 에 aria 속성 갱신 코드 존재
- 모든 page 의 topbar 토글 `aria-label` 보유
- Worker A 의 a11y spec 통과

### 커밋 (per-unit, 2-3개)
- `feat(a11y): add aria-label/aria-pressed to theme toggle and persist on apply`
- `chore(html): add aria-label and type="button" to topbar buttons across 9 pages`

---

## 머지 / Synthesis 순서

1. Worker B → main (CSS 단독 — 다른 워커와 충돌 없음, 반응형 회귀 검증)
2. Worker C → main (HTML + theme.js — Worker A 의 spec 이 의존)
3. Worker A → main (마지막에 머지하여 통합 audit 실행 가능)
4. `npm --prefix backend test` 통과 (변경 없으니 같은 55개)
5. `cd qa && npx playwright test --workers=1` 회귀 (5 + a11y 신규)
6. `docker compose down && build frontend && up -d` (CSS/HTML 변경 → frontend rebuild)

---

## Done 정의 (Phase 3.4)

- [ ] `@axe-core/playwright` 의존성 추가 + a11y 헬퍼 + 전용 spec
- [ ] 5 핵심 페이지 × 3 viewport × 2 theme = 30 audit 통과 (critical/serious 0)
- [ ] `qa/a11y-report.md` 에 moderate/minor 정리
- [ ] ≤ 768px 모바일 viewport 에서 모든 my-space 페이지 layout 정상
- [ ] 모든 light-mode 토큰 누락 0
- [ ] theme toggle aria-label + aria-pressed 동기화
- [ ] 모든 topbar 버튼 type="button" + aria-label
- [ ] 데스크톱 회귀 0 (기존 5 spec 통과 유지)

---

## 미루는 항목 (Phase 3.4 외)

- moderate/minor a11y 위반 (보고서로 문서화만)
- 모바일 ≤ 480px (스마트폰 작은 화면) — 본 페이즈는 ≤ 768px 까지
- 색맹 친화 색상 검토 (axe 가 critical 으로 안 잡으면 후속)
- screen reader 풀 테스트 (NVDA/VoiceOver 수동)
