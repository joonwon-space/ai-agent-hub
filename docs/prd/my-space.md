# PRD — My Space (개인 공간)

_Last updated: 2026-05-03_
_Owner: jwon3711@gmail.com_
_Design source: `/Users/joonwonlee/Downloads/AI Agent Hub Design System.zip` (HANDOFF.md + 5 screen mockups)_

---

## 1. 배경 / 목표

AI Agent Hub는 현재 외부 도구 자동화(Jira) 위주의 에이전트 허브이다. 여기에 사용자가 **자신의 콘텐츠(일기·레시피·자유 노트)** 를 직접 작성·축적할 수 있는 개인 공간(My Space)을 추가한다.

### Goals
- G1. 사용자가 1개 이상의 템플릿을 골라 본인만의 워크스페이스(Space)를 가질 수 있다.
- G2. 3가지 템플릿(일기장 / 레시피 / 자유 형식)을 지원한다.
- G3. 작성한 콘텐츠는 PostgreSQL에 영속화되며 본인만 접근할 수 있다.
- G4. 기존 디자인 시스템 토큰을 그대로 사용하고, 템플릿별 accent 컬러로 시각적 구분한다.

### Non-goals (out of scope)
- N1. 다중 사용자 공유/공동 편집 (현재 시스템은 단일 사용자용)
- N2. 공개 페이지(외부 공유 URL) — 추후 별도 PRD
- N3. 실시간 동기화 / WebSocket
- N4. 모바일 네이티브 앱 (반응형은 추후 단계)
- N5. AI 기반 자동완성/추천 (Phase 2 이후)

---

## 2. 사용자 / 시나리오

본 서비스는 단일 사용자(self-hosted)이지만, 향후 다중 사용자 확장을 고려해 모든 데이터는 `userId`로 격리한다.

### 핵심 시나리오
1. 처음 방문 → 사이드바 "My Space" 클릭 → 온보딩 화면(템플릿 3개 카드) → 일기장 선택 → 빈 대시보드.
2. 매일 저녁: 대시보드 "+ 새로 작성" → 날짜·감정 태그·본문 입력 → 자동저장 → 목록 복귀.
3. 주말 요리: 레시피 템플릿 → 카드 그리드 → 상세 페이지 → 재료 체크하며 요리.
4. 자유 형식: 마크다운 노트로 사용 (Phase 1.5 이상).

---

## 3. 정보 구조 / 라우팅

기존 frontend 패턴(multi-page, `pages/*.html` + `src/js/pages/*.js`)을 따른다.

| 경로 | 화면 | 핸드오프 매핑 |
|------|------|---------------|
| `/my-space` | 랜딩 / 온보딩 (Space 미생성 시) 또는 대시보드 리다이렉트 | 화면 01 |
| `/my-space/dashboard` | Space 대시보드 (최근 항목 목록) | 화면 02 |
| `/my-space/diary/new` | 일기 작성 | 화면 03 |
| `/my-space/diary/:id` | 일기 보기/편집 | 화면 03 (편집 모드) |
| `/my-space/recipes` | 레시피 카드 목록 | 화면 04 |
| `/my-space/recipes/new` | 레시피 신규 작성 | 화면 05 |
| `/my-space/recipes/:id` | 레시피 상세/편집 | 화면 05 |
| `/my-space/notes` | 자유 형식 노트 목록 (Phase 2) | — |
| `/my-space/notes/:id` | 자유 노트 작성/편집 (Phase 2) | — |

> **사이드바 변경**: `Personal` 섹션 + `My Space` 항목(NEW 배지) 추가. HANDOFF.md §"사이드바 변경 사항" 참조.

---

## 4. 데이터 모델 (Prisma)

기존 `schema.prisma`에 다음을 추가한다.

```prisma
// Space — 사용자별 워크스페이스. 1 user → N spaces (Phase 1은 사실상 1개).
model Space {
  id        Int      @id @default(autoincrement())
  userId    Int
  name      String                       // 사용자 입력 타이틀
  template  String                       // 'diary' | 'recipe' | 'freeform'
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  diaryEntries DiaryEntry[]
  recipes      Recipe[]
  notes        FreeformNote[]

  @@index([userId])
}

model DiaryEntry {
  id        Int      @id @default(autoincrement())
  spaceId   Int
  entryDate DateTime @db.Date              // 사용자가 선택한 날짜 (yyyy-MM-dd)
  mood      String?                        // 'happy' | 'sad' | 'angry' | 'tired' | null
  title     String
  body      String   @db.Text              // 일기 본문 (markdown 또는 plain)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  space     Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@index([spaceId, entryDate])
}

model Recipe {
  id          Int      @id @default(autoincrement())
  spaceId     Int
  name        String
  category    String                       // '한식' | '양식' | '디저트' | '기타'
  cookTimeMin Int?                         // 예상 시간(분)
  difficulty  String                       // 'easy' | 'medium' | 'hard'
  servings    Int?
  description String?  @db.Text
  ingredients Json                         // [{ name: string, amount: string }]
  steps       Json                         // [{ order: int, text: string }]
  coverImage  String?                      // base64 또는 URL (Phase 1: nullable)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  space       Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@index([spaceId, category])
}

model FreeformNote {
  id        Int      @id @default(autoincrement())
  spaceId   Int
  title     String
  body      String   @db.Text              // markdown
  pinned    Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  space     Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@index([spaceId])
}
```

`User` 모델에 다음 관계를 추가:
```prisma
spaces Space[]
```

### 마이그레이션
신규 마이그레이션 1개: `20260503_add_my_space`. 기존 데이터 영향 없음 (신규 테이블만 추가).

---

## 5. API 계약

base path: `/api/my-space`. 모든 엔드포인트는 `requireAuth` 미들웨어 필수. 응답 envelope은 기존 컨벤션 유지(`{ data | error }` 또는 raw object — 현행 코드와 통일).

### 5.1 Space

| Method | Path | 설명 |
|--------|------|------|
| GET    | `/api/my-space` | 현재 사용자의 Space 목록(없으면 빈 배열) |
| POST   | `/api/my-space` | Space 생성 — body: `{ name, template }` |
| PATCH  | `/api/my-space/:id` | Space 수정 — body: `{ name? }` |
| DELETE | `/api/my-space/:id` | Space 삭제 (cascade) |

### 5.2 Diary

| Method | Path | 설명 |
|--------|------|------|
| GET    | `/api/my-space/:spaceId/diary` | 일기 목록 (정렬: `entryDate desc`, 페이지네이션 `?limit=20&cursor=`) |
| POST   | `/api/my-space/:spaceId/diary` | 신규 — body: `{ entryDate, mood?, title, body }` |
| GET    | `/api/my-space/:spaceId/diary/:id` | 단건 |
| PATCH  | `/api/my-space/:spaceId/diary/:id` | 수정 (자동저장에서 호출) |
| DELETE | `/api/my-space/:spaceId/diary/:id` | 삭제 |

### 5.3 Recipe

| Method | Path | 설명 |
|--------|------|------|
| GET    | `/api/my-space/:spaceId/recipes?category=` | 카테고리별 필터 |
| POST   | `/api/my-space/:spaceId/recipes` | 신규 |
| GET    | `/api/my-space/:spaceId/recipes/:id` | 단건 |
| PATCH  | `/api/my-space/:spaceId/recipes/:id` | 수정 |
| DELETE | `/api/my-space/:spaceId/recipes/:id` | 삭제 |

### 5.4 Freeform Note (Phase 2)

DiaryEntry/Recipe와 동일 패턴.

### 검증 규칙 (백엔드)
- `template` ∈ `{'diary','recipe','freeform'}`
- `name`: 1~80자
- `entryDate`: ISO date 문자열, 미래 365일 이내
- `mood`: nullable, 정해진 enum 외 값은 reject
- `title`: 1~120자
- `body`: 0~50,000자
- `category`: 1~24자
- `difficulty` ∈ `{'easy','medium','hard'}`
- `ingredients`: 배열, 각 원소 `{ name: 1~80자, amount: 0~40자 }`, 최대 50개
- `steps`: 배열, `{ order: int>=1, text: 1~1000자 }`, 최대 50개

모든 입력 검증은 라우트 진입 시점 수행. 실패 시 400 + `{ error: 'Validation failed', details: {...} }`.

---

## 6. 프론트엔드 모듈 구조

기존 `frontend/` 컨벤션 유지. SPA 도입하지 않음.

```
frontend/
├── pages/
│   ├── my-space.html              # /my-space (랜딩 + 대시보드 토글)
│   ├── my-space-diary-edit.html   # /my-space/diary/new, /diary/:id
│   ├── my-space-recipes.html      # /my-space/recipes 목록
│   └── my-space-recipe-edit.html  # /my-space/recipes/new, /recipes/:id
├── src/
│   ├── css/
│   │   ├── my-space.css           # My Space 공통 (inner sidebar, 카드 등)
│   │   └── my-space-tokens.css    # diary/recipe accent 토큰 (HANDOFF.md §컬러 참조)
│   └── js/
│       ├── pages/
│       │   ├── my-space.js
│       │   ├── my-space-diary-edit.js
│       │   ├── my-space-recipes.js
│       │   └── my-space-recipe-edit.js
│       └── my-space/
│           ├── api.js             # CRUD wrapper (fetch + authFetch)
│           ├── autosave.js        # debounced PATCH (500ms)
│           ├── markdown.js        # 최소 마크다운 렌더 (자유 형식용, Phase 2)
│           └── components.js      # 공통 카드/배지 렌더 헬퍼
```

### nginx 라우팅 변경
`/my-space*` 경로를 `pages/my-space*.html` 로 매핑. `nginx.conf` 의 try_files 규칙 추가.

### 폰트
HANDOFF.md 가 제공한 `PretendardVariable.ttf` 는 **사용하지 않음** — 기존 `main.css` 가 jsdelivr 의 dynamic-subset 을 임포트 중이므로 동일 방식 유지(번들 크기 절감).

---

## 7. 인증 / 권한

- 모든 `/api/my-space/*` 엔드포인트: `requireAuth` 미들웨어 적용 (기존 패턴 동일).
- 라우트 핸들러는 진입 시 **`spaceId` 의 소유자 == `req.user.id` 검증** 후에만 진행. 다른 사용자 데이터 접근 시 404 (정보 누출 방지, 403 아님).
- `DiaryEntry.id`, `Recipe.id` 도 마찬가지로 `space.userId` 까지 거슬러 검증.

---

## 8. 자동저장 / 충돌

- 일기·레시피 편집 화면: 본문 변경 후 **debounce 500ms** → `PATCH` 호출.
- 인디케이터 상태: `idle` / `saving` / `saved` / `error`.
- Phase 1 은 단일 클라이언트 가정 → 충돌 해결 없음 (last-write-wins).
- 네트워크 실패 시 3회 지수 백오프, 그래도 실패면 `error` 상태 + 사용자에게 토스트.

---

## 9. 비기능 요구사항

| 항목 | 목표 |
|------|------|
| API p95 | 200ms 이내 (DB 인덱스 사용 전제) |
| 일기 1건 본문 최대 | 50,000자 |
| 페이지 첫 렌더 | 200ms 이내 (정적 HTML + 1 fetch) |
| 보안 | OWASP Top 10 — 입력 검증, 소유자 검증, XSS escape (innerHTML 금지) |
| 접근성 | 색상 대비 WCAG AA, 모든 인터랙티브 요소 키보드 포커스 가능 |
| 테스트 | 백엔드 라우트 통합 테스트(Jest+Supertest), Playwright E2E 1개 시나리오 |

---

## 10. Phasing

### Phase 1 — ✓ Done
- 데이터 모델 + 마이그레이션 (Space, DiaryEntry, Recipe, FreeformNote)
- Space CRUD + Diary CRUD API
- 사이드바 변경 (Personal 섹션 + NEW 배지)
- 화면 01 (온보딩) + 화면 02 (대시보드, 일기 한정) + 화면 03 (일기 작성)
- 자동저장 (500ms debounce + 3x 지수 백오프)
- 통합 테스트 + Playwright happy path

### Phase 1.5 — ✓ Done
- Recipe CRUD API + 화면 04 (목록, 카테고리 탭) + 화면 05 (작성·편집, 재료·단계 행)
- 카테고리/난이도 필터 (`?category=` 쿼리 파라미터)
- 재료 체크박스 클라이언트 상태 (저장 X)
- 통합 테스트 9개 추가

### Phase 2 (Notes + Markdown) — ✓ Done
- Freeform Note CRUD API + 화면 06 (목록) + 화면 07 (작성·편집)
- 직접 구현 마크다운 렌더러 (`markdown.js`, 외부 라이브러리 없음, XSS sanitize)
- 핀 고정 (`pinned`) 지원, 정렬: `pinned desc, updatedAt desc`
- `--color-freeform-*` CSS 토큰 추가
- 통합 테스트 7개 추가

### Phase 2 나머지 — 백로그 (미구현)
아래 항목은 구현되지 않았으며 `docs/plan/my-space-phase-3-extras.md`에 백로그로 이관되었습니다:
- 이미지 업로드 (레시피 커버, 일기 첨부) — 기존 `/api/upload` 확장 또는 별도 정책
- Space 다중 생성 / 멀티-Space UI
- 전문 검색 (full-text search)

---

## 11. 리스크

| 리스크 | 영향 | 완화책 |
|--------|------|--------|
| Prisma JSON 컬럼 검증 누락 | 손상된 ingredients/steps | 라우트 레벨 schema 검증, 저장 전 정규화 |
| innerHTML 사용 → XSS | 본문에 `<script>` 삽입 | `textContent` 사용 / 마크다운은 sanitizer 적용 |
| 자동저장 폭주 | DB 부하 | debounce + min-interval 1s |
| 마이그레이션 실패 | 배포 차단 | 새 테이블만 추가 → 롤백 = drop tables |
| 디자인 토큰 충돌 | 기존 dashboard 영향 | `--color-diary-*`, `--color-recipe-*` 신규 prefix만 사용 |
