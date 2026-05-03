# My Space — Phase 1 작업 분해 (멀티 에이전트 병렬 실행용)

소스 PRD: [docs/prd/my-space.md](../prd/my-space.md)
디자인 핸드오프: `/Users/joonwonlee/Downloads/AI Agent Hub Design System.zip` (압축해제 시 `/tmp/aah-design/handoff/`)

본 문서는 `team-implement` 오케스트레이터가 3개 워커를 git worktree 로 병렬 구동할 때 각 워커의 책임/파일 경계를 명시한다. **다른 워커가 같은 파일을 만지지 못하도록 분리**되어 있다.

---

## 공통 전제 (모든 워커 공유)

- 작업 시작 전 PRD §4 (데이터 모델) §5 (API) §6 (프론트 구조) §7 (인증) 정독
- 응답 envelope: 신규 라우트는 성공 시 raw object, 실패 시 `{ error: string }` (status code 로 구분) — 기존 routes 와 통일
- 인증: 모든 `/api/my-space/*` 는 `requireAuth` 적용
- 입력 검증: PRD §5 검증 규칙 그대로 라우트 진입 시점 적용
- 커밋 단위: 워커별 1~3 commit, conventional commits (`feat:`, `test:`, `chore:`)
- 커밋 메시지에 Co-Authored-By 추가 금지(전역 비활성화)

---

## Worker A — Infra (DB + Routing + 토큰)

**Branch suffix**: `infra`
**소유 파일** (이 워커만 수정):
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/<timestamp>_add_my_space/migration.sql` (자동 생성)
- `frontend/nginx.conf`
- `frontend/src/css/my-space-tokens.css` (신규)

### 작업 항목
1. `schema.prisma` 에 `Space`, `DiaryEntry`, `Recipe`, `FreeformNote` 모델 추가 (PRD §4 그대로)
2. `User` 모델에 `spaces Space[]` 관계 추가
3. 로컬에서 마이그레이션 생성: `npx prisma migrate dev --name add_my_space --create-only` 후 SQL 검토 (커밋만 하고 `migrate deploy` 는 컨테이너 startup 에서 실행됨)
4. `nginx.conf` 에 `/my-space*` → `pages/my-space*.html` try_files 규칙 추가. SPA 처럼 보이지만 multi-page (각 .html 이 따로 응답).
5. `frontend/src/css/my-space-tokens.css` 신규 — HANDOFF.md §컬러 토큰 그대로:
   ```css
   :root {
     --color-diary, --color-diary-hover, --color-diary-dim, --color-diary-border, --color-diary-glow, --color-diary-text;
     --color-recipe, --color-recipe-hover, --color-recipe-dim, --color-recipe-border, --color-recipe-glow, --color-recipe-text;
   }
   ```
   라이트 모드 대응값도 포함 (HANDOFF 에 없는 항목은 dark 값과 동일하게 우선 둠).

### Verify
- `npx prisma generate` 통과
- `npx prisma migrate diff` 결과 신규 4개 테이블 + 1 관계만 추가
- `nginx -t` (Dockerfile 빌드 시) 통과

---

## Worker B — Backend (API + Tests)

**Branch suffix**: `backend`
**소유 파일** (이 워커만 수정):
- `backend/src/routes/mySpace.js` (신규, 모든 my-space 라우트)
- `backend/src/services/mySpaceValidation.js` (신규)
- `backend/src/createApp.js` (라우트 등록 1줄만)
- `backend/__tests__/mySpace.test.js` (신규)

### 의존성
- Worker A 의 schema.prisma 변경이 머지된 상태로 가정 가능 (synthesizer 가 머지 순서 보장).
- 작업 중에는 자체 worktree 의 schema.prisma 를 미리 PRD §4 기준으로 patch 해 prisma client 를 generate 해도 됨 — 단, 그 변경은 **반드시 Worker A 의 변경과 byte-identical** 이어야 한다. 그렇지 않으면 머지 충돌.

### 작업 항목
1. `routes/mySpace.js`:
   - `GET/POST/PATCH/DELETE /api/my-space`
   - `GET/POST/PATCH/DELETE /api/my-space/:spaceId/diary[/:id]`
   - `GET/POST/PATCH/DELETE /api/my-space/:spaceId/recipes[/:id]`
   - 모든 라우트에 `requireAuth`
   - 모든 라우트에 try/catch + `next(err)` (CLAUDE.md 컨벤션)
   - **소유자 검증**: `:spaceId` 진입 시 `prisma.space.findFirst({ where: { id, userId: req.user.id } })`. 없으면 404.
2. `services/mySpaceValidation.js`: 검증 헬퍼 (`assertTemplate`, `assertString(min,max)`, `assertIngredients`, `assertSteps` 등). PRD §5 규칙 그대로.
3. `createApp.js` 에 `app.use('/api/my-space', mySpaceRouter)` 등록.
4. 통합 테스트(`__tests__/mySpace.test.js`):
   - Space 생성/목록/삭제 happy path
   - 다른 유저의 spaceId 접근 시 404
   - Diary CRUD happy path
   - 검증 실패 케이스 3개 (template invalid, body too long, mood enum off)

### Verify
- `npm test` (backend) 전부 통과
- `npm run lint` (있다면) 통과

---

## Worker C — Frontend (Pages + JS + CSS)

**Branch suffix**: `frontend`
**소유 파일** (이 워커만 수정):
- `frontend/pages/my-space.html` (신규)
- `frontend/pages/my-space-diary-edit.html` (신규)
- `frontend/public/index.html` (사이드바 Personal 섹션 추가만 — Worker D 와 충돌 가능 → 이 워커가 단독)
- `frontend/src/css/my-space.css` (신규)
- `frontend/src/js/pages/my-space.js`, `my-space-diary-edit.js` (신규)
- `frontend/src/js/my-space/api.js`, `autosave.js`, `components.js` (신규)
- `frontend/src/js/main.js` (사이드바 Personal 섹션 렌더 1군데만)

### 의존성
- Worker B 의 API 가 동작해야 실제 요청 성공. **하지만 작업 중에는 Worker B 의 API 계약(PRD §5)에만 의존** — 동시 진행 가능. 통합은 synthesizer 단계에서 `docker compose up` 으로 검증.

### 작업 항목
1. **사이드바 변경** (`public/index.html` + `main.js`):
   - `aside#sidebar` 안 `agent-list` 아래에 `Personal` 섹션 추가
   - 항목 1개: `My Space` (NEW 배지) → 클릭 시 `location.href = '/my-space'`
2. **화면 01 + 02** (`my-space.html` + `my-space.js`):
   - 페이지 진입 시 `GET /api/my-space`
   - 결과 비어있으면 → 온보딩(템플릿 카드 3개, 카드 클릭 → 템플릿 선택 → space 이름 입력 → `POST /api/my-space`)
   - 결과 있으면 → 대시보드 (inner sidebar 180px + 최근 diary 목록)
   - "+ 새로 작성" 버튼 → `/my-space/diary/new`
3. **화면 03** (`my-space-diary-edit.html` + `my-space-diary-edit.js`):
   - URL 패턴: `/my-space/diary/new` (POST), `/my-space/diary/:id` (PATCH)
   - `:id` 파싱은 `location.pathname.match()` 로
   - 날짜 picker (`<input type=date>`), mood 버튼 4개 (😊 😔 😤 😴), 제목 input, body textarea
   - autosave: `autosave.js` import. `body` change → 500ms debounce → PATCH
   - 인디케이터: 우상단에 "저장중…" / "저장됨 ✓" / "저장 실패"
4. **CSS** (`my-space.css`):
   - HANDOFF.md §컴포넌트 스펙 준수 (radius/패딩/hover 효과)
   - 신규 토큰 사용 (Worker A 가 추가한 `--color-diary-*`)
   - **html `innerHTML` 사용 금지**. 모든 동적 콘텐츠는 `textContent` 또는 `createElement` 로.
5. **api.js**: thin wrapper. `mySpace.list()`, `mySpace.create({name, template})`, `diary.list(spaceId)`, `diary.create(spaceId, data)`, `diary.update(spaceId, id, patch)`. 모두 `authFetch` 사용 (기존 `auth.js` 의 `authFetch` 유틸).

### Verify
- `docker compose up frontend backend db` 후:
  - 로그인 → 사이드바 "My Space" 클릭 → 온보딩 노출
  - 일기장 선택 → 빈 대시보드
  - 작성 → 저장 → 목록 갱신
- 콘솔 에러 0개

---

## Worker D — QA (E2E + 회귀 검증)

**Branch suffix**: `qa`
**소유 파일** (이 워커만 수정):
- `qa/my-space.spec.js` (신규)

### 의존성
- 다른 3개 워커가 모두 머지된 후 synthesizer 가 마지막에 실행 (실제로는 team-implement 가 3워커 패턴이므로, 이 D 는 synthesizer 단계에 통합하거나 별도 follow-up 으로 분리).

### 작업 항목
1. Playwright 시나리오 1개 (happy path):
   - 로그인 → My Space → 일기장 템플릿 선택 → 공간 이름 "내 일기" → 신규 일기 작성 → 저장 → 목록에 노출 확인
2. 사이드바 진입점 회귀: 기존 jira 에이전트 링크가 여전히 동작하는지 확인

### Verify
- `npx playwright test qa/my-space.spec.js` 통과
- `npx playwright test` (전체) 통과 (회귀 없음)

---

## 머지 / Synthesis 순서

team-implement 의 `implement-synthesizer` 가 다음 순서로 머지/검증:

1. **Worker A → main** (schema/migration/css token 만 → 충돌 없음)
2. **Worker B → main** (Worker A 의 schema 위에서 prisma client 정상 작동)
3. **Worker C → main** (B 의 API 와 통합)
4. 전체 빌드: `docker compose build`, `docker compose up -d`, healthcheck 폴링
5. 백엔드 테스트: `npm --prefix backend test`
6. **Worker D 별도 follow-up** (또는 synthesizer 가 직접 작성)

각 단계에서 충돌 발생 시 synthesizer 가 해당 워커에게 rebase 지시 + 재실행.

---

## Done 정의 (Phase 1)

- [ ] PRD §4 4개 테이블이 prod DB 에 존재
- [ ] 모든 신규 API 엔드포인트가 인증 + 소유자 검증 통과
- [ ] 사이드바에 Personal/My Space 항목 + NEW 배지 노출
- [ ] 화면 01/02/03 모두 디자인과 시각적으로 일치 (HANDOFF.md 토큰/스펙)
- [ ] 일기 작성 → 자동저장 → 목록 노출 까지 brain-to-screen 플로우 동작
- [ ] 백엔드 통합 테스트 ≥ 6개 통과, Playwright happy path 통과
- [ ] `docs/architecture/api-reference.md` 에 `/api/my-space` 섹션 추가 (synthesizer 책임)
- [ ] `docs/architecture/overview.md` Data Models 섹션에 신규 모델 추가
