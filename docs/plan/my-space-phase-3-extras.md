# My Space — Phase 3 백로그 (확장 기능)

소스 PRD: [docs/prd/my-space.md](../prd/my-space.md) §10
이 문서는 Phase 1 / 1.5 / 2 (Notes) 이후로 미뤄진 항목들의 **백로그**다. 아직 sprint 단위 worker 분해가 되어 있지 않으며, 각 항목별로 PRD 보강과 디자인 검증이 선행되어야 한다.

각 섹션 마지막에 "이 페이즈를 시작할 때 필요한 것" 체크리스트가 있다 — 미래의 계획 단계에서 그대로 갈무리하면 된다.

---

## 3.1 이미지 업로드 (레시피 커버 / 일기 첨부)

### 배경
- PRD §4 의 `Recipe.coverImage` 는 `String?` (base64 또는 URL) 로 정의됨 — Phase 1.5 에서는 비활성화
- 일기 첨부는 PRD 에 명시되어 있지 않음. 사용자 요구가 확인되면 데이터 모델 보강 필요 (예: `DiaryEntry.attachments Json?` — `[{ url, mimeType, sizeBytes }]`)
- 기존 `/api/upload` 엔드포인트 (`backend/src/routes/upload.js`) 가 존재하나 현재 어떤 용도로 쓰이는지 점검 필요

### 스코프 후보
- 레시피 커버 1장 (정사각형 권장, 5MB 제한)
- 일기 첨부 N장 (Phase 3.1 에서는 1장으로 시작, 추후 확장)
- 이미지 저장 위치: 현 컨테이너 로컬 볼륨 vs S3 호환 외부 스토리지 — 결정 필요

### 핵심 결정 사항 (스프린트 시작 전 합의)
- [ ] 저장 백엔드: 로컬 볼륨 / S3 / Cloudflare R2 / 기타
- [ ] 이미지 처리 정책: 원본 그대로 vs 자동 리사이즈 (예: max 1200px width)
- [ ] base64 인라인 vs URL 참조 (DB row size, 캐시 가능성 trade-off)
- [ ] 콘텐츠 타입 화이트리스트: jpeg/png/webp 만 허용?
- [ ] 보안: SSRF 방어, magic byte 검증, 악성 이미지 거부 (예: SVG `<script>`)
- [ ] 권한: 업로드한 사용자만 삭제 가능한가, space 단위인가

### 의존성
- 디자인: 이미지 업로드 UI (드롭존, 미리보기, 진행 표시)
- DB: 첨부 메타 테이블 신설 여부
- 보안 리뷰: OWASP A03/A05 항목 점검

### 이 페이즈를 시작할 때 필요한 것
- [ ] PRD §4 에 `Attachment` 모델 추가 또는 기존 컬럼 활용 결정
- [ ] PRD §5 에 `POST /api/uploads/recipe-cover`, `POST /api/uploads/diary-attachment` 등 라우트 명세
- [ ] 디자인 시안 (드롭존, 진행률, 실패 상태)
- [ ] 저장 백엔드 결정 + 운영 비용 추정

---

## 3.2 통합 검색

### 배경
- 사용자가 작성한 콘텐츠 양이 늘어나면 일기 제목/본문, 레시피 이름, 노트 제목/본문 across 검색이 필요
- 현재 모델은 PostgreSQL 만 사용 — Elasticsearch 같은 외부 인프라 도입은 over-engineering 가능

### 스코프 후보
- 단일 검색창에서 `q=` 입력 → diary/recipe/note 결과 그룹화
- 결과 카드 클릭 → 해당 편집 화면으로 deep link
- 페이지네이션 + 타입 필터

### 핵심 결정 사항
- [ ] 검색 방식:
  - **Plan A**: PostgreSQL `tsvector` + `tsquery` (한국어는 `pgroonga` 또는 `simple` config)
  - **Plan B**: 단순 `ILIKE '%q%'` (소규모일 때 가장 단순)
  - **Plan C**: 외부 검색엔진 (Meilisearch, Typesense)
- [ ] 한국어 형태소 분석 필요 여부 (PRD §9 의 검색 응답 시간 기준 정의 필요)
- [ ] 인덱스 추가 (full-text 인덱스 마이그레이션)

### 의존성
- 디자인: 검색바 (사이드바? 별도 페이지?), 결과 그룹 UI
- 인프라: 외부 검색엔진 도입 시 docker-compose 갱신
- 데이터 모델: full-text 인덱스 생성 마이그레이션

### 이 페이즈를 시작할 때 필요한 것
- [ ] 검색 방식 결정 (Plan A/B/C 중 하나)
- [ ] PRD §5 에 `GET /api/my-space/search?q=&type=` 명세
- [ ] 검색 결과 응답 envelope 정의 (그룹별 vs flat)
- [ ] p95 200ms 성능 목표 유지 가능 여부 검증 (스토리지 용량 시뮬레이션)

---

## 3.3 Space 다중 생성 / 템플릿 추가 UI

### 배경
- 데이터 모델은 1 user → N spaces 를 이미 지원 (`Space.userId` index)
- Phase 1 의 UI 는 사실상 1개 space 가정 (대시보드의 inner sidebar 가 단순)
- 사용자가 일기 2개 (개인용 / 업무용) 같은 분리를 원할 수 있음

### 스코프 후보
- inner sidebar 에 space 목록 + "+ 새 일기장 / 새 레시피북 / 새 메모장" 버튼
- space 이름 변경, 삭제 (cascade 경고 모달)
- space 별 색상/이모지 커스텀 (선택)

### 핵심 결정 사항
- [ ] space 이름 충돌 정책 (같은 이름 허용?)
- [ ] 삭제 시 확인 절차 (이름 재입력 강제 등)
- [ ] template 추가 가능성 (예: 가계부, 독서 노트) — 현재 enum 3종 → 확장 시 마이그레이션 부담

### 의존성
- 디자인: inner sidebar space 목록 UI, 삭제 모달
- API: `PATCH /api/my-space/:id`, `DELETE /api/my-space/:id` 는 이미 존재 — UI 만 붙이면 됨

### 이 페이즈를 시작할 때 필요한 것
- [ ] 디자인: space 관리 UI 시안
- [ ] 사용자 시나리오 검증 (2 space 이상 실제로 사용하는가)
- [ ] template 확장 가능성 — 새 template 추가 시 마이그레이션 가이드

---

## 3.4 접근성 / 반응형 / 다크모드 보강

### 배경
- PRD §9 의 접근성 목표 (WCAG AA, 키보드 포커스) 가 Phase 1 에서 minimum bar 로만 충족됨
- 모바일 반응형은 PRD non-goals 였으나, 추후 단계에서 검토 가능

### 스코프 후보
- 색상 대비 검증 (자동 도구: axe-core, Pa11y)
- 키보드 네비게이션 풀 패스 (Tab/Enter/Esc 흐름 검증)
- screen reader 라벨 보강 (aria-label, role)
- 모바일 뷰포트 (≤ 768px) 분기: inner sidebar → 상단 탭, 카드 그리드 → 1열
- 다크/라이트 토글 UI 명시화 (현재 자동 감지만)

### 핵심 결정 사항
- [ ] 자동화 도구 도입: axe-core 를 Playwright 안에서 실행
- [ ] 모바일 우선 vs 데스크톱 우선 — 컨텐츠 입력 위주이므로 데스크톱 우선 유지 권장

### 이 페이즈를 시작할 때 필요한 것
- [ ] axe-core 통합 (또는 동등 도구) — Playwright 시나리오에 axe scan 추가
- [ ] 모바일 시안
- [ ] 다크/라이트 토글 위치 결정 (사이드바? 사용자 메뉴?)

---

## 3.5 (선택) 재료 체크 / 단계 진행 상태

### 배경
- PRD §10 Phase 1.5 후순위 항목 (재료 체크박스 클라이언트 상태, 저장 X)
- 실제 요리 중 사용 시 진행 상태 추적이 유용

### 스코프 후보
- 레시피 상세 화면 (Phase 1.5 에서는 편집 화면만 있음 → 별도 view 모드 추가)
- 재료/단계 체크박스 — `localStorage` 저장으로 시작
- 추후 서버 저장 (Phase 3.5b)

### 이 페이즈를 시작할 때 필요한 것
- [ ] 디자인: read-only 상세 뷰 시안
- [ ] localStorage 키 컨벤션 (`recipe-progress-<spaceId>-<recipeId>`)
- [ ] 모바일 친화도 (요리 중 사용 가정)

---

## 3.6 (선택) AI 보조

### 배경
- PRD non-goal 로 명시되어 있음 (N5: AI 기반 자동완성/추천 — Phase 2 이후)
- 현재 시스템에 Ollama 연동이 이미 있음 → 활용 가능성

### 스코프 후보
- 일기: "오늘 하루 요약해줘" 버튼 → Ollama 호출 → 본문 prepend
- 레시피: 재료 입력 → 추천 단계 generate
- 노트: 마크다운 보조 (제목/요약 generate)

### 이 페이즈를 시작할 때 필요한 것
- [ ] 사용자 가치 검증 (실제 사용할지 인터뷰)
- [ ] 토큰 사용량 / 비용 한도 정책
- [ ] 프라이버시 (사용자 콘텐츠를 외부 LLM 에 보낼지 — 현재 Ollama 로컬이면 문제 없음)

---

## 우선순위 권장 (참고)

현재 정보 기준 추정 가치 vs 비용:

| 항목 | 가치 | 비용 | 권장 순서 |
|------|------|------|-----------|
| 3.1 이미지 업로드 | 높음 (레시피 시각화 핵심) | 중 (보안 신경 써야 함) | 1 |
| 3.2 통합 검색 | 중 (콘텐츠 누적 후 가치 상승) | 중 (Plan B 선택 시 낮음) | 3 |
| 3.3 Space 다중 UI | 중 | 낮음 (모델 이미 지원) | 2 |
| 3.4 접근성/반응형 | 중 (퀄리티 신호) | 중 | 4 |
| 3.5 재료 체크 | 낮음 (있으면 좋음) | 낮음 | 6 |
| 3.6 AI 보조 | 불확실 (검증 필요) | 중 | 5 (검증 후 재평가) |

→ 다음 합의 사항: 3.1 부터 진행할지 vs 3.3 (가장 저렴) 부터 진행할지 사용자 우선순위 필요
