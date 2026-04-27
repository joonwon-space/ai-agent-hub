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
│   │   │   ├── agents.js  # GET /api/agents, POST /api/agents/:name/preview|run
│   │   │   ├── auth.js    # GET /api/auth/setup-required|me, POST /api/auth/register|login|logout
│   │   │   ├── settings.js # GET|PUT /api/settings
│   │   │   └── upload.js  # POST /api/upload
│   │   ├── agents/        # 에이전트 구현
│   │   │   ├── base.js
│   │   │   └── jiraAgent.js
│   │   ├── middleware/
│   │   │   └── auth.js    # requireAuth 미들웨어
│   │   ├── services/
│   │   │   ├── db.js      # Prisma 싱글톤
│   │   │   └── ollama.js  # Ollama LLM 호출
│   │   └── utils/
│   │       └── crypto.js  # AES-256-GCM 암호화
│   ├── __tests__/         # Jest + Supertest 통합 테스트
│   │   ├── auth.register.test.js
│   │   ├── auth.login.test.js
│   │   └── settings.test.js
│   ├── prisma/
│   │   └── schema.prisma  # User, UserSetting, Session 모델
│   └── Dockerfile
├── frontend/              # Nginx + Vanilla JS
│   ├── public/
│   │   └── index.html     # 메인 대시보드
│   ├── pages/
│   │   ├── login.html     # 로그인 페이지
│   │   ├── signup.html    # 회원가입 페이지
│   │   └── settings.html  # Jira 설정 페이지
│   ├── src/
│   │   ├── css/main.css
│   │   ├── css/auth.css        # 인증 페이지 공유 CSS 변수
│   │   └── js/
│   │       ├── auth.js         # login, logout, getMe, authFetch
│   │       ├── api.js          # authFetch 기반 API 래퍼
│   │       ├── main.js         # 앱 진입점
│   │       ├── theme.js        # localStorage 기반 다크/라이트 토글
│   │       ├── agents/jira.js  # Jira 에이전트 UI
│   │       └── pages/
│   │           ├── login.js    # 로그인 페이지 로직
│   │           ├── signup.js   # 회원가입 페이지 로직
│   │           └── settings.js # 설정 페이지 로직
│   ├── nginx.conf         # 정적 서빙 + /api/* → backend 프록시
│   └── Dockerfile
├── qa/                    # Playwright E2E 테스트
│   ├── visual-qa.spec.js  # 로그인·설정 페이지 E2E
│   └── playwright.config.js
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

## 테스트

### 통합 테스트 (Jest + Supertest)

```bash
cd backend
npm test
```

`backend/__tests__/` 아래 세 개의 테스트 파일이 있습니다:

| 파일 | 커버 범위 |
|------|-----------|
| `auth.register.test.js` | 회원가입 성공·실패·중복 이메일 |
| `auth.login.test.js` | 로그인 성공·잘못된 비밀번호·빠진 필드 |
| `settings.test.js` | GET/PUT upsert·암호화·마스킹·삭제 |

테스트는 `createApp` 팩토리를 사용해 PgSession 없이 MemoryStore로 앱을 생성합니다.

### E2E 테스트 (Playwright)

```bash
cd qa
npx playwright install
npm test
```

`qa/visual-qa.spec.js`는 로그인 플로우와 설정 페이지 렌더링을 브라우저 수준에서 검증합니다.

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
