# My Space — Phase 2 작업 분해 (Freeform Note + 마크다운)

소스 PRD: [docs/prd/my-space.md](../prd/my-space.md) §10 Phase 2 의 **Freeform Note + 마크다운 부분만**
선행 페이즈: [my-space-phase-1.5.md](./my-space-phase-1.5.md) (Recipe, 머지 완료 가정)

본 페이즈는 PRD §10 Phase 2 중 **Freeform Note + 마크다운 렌더만** 다룬다. 이미지 업로드/검색/Space 다중 생성은 [my-space-phase-3-extras.md](./my-space-phase-3-extras.md) 에 백로그로 분리되어 있다.

---

## 공통 전제

- Phase 1.5 (Recipe) 가 main 에 머지되어 있다는 가정
- 응답 envelope, 인증, 토큰 관행은 Phase 1/1.5 그대로
- **마크다운 처리 정책 (중요)**:
  - 외부 라이브러리 (`marked`, `markdown-it`, `DOMPurify` 등) **사용 금지**
  - 이유: (1) 신규 의존성 0 유지, (2) `innerHTML` 금지 원칙과 일관, (3) allowlist 가 작아 직접 구현 비용이 충분히 낮음
  - 구현 방식: 정규식으로 토큰화 → `createElement` 트리로 렌더 → 절대 `innerHTML` 사용 금지
  - 허용 노드 (allowlist): `h1`, `h2`, `h3`, `p`, `br`, `strong`, `em`, `code`, `pre`, `ul`, `ol`, `li`, `blockquote`, `a[href]`
  - URL 검증: `a[href]` 는 `http://`, `https://`, `/`, `#` 만 허용. `javascript:`, `data:`, `vbscript:` 거부

---

## Worker A — Note Backend

**Branch suffix**: `note-be`
**소유 파일**:
- `backend/src/routes/mySpace.js` (확장)
- `backend/src/services/mySpaceValidation.js` (확장)
- `backend/__tests__/mySpace.notes.test.js` (신규)

### 작업 항목

1. Note CRUD:
   - `GET /api/my-space/:spaceId/notes` — 정렬 `pinned desc, updatedAt desc`, 페이지네이션 `?limit=20&cursor=`
   - `POST /api/my-space/:spaceId/notes` — body: `{ title, body, pinned? }`
   - `GET /api/my-space/:spaceId/notes/:id`
   - `PATCH /api/my-space/:spaceId/notes/:id` (자동저장 + 핀 토글)
   - `DELETE /api/my-space/:spaceId/notes/:id`
2. 소유자 검증: 기존 `loadOwnedSpace()` 재사용
3. 검증 헬퍼 추가:
   - `assertNoteTitle(v)` — 1~120자 (Phase 1 의 `assertDiaryTitle` 과 동일 — 공용 `assertString(field, min, max)` 로 리팩터해도 좋음, 단 단독 워커이므로 자유)
   - `assertNoteBody(v)` — 0~50,000자
   - `assertPinned(v?)` — bool 또는 undefined
4. 모든 핸들러 `try/catch` + `next(err)`

### 통합 테스트 (≥ 6개)

- 생성/조회/수정/삭제 happy path (4개)
- pinned=true 노트가 목록 상단 (테스트: 일반 1건 + pinned 1건 → 첫 원소가 pinned)
- 다른 유저 note 접근 → 404
- 검증 실패: title 빈 문자열 → 400

### Verify
- `npm --prefix backend test` 모두 통과 (Phase 1.5 31+ 에 + 6 = 37+)

---

## Worker B — Note Frontend + 마크다운

**Branch suffix**: `note-fe`
**소유 파일**:
- `frontend/pages/my-space-notes.html` (신규)
- `frontend/pages/my-space-note-edit.html` (신규)
- `frontend/src/js/pages/my-space-notes.js` (신규)
- `frontend/src/js/pages/my-space-note-edit.js` (신규)
- `frontend/src/js/my-space/notes.js` (신규 — API wrapper + 카드 + 핀 토글)
- `frontend/src/js/my-space/markdown.js` (신규 — sanitized 미니멀 마크다운)
- `frontend/src/css/my-space-note.css` (신규)

### 의존성
- Worker A 의 API 계약(PRD §5.4)에만 의존 → 동시 진행 가능

### 작업 항목

1. **노트 목록** (`my-space-notes.html` + `.js`):
   - URL: `/my-space/notes?spaceId=<id>`
   - 진입 시 `notes.list(spaceId)` 호출
   - 핀된 노트: 상단 그리드 (구분선 라벨 "📌 고정")
   - 일반 노트: 하단 그리드 (라벨 "전체 노트")
   - 카드: 제목 + 본문 미리보기(첫 200자) + updatedAt
   - 카드 hover 시 핀 토글 아이콘 노출 → 클릭 → `notes.update(id, { pinned: !current })` → 목록 재정렬
   - "+ 새 노트" 버튼 → `/my-space/notes/new?spaceId=<id>`

2. **노트 편집** (`my-space-note-edit.html` + `.js`):
   - URL 패턴:
     - 신규: `/my-space/notes/new?spaceId=<id>`
     - 편집: `/my-space/notes/:id?spaceId=<id>`
   - 레이아웃: 좌(textarea editor) / 우(렌더 미리보기) split, 데스크톱은 50/50
   - 상단: 제목 input, 핀 토글 버튼, 저장 인디케이터
   - 자동저장: Phase 1 의 `autosave.js` 재사용. body input 이벤트 → 500ms debounce → PATCH
   - 미리보기: textarea input 시 즉시 (debounce 없이) `markdown.render(text)` 결과를 우측 div 에 교체
     - 교체 방식: 우측 div 의 모든 자식 제거 후 `appendChild(renderedTree)` — `innerHTML = ''` 도 사용 금지, `while(div.firstChild) div.removeChild(...)` 패턴

3. **`markdown.js`** — 핵심 모듈:
   - `export function render(markdown: string): DocumentFragment`
   - 토크나이저: 줄 기반 + inline 처리
     - 블록: `# H1` / `## H2` / `### H3` / 빈줄 paragraph 구분 / `- `, `* ` (ul) / `1. ` (ol) / `> ` (blockquote) / ```` ``` ```` (pre/code 블록)
     - 인라인: `**bold**`, `*italic*`, `` `code` ``, `[text](url)` (URL 검증 필수)
   - 렌더러: 모든 노드를 `document.createElement` + `textContent` 로 생성. 절대 `innerHTML` 사용 금지.
   - **XSS 방어 검증** (반드시 단위 테스트로 검증):
     - 입력 `<script>alert(1)</script>` → 텍스트로 escape (실행 X)
     - 입력 `[clickme](javascript:alert(1))` → `<a>` 생성 안 함, `clickme` 텍스트만
     - 입력 `<img src=x onerror=...>` → 텍스트로 escape
   - 라이브러리 형태로 export 하되, 단순함 유지: 외부 의존성 0

4. **`notes.js`** — API wrapper:
   - `notes.list(spaceId, opts)`, `.create(spaceId, payload)`, `.get(spaceId, id)`, `.update(spaceId, id, patch)`, `.remove(spaceId, id)`
   - 카드 렌더 헬퍼 `renderNoteCard(note, { onClick, onTogglePin })`
   - Phase 1 의 `authFetch` 재사용

5. **CSS** (`my-space-note.css`):
   - `--color-freeform-*` 토큰 사용 (Worker C 가 추가)
   - editor / preview split, 미리보기 영역 typography (h1/h2/h3, code 블록 배경 등)

### Verify
- `grep -n "innerHTML" frontend/src/js/my-space/{notes,markdown}.js frontend/src/js/pages/my-space-note*.js` → **빈 결과**
- 단위 테스트(자유 형식, jest 프론트엔드 테스트 인프라 없으면 Playwright 안에서 `page.evaluate` 로 검증) — XSS 3종 케이스

---

## Worker C — Glue & QA

**Branch suffix**: `note-glue`
**소유 파일**:
- `frontend/nginx.conf` (확장)
- `frontend/src/css/my-space-tokens.css` (`--color-freeform-*` 추가)
- `frontend/src/js/pages/my-space.js` (template-aware 분기에 `freeform` 추가)
- `qa/my-space-notes.spec.js` (신규)

### 작업 항목

1. **nginx**:
   ```
   location = /my-space/notes        { try_files /pages/my-space-notes.html =404; }
   location = /my-space/notes/new    { try_files /pages/my-space-note-edit.html =404; }
   location ~ ^/my-space/notes/\d+$  { try_files /pages/my-space-note-edit.html =404; }
   ```

2. **토큰** (`my-space-tokens.css` 확장):
   - `--color-freeform`, `--color-freeform-hover`, `--color-freeform-dim`, `--color-freeform-border`, `--color-freeform-glow`, `--color-freeform-text`
   - 컬러 계열: 블루/퍼플 (예: 다크 `#7C5CFF`, 라이트 `#5B3FE0`) — 일기(amber)/레시피(green)와 명확히 구분
   - dark + light 두 모드 모두 정의

3. **대시보드 분기** (`my-space.js`):
   - 기존 diary/recipe 분기에 `freeform` 케이스 추가
   - `notes.list(spaceId)` 호출 (모듈 import) → 핀된 노트 1개 + 최근 노트 카드 렌더
   - "+ 새로 작성" → `/my-space/notes/new?spaceId=`

4. **Playwright** (`qa/my-space-notes.spec.js`):
   - 로그인 → My Space → 자유 형식 템플릿 카드 → space 이름 "메모장" → 생성
   - 대시보드 → "+ 새 노트" → 편집 화면
   - 제목 "테스트 노트" + 본문에 `# 헤더\n\n**굵게** *기울임* \`코드\`\n\n- 항목1\n- 항목2`
   - 미리보기 우측에 `<h1>헤더</h1>`, `<strong>굵게</strong>`, `<em>기울임</em>`, `<code>코드</code>`, `<ul><li>항목1</li><li>항목2</li></ul>` 가 렌더되었는지 DOM 체크
   - 700ms 대기 → 저장됨 확인
   - 핀 토글 → 목록 복귀 → "📌 고정" 섹션에 노출 확인
   - **XSS 회귀**: 본문에 `<script>window.x=1</script>` 추가 후 미리보기 영역에서 `window.x` 가 `undefined` 인지 `page.evaluate` 로 확인
   - **링크 검증 회귀**: 본문에 `[click](javascript:alert(1))` 추가 후 미리보기에 `<a>` 가 생성되지 않았는지 확인 (텍스트만 노출)

### Verify
- `npx playwright test qa/` 전부 통과
- 콘솔 에러 0

---

## 머지 / Synthesis 순서

1. Worker A → main
2. Worker B → main
3. Worker C → main
4. `docker compose down -v && build && up -d` + healthcheck
5. `npm --prefix backend test`
6. `npx playwright test qa/`

---

## Done 정의 (Phase 2 — Notes)

- [ ] Note 5개 엔드포인트 + pinned 정렬 + 인증/소유자 검증
- [ ] 마크다운 미리보기 (`innerHTML` 0)
- [ ] XSS 회귀 3건 통과 (`<script>`, `javascript:` URL, `<img onerror>`)
- [ ] 핀 토글 동작 + 목록 재정렬
- [ ] 자동저장 (debounce 500ms + 3회 백오프)
- [ ] `--color-freeform-*` 토큰 dark/light 양쪽 정의
- [ ] Playwright note happy path 통과
- [ ] `docs/architecture/api-reference.md` 에 `/api/my-space/:spaceId/notes` 섹션 추가
- [ ] `docs/prd/my-space.md` §10 Phasing — Phase 2 (Notes 한정) ✓ 표기

---

## 미루는 항목 (Phase 2 스코프 외)

PRD §10 Phase 2 항목 중 본 페이즈에서 다루지 않는 것:
- 이미지 업로드 (레시피 커버, 일기 첨부)
- Space 다중 생성 / 템플릿 추가 UI
- 통합 검색 (diary/recipe/note)

→ [my-space-phase-3-extras.md](./my-space-phase-3-extras.md) 참조
