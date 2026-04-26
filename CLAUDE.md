# CLAUDE.md — ai-agent-hub

개인용 AI 에이전트 허브. Node.js + Express + Docker + Ollama 기반으로 다양한 AI 에이전트를 호스팅한다.

## 프로젝트 구조

```
ai-agent-hub/
├── src/
│   ├── index.js          # Express 앱 진입점 (포트 3100)
│   ├── agentLoader.js    # 에이전트 로드/관리
│   └── agents/           # 에이전트 정의 파일들
├── static/               # 프론트엔드 (vanilla JS)
├── docker-compose.yml
└── Dockerfile
```

## 개발 환경

```bash
npm run dev          # nodemon으로 개발 서버 실행 (포트 3100)
docker compose up    # Docker로 실행
```

**패키지 매니저**: npm

## 코딩 컨벤션

- **언어**: JavaScript (Node.js) — TypeScript 미사용
- **에러 처리**: 모든 async 함수는 try/catch, Express에서 `next(err)` 전달
- **환경 변수**: 시크릿은 반드시 `.env` + `process.env.*` — 소스에 하드코딩 금지
- **SQL**: 파라미터화된 쿼리 사용 (`$1`, `$2` 방식) — 문자열 연결 금지
- **API 응답**: `{ data, error, status }` 일관된 구조 유지
- **파일 크기**: 단일 파일 800줄 초과 금지 — 책임별로 모듈 분리

## 보안 원칙

- 모든 외부 입력 검증 필수 (req.body, req.params, req.query)
- API 엔드포인트에 인증 미들웨어 누락 금지
- `npm audit` 경고는 즉시 확인
- `.env` 파일은 `.gitignore`에 반드시 포함

---

## Claude Code 자산 가이드

`.claude/` 디렉토리에 아래 자산들이 설치되어 있다. (출처: [everything-claude-code](https://github.com/affaan-m/everything-claude-code))

### Skills (컨텍스트 주입)

코드 작성 중 관련 패턴을 참조할 때 활성화된다.

| 스킬 | 언제 활용 |
|------|----------|
| `backend-patterns` | Express API 설계, 레포지토리 패턴, N+1 방지, 미들웨어 구현 시 |
| `docker-patterns` | Dockerfile/Compose 수정, 컨테이너 보안, 볼륨/네트워크 설정 시 |
| `git-workflow` | 브랜치 전략, 커밋 메시지 컨벤션 결정 시 |
| `tdd-workflow` | 테스트 코드 작성, 80%+ 커버리지 달성 시 |
| `postgres-patterns` | SQL 작성, 스키마 설계, 인덱싱 최적화 시 |
| `database-migrations` | DB 마이그레이션 작성, 롤백 전략 수립 시 |
| `security-review` | API 엔드포인트 보안 점검, OWASP 체크리스트 적용 시 |

### Commands (슬래시 커맨드)

| 커맨드 | 용도 |
|--------|------|
| `/plan` | 새 기능 개발 전 구현 계획 수립 — 확인 전 코드 작성 안 함 |
| `/feature-dev` | 전체 기능 개발 워크플로우 (discovery → design → impl → review) |
| `/code-review` | 로컬 변경사항 또는 PR 리뷰 |
| `/review-pr [번호]` | 멀티 에이전트 종합 PR 리뷰 |
| `/test-coverage` | 커버리지 분석 및 누락 테스트 자동 생성 |
| `/refactor-clean` | 데드 코드 안전하게 제거 |

### Agents (서브에이전트)

| 에이전트 | 역할 |
|----------|------|
| `code-reviewer` | 코드 품질/보안/패턴 리뷰 (confidence ≥ 80 기준) |
| `security-reviewer` | OWASP Top 10, 시크릿 누출, 인젝션 탐지 |
| `database-reviewer` | SQL/스키마/인덱스/RLS 검토 |
| `build-error-resolver` | 빌드 에러 최소 diff로 수정 |
| `performance-optimizer` | API 지연, 메모리 누수, N+1 최적화 |

---

## 향후 추가 예정 기능

- PostgreSQL 연동 (인증, 설정 관리, 에이전트 메타데이터)
- 사용자 인증 (JWT 또는 세션)
- 에이전트 설정 관리 UI
- 추가 에이전트 (Jira 외 다양한 통합)
