# My Space Jira Integration — Docker 환경 검증 요청

_요청일: 2026-05-05_
_요청자: 메인 개발 환경 (Docker daemon 비가동)_
_대상 브랜치: `team-implement-jira-integration/20260505-1104` (origin 푸시됨, **main 미머지**)_
_사양 문서: [docs/plan/my-space-jira-integration.md](../plan/my-space-jira-integration.md)_

본 문서는 Jira-as-template 통합(B안 + flow 1) 의 GO/NO-GO 판단을 위해 Docker 환경에서 검증해야 할 항목을 정의한다. main 미머지 상태이므로, 검증 그린 시 main 머지 진행, NO-GO 시 fix 후 재검증.

---

## 1. 검증 대상

### 변경 요약
- **백엔드**: `assertTemplate` 가 `'jira'` 추가 허용. 데이터 모델 변경 없음.
- **프론트**: 온보딩 4번째 카드 (Jira 워크스페이스), dashboard `case 'jira'` 분기, 새 모듈 `frontend/src/js/my-space/jira.js`(zero innerHTML)
- **진입 흐름**: `/login` 성공 → `/my-space` 직행. `/` → 302 → `/my-space`.
- **사이드바**: 모든 my-space-*.html 의 외부 `#sidebar` (Agents + Personal) 제거. inner sidebar(spaces list)만 남음.
- **삭제**: `frontend/public/index.html`, `frontend/src/js/main.js`, `frontend/src/js/agents/jira.js`, Dockerfile 의 index.html COPY 라인.

### 이 환경에서 검증 가능 (재검증 불요)
- 백엔드 Jest 42/42 통과 (40 + 2 신규)
- 신규 코드 `innerHTML` 0
- nginx 302 redirect block 추가
- 삭제 파일 참조 0건 (grep 검증)

### 이 환경에서만 검증 가능 (이번 요청 핵심)
- Docker 빌드 성공 (Dockerfile 에서 삭제된 index.html 이슈 없는지)
- `/` 직접 접근 → 302 → `/my-space` 동작
- 로그인 → `/my-space` 자동 진입
- 온보딩 4개 카드 레이아웃 (diary/recipe/freeform/jira)
- jira space 생성 → dashboard pane 에 Jira UI 노출
- Jira 미설정 시 settings-gate 카드 노출
- Jira 설정 후 preview → 이슈 생성 end-to-end
- 외부 sidebar 미노출 (모든 my-space 페이지)
- 기존 diary/recipe/note 회귀 (Phase 1/1.5/2 happy path 영향 없음)
- Settings 페이지 접근성 (topbar `설정` 링크)

---

## 2. 사전 조건

- [ ] Docker Desktop 가동
- [ ] 저장소 fetch + 검증 브랜치 체크아웃:
  ```bash
  git fetch origin
  git checkout team-implement-jira-integration/20260505-1104
  git log -1 --format='%H %s'
  # 기대: 748dbdd fix(frontend): load components.js before jira.js to ensure el() is available
  ```
- [ ] (옵션) Jira 설정 사전 입력 — 일부 검증 항목(2.7 preview/run end-to-end)에 필요. 테스트용 Jira instance 가 없으면 settings-gate 카드 노출 확인까지만으로 GO 판단 가능.

---

## 3. 검증 절차

### 3.1 빌드 + 기동

```bash
docker compose down -v          # 깨끗한 DB
docker compose build            # Dockerfile 변경 (index.html 제거) 확인 포함
docker compose up -d
```

**중점 확인**: Dockerfile 의 `COPY public/index.html ...` 라인이 제거되었으므로 빌드 실패하면 안 됨. 실패 시 즉시 STOP.

헬스체크 폴링:
```bash
until curl -fsS http://localhost:3100/health 2>/dev/null; do sleep 2; done
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost/my-space   # 200
```

### 3.2 진입 흐름

```bash
# 미인증 상태
curl -i -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost/
# 기대: 302 http://localhost/my-space (또는 /my-space)
```

브라우저로 `http://localhost/`:
- [ ] 자동으로 `/my-space` 로 이동
- [ ] 미인증 상태면 `/my-space` 의 auth-gate 가 `/login` 으로 redirect (기존 동작 유지)

브라우저로 `http://localhost/login`:
- [ ] 로그인 → 자동으로 `/my-space` 로 이동 (기존 `/` 가 아니어야 함)

### 3.3 백엔드 테스트 (컨테이너 환경)

```bash
docker compose exec backend npm test
```
**예상**: 6 suites, 42 tests, 0 failures.

### 3.4 온보딩 4-card

새 사용자 등록 후 `/my-space` 진입:
- [ ] 카드 4개 노출: 일기장 / 레시피 / 자유 형식 / **Jira 워크스페이스 (🎫)**
- [ ] 4번째 카드 description: "AI 가 작업 개요를 분석해 Jira 이슈를 자동 생성합니다."
- [ ] 카드 layout 이 깨지지 않음 (3-card 시점 vs 4-card 시점 모두 grid 정렬 유지)
- [ ] 외부 sidebar 미노출 (topbar 만 보임)

### 3.5 Jira space 생성

- [ ] Jira 카드 클릭 → "Jira 워크스페이스 공간 만들기" form
- [ ] 이름 입력 (예: "내 Jira") → 만들기 → 대시보드 진입
- [ ] inner sidebar(`내 공간`) 에 "내 Jira" 항목 노출
- [ ] 다른 space (다른 template) 와 함께 노출되며 클릭 시 전환

### 3.6 Jira 미설정 시 settings-gate

Jira 설정(`jira_base_url`, `jira_email`, `jira_api_token`, `jira_project_key`)을 한 번도 저장하지 않은 사용자로 검증:

- [ ] jira space 진입 시 dashboard pane 에 settings-gate 카드 노출
- [ ] 카드 헤딩: "Jira 설정이 필요합니다"
- [ ] 본문: 4개 키 안내
- [ ] 버튼: "설정으로 이동" → `/settings` 이동
- [ ] 콘솔에 에러 노출 X (graceful handling)

### 3.7 Jira preview / run end-to-end (Jira 인스턴스 있을 때만)

`/settings` 에서 Jira 4개 값 입력 → 다시 jira space 진입:

- [ ] Jira 폼 노출: textarea (작업 개요) + file input (선택)
- [ ] textarea 에 임의 텍스트 입력 → "미리보기 생성" 클릭
- [ ] spinner 노출 후 응답
- [ ] preview 카드 노출: summary / description / issuetype / priority 4개 필드
- [ ] "Jira 이슈 생성" 클릭 → 실제 Jira 이슈 생성 → 결과 카드(이슈 키/URL) 노출
- [ ] "다시 작성" 버튼 동작
- [ ] 콘솔 에러 0

Jira 인스턴스가 없는 환경에서는 settings-gate 카드 노출까지만으로 GO 판단 가능 (이 항목은 SKIP 가능).

### 3.8 외부 sidebar 미노출 회귀

브라우저 DevTools 로 다음 페이지에서 `document.querySelector('aside#sidebar')` 가 `null` 인지 확인:
- [ ] `/my-space`
- [ ] `/my-space/diary/new`
- [ ] `/my-space/recipes`
- [ ] `/my-space/recipes/new`
- [ ] `/my-space/notes`
- [ ] `/my-space/notes/new`

`/settings` 페이지는 별개 — sidebar 가 있어도 무방 (이 페이지는 변경 대상 아님).

### 3.9 기존 phase 회귀 (CRITICAL)

Phase 1/1.5/2 의 기능이 영향 없는지 확인:
- [ ] Diary space 생성 → 일기 작성 → 자동저장 → 목록 노출
- [ ] Recipe space 생성 → 레시피 작성 (재료/단계 추가) → 자동저장 → 목록
- [ ] Freeform space 생성 → 노트 작성 (마크다운 포함) → 미리보기 → 핀 토글

콘솔/네트워크 에러 0.

### 3.10 Playwright 회귀

```bash
npx playwright test qa/ --reporter=list
```
**예상**: 3 specs (`my-space.spec.js`, `my-space-recipes.spec.js`, `my-space-notes.spec.js`) 모두 통과. 신규 jira spec 은 본 페이즈에서 작성하지 않음 (verification env 가 별도로 추가하거나 후속 페이즈에서).

---

## 4. 보고 포맷

`docs/verification/my-space-jira-integration-2026-05-05-report.md` 로 회신 또는 PR 코멘트:

1. 빌드 + up 결과 (Dockerfile 빌드 성공 여부 명시)
2. `/` redirect 응답 (302 + Location 헤더)
3. 로그인 → /my-space 자동 진입 (스크린샷 1장)
4. 온보딩 4-card layout (스크린샷 1장)
5. jira space 생성 + settings-gate 노출 (스크린샷 1장)
6. (옵션) Jira preview/run end-to-end 결과
7. 외부 sidebar 미노출 회귀 (3.8 의 6 항목)
8. 기존 phase 회귀 (3.9 의 3 항목)
9. Playwright 결과
10. **GO/NO-GO** + main 머지 가능 여부

---

## 5. NO-GO 시 흐름

본 브랜치에 fix 커밋 push 후 본 문서에 변경분 추가 코멘트. main 미머지 상태이므로 fix 자유롭게 가능.

GO 시 메인 환경에서 `--no-ff` 머지 후 main push, 본 브랜치 origin 에서 삭제.

---

## 6. 보존 자산

- [docs/plan/my-space-jira-integration.md](../plan/my-space-jira-integration.md) — 사양 + 워커 분해
- [docs/decisions/my-space-phase-3-decisions.md](../decisions/my-space-phase-3-decisions.md) — 본 페이즈가 분기된 의사결정 기록 (B안/flow 1 결정)
- 본 브랜치의 9 커밋 (Worker A/B/C + synthesizer fix 2건)
