# My Space — Phase 3.3 작업 분해 (Space 다중 생성/관리 UI)

_작성일: 2026-05-05_
_연관 결정사항: [docs/decisions/my-space-phase-3-decisions.md](../decisions/my-space-phase-3-decisions.md) §3.1~3.3_

## 결정사항 (확정값)

- **3.1 같은 이름 허용**: A — 허용 (id로 식별)
- **3.2 삭제 confirm**: B — 이름 재입력 강제
- **3.3 Template 추가성**: A — 현 4종 enum 유지 (diary/recipe/freeform/jira)

## 현재 상태 (main 기준)

- `frontend/src/js/pages/my-space.js` `renderDashboard()` — inner sidebar 에 space 목록 + 하단 "+ 새 일기장" 버튼 (라벨 하드코딩, template 무관)
- "+ 새 일기장" 클릭 → `sessionStorage` flag + page reload 로 onboarding 강제 (워크어라운드)
- Space rename / delete UI 없음. 백엔드는 `PATCH /api/my-space/:id` (name 변경) + `DELETE /api/my-space/:id` (cascade) 이미 구현됨.

## 목표

- 인너 sidebar 의 각 space 에 hover 시 rename(✏️) / delete(🗑️) 액션 노출
- Inline rename: click → input 으로 전환 → Enter/blur 저장, Esc 취소. 낙관적 업데이트, 실패 시 revert
- Delete: 모달 → 사용자가 space.name 을 정확히 재입력해야 enable. 확정 시 cascade 삭제, active 였으면 다른 space 로 전환 (없으면 온보딩)
- "+ 새 공간" 버튼 (라벨 template-agnostic): 클릭 → 페이지 reload 없이 inline 으로 onboarding 렌더 → 새 space 생성 후 dashboard 복귀, 새 space 가 active

---

## Worker A — Backend hardening + Playwright

**Branch suffix**: `space-mgmt-qa`

**소유 파일**:
- `backend/__tests__/mySpace.test.js` (확장)
- `qa/my-space-space-mgmt.spec.js` (NEW)

### 작업

1. **백엔드 테스트 추가** (`mySpace.test.js`):
   - DELETE space → DiaryEntry / Recipe / FreeformNote 모두 cascade 삭제됨 (생성 후 DELETE → list 가 빈 배열)
   - PATCH `/api/my-space/:id` with `{ name: "" }` → 400
   - PATCH `/api/my-space/:id` with `{ name: "X".repeat(81) }` → 400
   - PATCH `/api/my-space/:id` with `{ name: "수정됨" }` → 200, 응답에 새 이름 반영

2. **Playwright spec** (`qa/my-space-space-mgmt.spec.js`):
   - 로그인 → onboarding → diary space 생성
   - 인너 sidebar 의 ✏️ 클릭 → input 노출 → 새 이름 입력 → Enter → 이름 변경 확인
   - 추가 space 생성 ("+ 새 공간" 버튼 → onboarding inline → recipe template 선택 → space 생성)
   - 첫 space 의 🗑️ 클릭 → 모달 노출
   - 모달 input 에 잘못된 이름 입력 → 삭제 버튼 disabled 확인
   - 정확한 이름 입력 → 삭제 버튼 enable → 클릭 → space 1개로 줄어듦
   - 마지막 space 도 삭제 → 온보딩 화면 자동 노출
   - 콘솔 / pageerror 0

### Verify
- `npm --prefix backend test` 통과 (42 → 46+)
- `npx playwright test qa/my-space-space-mgmt.spec.js` 통과

### 커밋 (per-unit)
- `test(backend): add cascade delete and PATCH name validation tests`
- `test(e2e): add Phase 3.3 Playwright spec for space rename/delete/new flow`

---

## Worker B — Inner sidebar UX (rename + new-space)

**Branch suffix**: `space-mgmt-fe`

**소유 파일**:
- `frontend/src/js/pages/my-space.js`
- `frontend/src/css/my-space.css`

**의존성**: Worker C 가 만드는 `window.deleteSpaceModal.show({ space, onConfirm })` 글로벌 호출. Worker B 작업 중에는 stub 으로 가정 가능 — 실제 통합은 머지 후 검증.

### 작업

1. **Inline rename UX** (renderDashboard 의 sidebar item 부분):
   - 각 space item 을 `<button>` → `<div>` 컨테이너로 변경. 내부:
     - 이름 표시 영역 (button or div, click → space 전환)
     - hover 시 ✏️ + 🗑️ 액션 버튼 노출 (`opacity` 트랜지션)
   - ✏️ 클릭:
     - 이름 표시 영역을 `<input>` 으로 교체, 현재 이름 prefill, focus + select
     - `Enter` 또는 `blur` → `mySpace.update(id, { name: newName })` 호출
       - 성공: 표시 영역 복귀 + 새 이름 반영, `spaces` 배열 갱신
       - 실패: 입력 빨갛게 + 1.5s 후 자동 revert + alert
     - `Esc` → input 제거, 원래 이름 복귀
   - 🗑️ 클릭:
     - `window.deleteSpaceModal.show({ space, onConfirm: handleDelete })` 호출
     - `handleDelete(space)`:
       - `mySpace.remove(space.id)` 호출
       - `spaces = spaces.filter(s => s.id !== space.id)`
       - active 가 삭제된 경우: `activeSpaceId = spaces[0]?.id ?? null`
       - `spaces.length === 0` 이면 `renderOnboarding()`, 아니면 `renderDashboard()`

2. **"+ 새 공간" 버튼** (sidebar 하단):
   - 라벨 변경: "+ 새 공간"
   - 클릭 → 기존 `sessionStorage` + reload 패턴 제거 → `renderOnboarding()` 직접 호출
   - 추가 변경: `handleTemplateSelect` 의 마지막 부분 (`window.location.reload()`) 을 다음으로 교체:
     ```js
     const newSpace = await mySpace.create({ name, template });
     spaces = await mySpace.list();
     activeSpaceId = newSpace.id;
     renderDashboard();
     ```

3. **CSS** (`my-space.css`):
   - `.ms-inner-sidebar__item` 에 hover 시 액션 노출 룰
   - `.ms-inner-sidebar__item-actions` (✏️ + 🗑️ wrapper) — 기본 `opacity: 0; pointer-events: none`, hover 시 `opacity: 1; pointer-events: auto`
   - `.ms-inner-sidebar__rename-input` — input 형태 (border, padding, 같은 폰트)
   - `.ms-inner-sidebar__rename-input--error` — 빨강 border + 진동 애니메이션 1회

### Verify
- 콘솔/네트워크 에러 0
- `grep -n "innerHTML" frontend/src/js/pages/my-space.js` → 빈 결과 (기존도 0)

### 커밋 (per-unit)
- `feat(frontend): inline rename UX in inner sidebar with optimistic update`
- `feat(frontend): replace hardcoded "새 일기장" with template-agnostic "+ 새 공간" inline onboarding`

---

## Worker C — Delete confirm modal

**Branch suffix**: `space-mgmt-modal`

**소유 파일**:
- `frontend/src/js/my-space/deleteSpaceModal.js` (NEW)
- `frontend/src/css/my-space-modal.css` (NEW)
- `frontend/pages/my-space.html` (1줄 link + 1줄 script tag 추가)

### 작업

1. **`deleteSpaceModal.js`**:
   - 전역 노출: `window.deleteSpaceModal = { show, hide };`
   - `show({ space, onConfirm })`:
     - 백드롭 + 모달 카드 생성 (`createElement` 만, **innerHTML 0**)
     - 헤더: "공간 삭제"
     - 본문 1: `${space.name} 을(를) 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
     - 본문 2: 경고 박스 — "공간 안의 모든 콘텐츠(일기/레시피/노트/Jira 워크스페이스)가 함께 삭제됩니다."
     - 라벨 + input: "확인을 위해 공간 이름을 정확히 입력하세요"
     - 버튼: "취소" (secondary), "삭제" (danger, 처음에는 disabled)
     - 입력값 변화 감지: input.value === space.name 일 때만 삭제 버튼 enable
     - `Esc` 또는 backdrop 클릭 → hide()
     - `Enter` (input 에서, valid 일 때만) → onConfirm(space) → hide()
     - 삭제 버튼 클릭 → onConfirm(space) → hide()
     - hide(): 모달 DOM 제거, 이전 active element 로 focus 복귀

2. **`my-space-modal.css`**:
   - `.ms-modal-backdrop` — 전체 화면 검은 반투명 (`rgba(0,0,0,0.5)`), `z-index: 100`
   - `.ms-modal-card` — 가운데 정렬, `--color-bg-elevated`, border-radius 12px, max-width 480px
   - `.ms-modal-card__title`, `.ms-modal-card__body`, `.ms-modal-card__warning` — 텍스트 hierarchy
   - `.ms-modal-card__warning` — 경고 박스 배경 (`--color-danger-dim` 같은 토큰 또는 `--color-recipe-dim` 등 기존 토큰 재활용)
   - `.ms-modal-card__input` — 입력 필드
   - `.ms-modal-card__actions` — 버튼 행 (flex, gap)
   - `.btn-danger` (재정의 또는 새로) — 빨강 계열 (예: `#e54848` dark, `#c62828` light)

3. **`my-space.html`**:
   - `<head>` 에 `<link rel="stylesheet" href="/src/css/my-space-modal.css" />` 추가
   - `<body>` 의 script 영역에 `<script src="/src/js/my-space/deleteSpaceModal.js"></script>` 추가 (Worker B 의 `my-space.js` 보다 **이전**에 로드되어야 함)

### Verify
- `grep -n "innerHTML" frontend/src/js/my-space/deleteSpaceModal.js` → 빈 결과
- 모달 단독 검증: `<script>window.deleteSpaceModal.show({ space: { name: 'test' }, onConfirm: console.log })</script>` 으로 노출되는지 (검증 환경)

### 커밋 (per-unit)
- `feat(frontend): add deleteSpaceModal module with name-reentry confirmation`
- `chore(frontend): wire deleteSpaceModal CSS link and script tag in my-space.html`

---

## 머지 / Synthesis 순서

1. Worker A → main (백엔드 + Playwright, 충돌 없음)
2. Worker C → main (모달 모듈 + CSS + HTML link/script)
3. Worker B → main (my-space.js 에서 `window.deleteSpaceModal` 호출 — Worker C 의 모듈이 먼저 로드됨)
4. `npx prisma generate` 통과 (스키마 변경 없음, 그래도 sanity)
5. `npm --prefix backend test` 통과 (46+)
6. (Docker 가용 시) compose build/up + healthcheck + curl smoke + Playwright 회귀

---

## Done 정의 (Phase 3.3)

- [ ] DELETE cascade 검증 + PATCH name 검증 백엔드 테스트 추가 (4건+)
- [ ] 인너 sidebar 각 space 에 hover 시 ✏️ + 🗑️ 액션 노출
- [ ] Inline rename: 낙관적 업데이트 + 실패 시 revert
- [ ] 삭제 모달: 이름 재입력 강제, valid 시 enable, cascade 삭제
- [ ] active 가 삭제된 경우 다른 space 로 전환, 없으면 onboarding
- [ ] "+ 새 공간" 버튼: 인라인 onboarding (페이지 reload 없음)
- [ ] 새 space 생성 후 dashboard 복귀 + 새 space active
- [ ] Playwright spec 통과 (rename + delete + new flow)
- [ ] innerHTML 0
