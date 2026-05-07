# AI Agent Hub

개인용 AI 에이전트 허브. Ollama 기반 LLM으로 Jira 이슈 자동 생성 등 반복 작업을 자동화합니다.

## 구조

```
ai-agent-hub/
├── backend/               # Node.js + Express API 서버
│   ├── src/
│   │   ├── index.js       # 진입점 (포트 3000, 내부 전용)
│   │   ├── createApp.js   # Express 앱 팩토리 (테스트용 분리)
│   │   ├── routes/        # API 라우트
│   │   │   ├── agents.js       # GET /api/agents, POST /api/agents/:name/preview|run
│   │   │   ├── aiAssist.js     # POST /api/ai/assist/recipe|diary (AI 자연어 추출)
│   │   │   ├── auth.js         # GET /api/auth/setup-required|me, POST /api/auth/register|login|logout
│   │   │   ├── mySpace.js      # /api/my-space/* (Space + Diary + Recipe + Note CRUD)
│   │   │   ├── mySpaceSearch.js # GET /api/my-space/search
│   │   │   ├── recipeUpload.js # POST|DELETE /api/my-space/:spaceId/recipes/:id/cover
│   │   │   ├── settings.js     # GET|PUT /api/settings
│   │   │   └── upload.js       # POST /api/upload
│   │   ├── agents/        # 에이전트 구현
│   │   │   ├── base.js
│   │   │   └── jiraAgent.js
│   │   ├── middleware/
│   │   │   └── auth.js    # requireAuth 미들웨어
│   │   ├── services/
│   │   │   ├── db.js              # Prisma 싱글톤
│   │   │   ├── mySpaceValidation.js # My Space 입력 검증 헬퍼
│   │   │   ├── ollama.js          # Ollama LLM 호출
│   │   │   ├── ollamaAssist.js    # AI Assist 프롬프트 래퍼
│   │   │   └── searchSnippet.js   # 검색 스니펫 생성 헬퍼
│   │   └── utils/
│   │       └── crypto.js  # AES-256-GCM 암호화
│   ├── __tests__/         # Jest + Supertest 통합 테스트 (74 tests, 9 suites)
│   │   ├── aiAssist.test.js       # AI Assist 레시피·일기 추출 (10 tests)
│   │   ├── auth.register.test.js
│   │   ├── auth.login.test.js
│   │   ├── mySpace.test.js        # Space + Diary CRUD
│   │   ├── mySpace.recipes.test.js # Recipe CRUD (11 tests)
│   │   ├── mySpace.notes.test.js   # Note CRUD (7 tests)
│   │   ├── mySpaceSearch.test.js   # 전문 검색 (7 tests)
│   │   ├── recipeUpload.test.js    # 커버 이미지 업로드 (8 tests)
│   │   └── settings.test.js
│   ├── prisma/
│   │   └── schema.prisma  # User, UserSetting, Session, Space, DiaryEntry, Recipe, FreeformNote
│   └── Dockerfile
├── frontend/              # Nginx + Vanilla JS
│   ├── pages/
│   │   ├── login.html                # 로그인 페이지
│   │   ├── signup.html               # 회원가입 페이지
│   │   ├── settings.html             # Jira 설정 페이지
│   │   ├── my-space.html             # My Space 랜딩 / 온보딩 / 대시보드
│   │   ├── my-space-diary-edit.html  # 일기 작성·편집 (Screen 03)
│   │   ├── my-space-recipes.html     # 레시피 목록 (Screen 04)
│   │   ├── my-space-recipe-edit.html # 레시피 작성·편집 (Screen 05)
│   │   ├── my-space-recipe-view.html # 레시피 상세 뷰 (Screen 05b)
│   │   ├── my-space-notes.html       # 노트 목록 (Screen 06)
│   │   └── my-space-note-edit.html   # 노트 작성·편집 (Screen 07)
│   ├── src/
│   │   ├── css/
│   │   │   ├── main.css              # 앱 전역 디자인 토큰 (≥1280px 960px 레이아웃 포함)
│   │   │   ├── auth.css              # 인증 페이지 공유 CSS 변수
│   │   │   ├── my-space.css          # My Space 공통 스타일
│   │   │   ├── my-space-tokens.css   # diary/recipe/freeform accent 토큰
│   │   │   ├── my-space-jira.css     # Jira 연동 카드 스타일
│   │   │   ├── my-space-modal.css    # 공통 모달 스타일
│   │   │   ├── my-space-recipe.css   # 레시피 페이지 스타일
│   │   │   ├── my-space-recipe-view.css # 레시피 상세 뷰 스타일
│   │   │   ├── my-space-note.css     # 노트 페이지 스타일
│   │   │   └── my-space-search.css   # 검색 결과 스타일
│   │   └── js/
│   │       ├── auth.js         # login, logout, getMe, authFetch
│   │       ├── api.js          # authFetch 기반 API 래퍼
│   │       ├── theme.js        # localStorage 기반 다크/라이트 토글
│   │       ├── my-space/
│   │       │   ├── aiAssist.js       # AI Assist 공유 패널 모듈 (레시피·일기 연동)
│   │       │   ├── api.js            # Space/Diary/Recipe/Note CRUD 래퍼
│   │       │   ├── autosave.js       # 500ms debounce + 3x 지수 백오프
│   │       │   ├── components.js     # 공통 카드/배지 렌더 헬퍼 (innerHTML 금지)
│   │       │   ├── deleteSpaceModal.js # Space 삭제 확인 모달
│   │       │   ├── jira.js           # Jira 연동 카드 UI
│   │       │   ├── markdown.js       # 직접 구현 마크다운 렌더러 (XSS sanitize)
│   │       │   ├── notes.js          # Note API 래퍼
│   │       │   ├── recipes.js        # Recipe API 래퍼
│   │       │   └── search.js         # 전문 검색 UI
│   │       └── pages/
│   │           ├── login.js              # 로그인 페이지 로직
│   │           ├── signup.js             # 회원가입 페이지 로직
│   │           ├── settings.js           # 설정 페이지 로직
│   │           ├── my-space.js           # 온보딩 / 대시보드 컨트롤러
│   │           ├── my-space-diary-edit.js # 일기 편집 (자동저장 + AI Assist)
│   │           ├── my-space-recipes.js   # 레시피 목록 컨트롤러
│   │           ├── my-space-recipe-edit.js # 레시피 편집 (자동저장 + AI Assist)
│   │           ├── my-space-recipe-view.js # 레시피 상세 뷰
│   │           ├── my-space-notes.js     # 노트 목록 컨트롤러
│   │           └── my-space-note-edit.js # 노트 편집 (자동저장)
│   ├── nginx.conf         # 정적 서빙 + /api/* → backend 프록시 + /my-space/* 라우팅
│   └── Dockerfile
├── qa/                    # Playwright E2E 테스트
│   ├── live-site-qa.spec.js       # 라이브 사이트 기본 렌더링 E2E
│   ├── visual-qa.spec.js          # 로그인·설정 렌더링 E2E
│   ├── my-space.spec.js           # Phase 1: My Space 온보딩·일기 플로우 E2E
│   ├── my-space-a11y.spec.js      # 접근성(a11y) 검증 E2E
│   ├── my-space-recipes.spec.js   # Phase 1.5: Recipe 플로우 E2E
│   ├── my-space-recipe-cover.spec.js # 커버 이미지 업로드 E2E
│   ├── my-space-recipe-view.spec.js  # 레시피 상세 뷰 E2E
│   ├── my-space-notes.spec.js     # Phase 2: FreeformNote 플로우 E2E
│   ├── my-space-search.spec.js    # 전문 검색 E2E
│   ├── my-space-space-mgmt.spec.js # Space 생성·삭제 관리 E2E
│   ├── package.json
│   └── playwright.config.js
├── docs/
│   ├── architecture/
│   │   ├── overview.md        # 아키텍처 개요 (데이터 모델, 서비스 구조)
│   │   ├── api-reference.md   # 전체 API 레퍼런스 (라우트 + 에이전트 스키마)
│   │   └── analysis.md        # 기술 분석 문서
│   └── prd/
│       └── my-space.md        # My Space PRD
├── docker-compose.yml
└── .env.example
```

## 네트워크 구조

```
[브라우저] → frontend:80 (nginx)
                ├── 정적 파일 서빙 (HTML, CSS, JS)
                └── /api/* → backend:3000 (내부 전용)
                                └── db:5432 (PostgreSQL, 내부 전용)
                                └── host.docker.internal:11434 (Ollama)
```

backend와 db는 외부 포트 미노출 — nginx 프록시를 통해서만 접근 가능합니다.

## 시작하기

### 1. 환경변수 설정

```bash
cp .env.example .env
```

`.env`를 열고 아래 값들을 채웁니다:

```bash
# 각각 openssl rand -hex 32 로 생성
SESSION_SECRET=<생성된 값>
ENCRYPTION_KEY=<생성된 값>

# Ollama 호스트 (기본값 유지 가능)
OLLAMA_HOST=http://host.docker.internal:11434
OLLAMA_MODEL=gemma4:e4b
```

### 2. 실행

```bash
docker compose up --build
```

### 3. 첫 실행 — 계정 생성

1. 브라우저에서 `http://localhost` 접속
2. `/login` 페이지로 자동 리다이렉트됨
3. 로그인 페이지 하단의 **계정 만들기** 링크 → `/signup` 으로 이동
4. 이메일과 비밀번호(8자 이상) 입력 후 계정 생성 시 자동 로그인되어 대시보드로 이동

### 4. Jira 설정

1. 우상단 **설정** 클릭 → `/settings` 이동
2. Jira Base URL, 이메일, API 토큰, 프로젝트 키 입력
3. **저장** — API 토큰은 AES-256-GCM으로 암호화 저장됨
4. 이후 Jira 에이전트 실행 시 DB에서 설정을 자동으로 읽어 사용

## My Space 기능

사이드바 Personal 섹션에서 접근하는 개인 워크스페이스. 아래 세 가지 템플릿을 지원합니다.

| 템플릿 | 설명 | 화면 |
|--------|------|------|
| **Diary** (일기장) | 날짜·감정 태그·본문 작성, 자동저장, AI 자연어 입력 | Screen 01–03 |
| **Recipe** (레시피) | 카테고리/난이도 필터, 재료·단계 편집, 커버 이미지, 자동저장, AI 자연어 입력 | Screen 04–05b |
| **Freeform Note** (자유 노트) | 마크다운 작성·렌더링(직접 구현), 핀 고정 | Screen 06–07 |

### My Space 프론트엔드 경로 (nginx)

| 경로 | 서빙 파일 | 설명 |
|------|-----------|------|
| `/my-space` | `my-space.html` | 랜딩 / 온보딩 / 대시보드 |
| `/my-space/diary/new`, `/my-space/diary/:id` | `my-space-diary-edit.html` | 일기 작성·편집 |
| `/my-space/recipes` | `my-space-recipes.html` | 레시피 목록 |
| `/my-space/recipes/new`, `/my-space/recipes/:id` | `my-space-recipe-edit.html` | 레시피 작성·편집 |
| `/my-space/recipes/:id/view` | `my-space-recipe-view.html` | 레시피 상세 뷰 |
| `/my-space/notes` | `my-space-notes.html` | 노트 목록 |
| `/my-space/notes/new`, `/my-space/notes/:id` | `my-space-note-edit.html` | 노트 작성·편집 |

### My Space API 경로 (`/api/my-space`)

모든 엔드포인트는 세션 인증 필수. `spaceId` 소유자 불일치 시 404 반환(정보 누출 방지).

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/my-space` | Space 목록 |
| POST | `/api/my-space` | Space 생성 |
| PATCH | `/api/my-space/:id` | Space 이름 수정 |
| DELETE | `/api/my-space/:id` | Space 삭제 (cascade) |
| GET | `/api/my-space/search` | 전문 검색 (`?q=` 키워드) |
| GET | `/api/my-space/:spaceId/diary` | 일기 목록 (cursor pagination) |
| POST | `/api/my-space/:spaceId/diary` | 일기 생성 |
| GET | `/api/my-space/:spaceId/diary/:id` | 일기 단건 |
| PATCH | `/api/my-space/:spaceId/diary/:id` | 일기 수정 (자동저장) |
| DELETE | `/api/my-space/:spaceId/diary/:id` | 일기 삭제 |
| GET | `/api/my-space/:spaceId/recipes` | 레시피 목록 (`?category=` 필터) |
| POST | `/api/my-space/:spaceId/recipes` | 레시피 생성 |
| GET | `/api/my-space/:spaceId/recipes/:id` | 레시피 단건 |
| PATCH | `/api/my-space/:spaceId/recipes/:id` | 레시피 수정 (자동저장) |
| DELETE | `/api/my-space/:spaceId/recipes/:id` | 레시피 삭제 |
| POST | `/api/my-space/:spaceId/recipes/:id/cover` | 레시피 커버 이미지 업로드 |
| DELETE | `/api/my-space/:spaceId/recipes/:id/cover` | 레시피 커버 이미지 삭제 |
| GET | `/api/my-space/:spaceId/notes` | 노트 목록 (pinned desc, updatedAt desc, cursor) |
| POST | `/api/my-space/:spaceId/notes` | 노트 생성 |
| GET | `/api/my-space/:spaceId/notes/:id` | 노트 단건 |
| PATCH | `/api/my-space/:spaceId/notes/:id` | 노트 수정 (자동저장) |
| DELETE | `/api/my-space/:spaceId/notes/:id` | 노트 삭제 |

### AI Assist API (`/api/ai`)

자연어 텍스트에서 구조화된 필드를 추출합니다. 세션 인증 필수.

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/ai/assist/recipe` | 자연어 텍스트 → 레시피 필드 추출 (제목·재료·단계 등) |
| POST | `/api/ai/assist/diary` | 자연어 텍스트 → 일기 필드 추출 (날짜·감정·본문) |

### 기타 API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/agents` | 에이전트 목록 |
| POST | `/api/agents/:name/preview` | 에이전트 입력 미리보기 |
| POST | `/api/agents/:name/run` | 에이전트 실행 |
| GET | `/api/auth/setup-required` | 최초 설정 필요 여부 확인 |
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 로그인 사용자 정보 |
| GET | `/api/settings` | 설정 조회 |
| PUT | `/api/settings` | 설정 저장 |
| POST | `/api/upload` | 범용 파일 업로드 |

전체 요청/응답 스펙은 [`docs/architecture/api-reference.md`](docs/architecture/api-reference.md)를 참고하세요.

---

## 아키텍처 문서

- [`docs/architecture/overview.md`](docs/architecture/overview.md) — 전체 아키텍처 개요, 데이터 모델, 서비스 구조
- [`docs/architecture/api-reference.md`](docs/architecture/api-reference.md) — 전체 API 레퍼런스 (모든 라우트 + 에이전트 스키마)

---

## 테스트

### 통합 테스트 (Jest + Supertest)

```bash
cd backend
npm test
```

`backend/__tests__/` 아래 9개의 테스트 파일, 총 **74개 테스트**가 있습니다:

| 파일 | 커버 범위 |
|------|-----------|
| `aiAssist.test.js` | AI Assist 레시피·일기 추출, 인증·입력 검증·Ollama 오류 (10 tests) |
| `auth.register.test.js` | 회원가입 성공·실패·중복 이메일 |
| `auth.login.test.js` | 로그인 성공·잘못된 비밀번호·빠진 필드 |
| `settings.test.js` | GET/PUT upsert·암호화·마스킹·삭제 |
| `mySpace.test.js` | Space + Diary CRUD |
| `mySpace.recipes.test.js` | Recipe CRUD (11 tests) |
| `mySpace.notes.test.js` | Note CRUD (7 tests) |
| `mySpaceSearch.test.js` | 전문 검색 (7 tests) |
| `recipeUpload.test.js` | 커버 이미지 업로드·삭제 (8 tests) |

테스트는 `createApp` 팩토리를 사용해 PgSession 없이 MemoryStore로 앱을 생성합니다.

### E2E 테스트 (Playwright)

```bash
cd qa
npx playwright install
npm test
```

`qa/` 아래 10개의 Playwright 스펙이 있습니다:

| 파일 | 커버 범위 |
|------|-----------|
| `live-site-qa.spec.js` | 라이브 사이트 기본 렌더링 |
| `visual-qa.spec.js` | 로그인 플로우, 설정 페이지 렌더링 |
| `my-space.spec.js` | Phase 1: My Space 온보딩, 일기 CRUD |
| `my-space-a11y.spec.js` | 접근성(a11y) 검증 |
| `my-space-recipes.spec.js` | Phase 1.5: Recipe 플로우 (생성·편집·삭제) |
| `my-space-recipe-cover.spec.js` | 커버 이미지 업로드·삭제 |
| `my-space-recipe-view.spec.js` | 레시피 상세 뷰 렌더링 |
| `my-space-notes.spec.js` | Phase 2: FreeformNote 플로우, XSS·링크 sanitize |
| `my-space-search.spec.js` | 전문 검색 (키워드·필터) |
| `my-space-space-mgmt.spec.js` | Space 생성·이름 수정·삭제 |

## 보안 기능

| 기능 | 내용 |
|------|------|
| Rate limiting | `/api/auth/login`, `/api/auth/register` 에 분당 5회 제한 (`express-rate-limit`) |
| Session fixation 방지 | 로그인·회원가입 성공 시 `session.regenerate()` 호출 |
| 전역 에러 핸들러 | Express 4-arg 미들웨어로 500 응답 반환, 스택 트레이스 미노출 |
| 설정 암호화 | `jira_api_token` 등 민감 키는 AES-256-GCM 암호화 후 DB 저장 |
| Docker healthcheck | `db`(pg_isready)·`backend`(HTTP probe) 헬스체크 — backend는 db 헬시 후 기동 |
| Ollama 타임아웃 | Axios 호출 30초 타임아웃, 응답의 마크다운 코드 펜스 자동 제거 |

## 에이전트 추가

`backend/src/agents/` 에 새 파일 생성 (BaseAgent 상속):

```js
const BaseAgent = require('./base');

class MyAgent extends BaseAgent {
  constructor() {
    super();
    this.name = 'my-agent';
    this.description = '...';
    this.inputSchema = [
      { key: 'input', label: '입력', type: 'textarea', placeholder: '...' },
    ];
  }

  async run(input, context) {
    // context.userId 로 현재 사용자 ID 접근 가능
    return { result: '...' };
  }
}

module.exports = MyAgent;
```

서버 재시작 시 자동으로 로드됩니다.

## 환경변수

| 변수 | 설명 | 생성 방법 |
|------|------|-----------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | docker-compose 내부 기본값 사용 |
| `SESSION_SECRET` | 세션 서명 키 | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 설정 값 암호화 키 (64 hex 문자) | `openssl rand -hex 32` |
| `OLLAMA_HOST` | Ollama 호스트 | 기본값: `http://host.docker.internal:11434` |
| `OLLAMA_MODEL` | 사용할 모델 | 기본값: `gemma4:e4b` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare 터널 토큰 (선택) | Cloudflare 대시보드 |
