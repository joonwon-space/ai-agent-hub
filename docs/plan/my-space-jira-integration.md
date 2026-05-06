# My Space — Jira 통합 (B안 + flow 1)

_작성일: 2026-05-05_
_연관 의사결정: [docs/decisions/my-space-phase-3-decisions.md](../decisions/my-space-phase-3-decisions.md)에서 분기된 사용자 결정_

## 결정사항

- **B안**: Jira 를 4번째 템플릿(`jira`)으로 모델링. `/api/my-space` 의 Space 가 jira workspace 가 됨.
- **Flow (1)**: Space 가 없으면 온보딩(템플릿 4개 카드), 있으면 대시보드. 활성 space.template 에 따라 pane 렌더.
- **Login 진입**: `/login` 성공 → `/my-space` 직행. 기존 `/`(index.html) 은 nginx 에서 302 redirect.
- **외부 사이드바 제거**: 기존 모든 `my-space*.html` 의 outer `#sidebar`(Agents + Personal) 를 제거. `/my-space` 의 inner sidebar(spaces list) 가 유일한 좌측 내비게이션이 된다.
- **Jira config**: 사용자 단위 (`UserSetting` 의 `jira_*` 키) 그대로 유지. 다중 jira space 생성 시 모두 같은 Jira 인스턴스 공유. 미설정 시 dashboard pane 에 "/settings 에서 먼저 입력하세요" 안내.
- **데이터 모델 변경 없음**: `Space.template` 이 String 이라 'jira' 추가 가능. 검증 헬퍼만 확장.

---

## Worker A — Backend (branch suffix `jira-be`)

**소유 파일**:
- `backend/src/services/mySpaceValidation.js`
- `backend/__tests__/mySpace.test.js`

### 작업

1. `assertTemplate(v)` 의 허용 enum 에 `'jira'` 추가. 현재 `['diary','recipe','freeform']` → `['diary','recipe','freeform','jira']`.
2. 기존 `mySpace.test.js` 의 invalid template 테스트가 `'oops'` 같은 값을 사용하면 그대로 유효. 추가 테스트:
   - `POST /api/my-space` with `{ template: 'jira' }` → 200, 응답에 `template: 'jira'`
   - `GET /api/my-space` → jira space 가 목록에 포함
3. (선택) `mySpaceValidation.js` 의 enum 을 `module.exports` 로 export 하여 프론트가 직접 fetch 하는 패턴은 도입하지 않음 — 프론트는 하드코딩 카드 4개로 충분.

### Verify
- `npm --prefix backend test` 통과 (40 → 41+)

---

## Worker B — Frontend My Space (branch suffix `jira-fe`)

**소유 파일**:
- `frontend/src/js/pages/my-space.js` (extend onboarding + dashboard branching)
- `frontend/src/js/my-space/jira.js` (NEW — Jira agent UI 모듈, my-space 컨텍스트용)
- `frontend/src/css/my-space-jira.css` (NEW — jira pane 스타일)
- `frontend/pages/my-space.html` (script tag 1줄 + CSS link 1줄)

**기존 파일 참조 (수정 X)**:
- `frontend/src/js/agents/jira.js` — 참고용. 새 모듈은 컨테이너 인자로 동작하도록 재작성 (`renderJiraPane(container, spaceId)`). 기존 파일은 Worker C 에서 삭제.
- `frontend/src/js/api.js` — `previewAgent(name, input)`, `runAgent(name, input)` wrapper 사용. 그대로 import.

### 작업

1. **온보딩 4번째 카드 추가** (`my-space.js` `renderOnboarding()`):
   ```js
   {
     template: 'jira',
     label: 'Jira 워크스페이스',
     description: 'AI 가 작업 개요를 분석해 Jira 이슈를 자동 생성합니다.',
     emoji: '🎫',
   }
   ```
   카드 색상은 별도 토큰(`--color-jira-*`) 도입 대신 일단 freeform 과 같은 계열 사용 (Phase 3.1 에서 토큰 추가 가능). 또는 임시 inline 색.

2. **`renderPaneForSpace()` 분기 확장**: `case 'jira': await renderJiraPane(pane, space.id); break;`

3. **`my-space/jira.js`** (NEW 모듈):
   - Export 패턴: 전역 `window.jira` 또는 `function renderJiraPane(container, spaceId)`. 다른 my-space 모듈이 전역 노출 패턴을 쓰므로 일관성 유지.
   - 진입 시 `/api/agents` 에서 `jira` 에이전트 메타(inputSchema) 가져와 동적 폼 생성. 또는 inputSchema 가 변하지 않으면 하드코딩.
   - 입력: `overview` (textarea), `file` (optional file input)
   - 버튼: "미리보기 생성" → `previewAgent('jira', input)` → 결과 표시 → "Jira 이슈 생성" 버튼 → `runAgent('jira', { ...input, fields })`.
   - Jira 미설정 에러 (`'Jira 설정이 없습니다'`) 감지 시: pane 에 "Jira 설정이 필요합니다" 박스 + `/settings` 링크 버튼 노출.
   - **innerHTML 금지**. 기존 `agents/jira.js` 의 `sec.innerHTML = ...` 는 모두 createElement 트리로 재작성.
   - 파일 업로드: `/api/upload` 호출하여 `fileData` 받아 `previewAgent` 에 동봉 (현 `main.js` 패턴 참고).

4. **`my-space-jira.css`**: 입력 폼 padding, 미리보기 카드 border-radius, success/error 박스 스타일. 기존 `.preview-card`, `.badge` 등의 스타일이 main.css 에 있으면 재사용 가능 — 중복 정의 금지.

5. **`my-space.html`**: `<link rel="stylesheet" href="/src/css/my-space-jira.css">` 추가, `<script src="/src/js/my-space/jira.js">` 추가 (recipes/notes 와 같은 위치).

### Verify
- `grep -n "innerHTML" frontend/src/js/my-space/jira.js` → 빈 결과
- 카드 4개가 온보딩에 노출되고, jira 카드 클릭 → 이름 입력 → space 생성 → 대시보드에서 jira pane 노출

---

## Worker C — Infra & Sidebar 제거 (branch suffix `jira-glue`)

**소유 파일**:
- `frontend/src/js/pages/login.js` (redirect target)
- `frontend/nginx.conf` (`/` → 302 redirect 추가)
- `frontend/pages/my-space.html` (외부 `#sidebar` 블록 제거 — Worker B 가 같은 파일을 만지므로 **단일 충돌 가능 영역** 주의)
- `frontend/pages/my-space-diary-edit.html`
- `frontend/pages/my-space-recipes.html`
- `frontend/pages/my-space-recipe-edit.html`
- `frontend/pages/my-space-notes.html`
- `frontend/pages/my-space-note-edit.html`
- `frontend/public/index.html` (DELETE — nginx redirect 가 있으므로 미도달, but safety 차원)
- `frontend/src/js/main.js` (DELETE — index.html 과 함께 obsolete)
- `frontend/src/js/agents/jira.js` (DELETE — Worker B 의 my-space/jira.js 가 대체)

### Worker B 와의 my-space.html 충돌 해결

Worker B 는 `<link>` + `<script>` 1줄씩만 추가 (head/body 영역).
Worker C 는 같은 파일에서 `<aside id="sidebar">…</aside>` 블록 제거 (다른 영역).

**충돌 회피 합의**: Worker B 가 my-space.html 에 추가한 변경분을 Worker C 가 자기 worktree 에서 그대로 보존(merge 시 Worker B 의 변경분이 먼저 적용된 상태에서 Worker C 가 sidebar 만 제거). synthesizer 가 머지 순서를 B → C 로 강제.

대안: **Worker B 가 my-space.html 도 단독 소유**, Worker C 는 my-space.html 만 제외하고 다른 5개 *.html 의 sidebar 만 제거. → 더 깨끗. 이 방식 채택.

수정 후 file ownership:
- Worker B: `my-space.html` 단독 (script + link + sidebar 제거 모두 처리)
- Worker C: `my-space-diary-edit.html`, `my-space-recipes.html`, `my-space-recipe-edit.html`, `my-space-notes.html`, `my-space-note-edit.html`, `index.html` 삭제, `main.js` 삭제, `agents/jira.js` 삭제, `login.js` 수정, `nginx.conf` 수정

### 작업

1. **login redirect**: `frontend/src/js/pages/login.js` 라인 21:
   ```js
   window.location.href = '/my-space';   // was: '/'
   ```

2. **nginx**: 다음 위치 블록 추가 (기존 `/my-space*` 블록들 위에):
   ```
   location = / { return 302 /my-space; }
   ```
   `index.html` 이 삭제되므로 nginx 의 `index` 디렉티브가 fallback 하지 않도록 확인.

3. **외부 sidebar 제거** (5개 *.html, my-space.html 제외):
   각 파일에서 `<aside id="sidebar">…</aside>` 블록 전체 + 그 직후 `<main>` 의 `margin-top:48px;height:calc(100vh - 48px)` 인라인 스타일에서 sidebar 가 차지하던 좌측 여백 보정 (CSS 의 `#main` 규칙이 sidebar 너비만큼 padding-left 를 가지면 그 값도 0 으로 낮추거나 페이지별 override 필요).

4. **삭제**:
   - `frontend/public/index.html`
   - `frontend/src/js/main.js`
   - `frontend/src/js/agents/jira.js`
   - 디렉토리 `frontend/src/js/agents/` 가 빈 폴더면 함께 제거.

5. **회귀 검증**: 사이드바 제거 후 main 콘텐츠가 좌측에 붙어 보이지 않도록 CSS 점검. 필요 시 `frontend/src/css/main.css` 의 `#main` 규칙을 페이지에서 override 하거나, my-space-*.html 의 main 인라인 스타일에 `margin-left: 0` 추가.

### Verify
- 로그인 → 자동으로 `/my-space` 노출, 사이드바 없음
- `/` 직접 접근 → 302 → `/my-space`
- `/my-space/recipes`, `/my-space/notes`, `/my-space/diary/new` 등 모든 my-space 페이지에서 외부 sidebar 미노출
- `/settings` 페이지는 별개로 영향 없음 (기존 sidebar 유지)

---

## 머지 / Synthesis 순서

1. Worker A → main (백엔드, 충돌 없음)
2. Worker B → main (`my-space.html` 단독 수정, `my-space/jira.js`/`my-space-jira.css` 신규)
3. Worker C → main (다른 5개 my-space-*.html 의 sidebar 제거 + 삭제 작업)
4. `npx prisma generate` 통과
5. `npm --prefix backend test` 통과 (41+)
6. (Docker 미가용 환경) 시각/E2E 검증은 다른 환경 위임 — 브랜치 push 만, 검증 별도 페이즈

---

## Done 정의

- [ ] `assertTemplate` 가 `'jira'` 허용
- [ ] 온보딩에 4번째 카드(Jira 워크스페이스) 노출
- [ ] jira space 진입 시 dashboard pane 에 Jira 이슈 생성 UI 노출
- [ ] Jira 미설정 시 안내 + `/settings` 링크
- [ ] login → `/my-space` 직행
- [ ] `/` 접근 시 302 → `/my-space`
- [ ] my-space 페이지들에서 외부 사이드바(Agents 섹션 포함) 제거
- [ ] `index.html`, `main.js`, `agents/jira.js` 삭제
- [ ] 백엔드 테스트 41+ 통과
- [ ] my-space/jira.js 에 innerHTML 0

---

## 후속 (이번 페이즈 외)

- Per-space Jira config (다른 Jira 인스턴스를 다른 space 에서 쓰고 싶을 때) — 새 모델 또는 UserSetting 키 prefix 변경
- Jira 외 다른 에이전트 추가 (`backend/src/agents/*.js` 늘어날 때) — 각 에이전트마다 별도 template 추가 또는 generic agent template 으로 통합
- Jira 토큰 색상 (`--color-jira-*`) — 디자인 토큰 추가

→ 잔여 후속 항목은 [`docs/plan/backlog.md`](./backlog.md) 에 통합 정리됨.
