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
│   │   │   └── upload.js  # POST /api/upload
│   │   ├── agents/        # 에이전트 구현
│   │   │   ├── base.js
│   │   │   └── jiraAgent.js
│   │   ├── services/
│   │   │   └── ollama.js  # Ollama LLM 호출
│   │   └── middleware/    # 향후 인증 미들웨어 자리
│   └── Dockerfile
├── frontend/              # Nginx + Vanilla JS
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── css/main.css
│   │   └── js/
│   │       ├── api.js          # fetch 래퍼
│   │       ├── main.js         # 앱 진입점
│   │       └── agents/jira.js  # Jira 에이전트 UI
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
                                └── host.docker.internal:11434 (Ollama)
```

backend는 외부 포트 미노출 — nginx 프록시를 통해서만 접근 가능합니다.

## 시작하기

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 편집: JIRA_*, OLLAMA_* 값 입력

# 2. 실행
docker compose up --build

# 3. 접속
open http://localhost
```

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

  async run(input) {
    // 구현
    return { result: '...' };
  }
}

module.exports = MyAgent;
```

서버 재시작 시 자동으로 로드됩니다.

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `JIRA_BASE_URL` | Jira 도메인 | — |
| `JIRA_EMAIL` | Jira 계정 이메일 | — |
| `JIRA_API_TOKEN` | Jira API 토큰 | — |
| `JIRA_PROJECT_KEY` | Jira 프로젝트 키 | — |
| `OLLAMA_HOST` | Ollama 호스트 | `http://host.docker.internal:11434` |
| `OLLAMA_MODEL` | 사용할 모델 | `gemma4:e4b` |
