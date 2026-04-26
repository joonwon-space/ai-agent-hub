# AI Agent Hub

개인용 AI 에이전트 허브. Ollama 기반 LLM으로 Jira 이슈 자동 생성 등 반복 작업을 자동화합니다.

## 구조

```
ai-agent-hub/
├── backend/               # Node.js + Express API 서버
│   ├── src/
│   │   ├── index.js       # 진입점 (포트 3000, 내부 전용)
│   │   ├── routes/        # API 라우트
│   │   │   ├── agents.js  # GET /api/agents, POST /api/agents/:name/preview|run
│   │   │   ├── auth.js    # POST /api/auth/login|register|logout, GET /api/auth/me
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
│   ├── prisma/
│   │   └── schema.prisma  # User, UserSetting, Session 모델
│   └── Dockerfile
├── frontend/              # Nginx + Vanilla JS
│   ├── public/
│   │   └── index.html     # 메인 대시보드
│   ├── pages/
│   │   ├── login.html     # 로그인 / 최초 계정 생성 페이지
│   │   └── settings.html  # Jira 설정 페이지
│   ├── src/
│   │   ├── css/main.css
│   │   └── js/
│   │       ├── auth.js         # login, logout, getMe, authFetch
│   │       ├── api.js          # authFetch 기반 API 래퍼
│   │       ├── main.js         # 앱 진입점
│   │       ├── agents/jira.js  # Jira 에이전트 UI
│   │       └── pages/
│   │           ├── login.js    # 로그인 페이지 로직
│   │           └── settings.js # 설정 페이지 로직
│   ├── nginx.conf         # 정적 서빙 + /api/* → backend 프록시
│   └── Dockerfile
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
3. 처음에는 **관리자 계정 생성** 모드 — 이메일과 비밀번호(8자 이상) 입력
4. 계정 생성 후 자동 로그인되어 대시보드로 이동

### 4. Jira 설정

1. 우상단 **설정** 클릭 → `/settings` 이동
2. Jira Base URL, 이메일, API 토큰, 프로젝트 키 입력
3. **저장** — API 토큰은 AES-256-GCM으로 암호화 저장됨
4. 이후 Jira 에이전트 실행 시 DB에서 설정을 자동으로 읽어 사용

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
