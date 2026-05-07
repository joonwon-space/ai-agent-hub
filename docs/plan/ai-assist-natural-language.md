# AI 어시스턴트 — 레시피·일기 자연어 입력 → 필드 자동 채우기

_작성일: 2026-05-07_

## 배경 및 동기

레시피나 일기를 기록할 때 각 필드(이름·재료·단계·기분 등)를 하나씩 채워야 해서 번거롭다.
이미 Jira 에이전트에서 `backend/src/services/ollama.js` → Ollama 로컬 모델(`extractWithOllama`)을 사용해 자연어 → JSON 변환 패턴이 검증돼 있다.
동일 패턴을 레시피·일기에도 적용해 "머릿속에 있는 내용을 자연어로 한 번에 입력 → AI가 필드로 나눠준다"는 UX를 제공한다.

---

## 범위 (이번 페이즈)

| 기능 | 설명 |
|------|------|
| 레시피 자연어 → 필드 추출 | 이름·카테고리·난이도·조리시간·인분·설명·재료·조리순서 |
| 일기 자연어 → 필드 추출 | 제목·기분·본문 |
| 프리뷰 카드 | AI가 추출한 내용 확인 후 "이 내용으로 채우기" 선택 |
| 거절 / 재시도 | 결과가 맘에 안 들면 그냥 닫고 직접 작성 |

---

## 아키텍처 결정

### AI 모델

- **기존 그대로** — `OLLAMA_HOST` + `OLLAMA_MODEL` 환경 변수, `ollama.js`의 `/api/generate` 호출 패턴 재사용
- 레시피용 JSON 스키마 / 일기용 JSON 스키마만 새로 정의

### 백엔드 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/ai/assist/recipe` | POST | `{ text: string }` → 레시피 필드 JSON |
| `/api/ai/assist/diary` | POST | `{ text: string }` → 일기 필드 JSON |

- 인증 미들웨어 적용 (기존 `auth.js` 미들웨어)
- 입력 길이 제한: `text` 최대 5000자
- Ollama 타임아웃: 30s (기존과 동일)
- 에러 시 `{ error: "..." }` 반환

### 프론트엔드 UX 패턴

```
편집 페이지 상단 (또는 섹션 상단)
  ┌─────────────────────────────────────────┐
  │  ✨ AI로 채우기 (beta)                   │
  │  ─────────────────────────────────────  │
  │  [textarea] 내용을 자유롭게 적어주세요…   │
  │                              [AI 분석]  │
  └─────────────────────────────────────────┘

버튼 클릭 → 스피너 → 프리뷰 카드 출현
  ┌────────────────────────────────┐
  │  AI 추출 결과 미리보기          │
  │  이름: 닭갈비볶음              │
  │  카테고리: 한식  난이도: 보통   │
  │  조리시간: 20분  인분: 2       │
  │  재료: 닭가슴살 400g …        │
  │  ─────────────────────────    │
  │  [이 내용으로 채우기]  [닫기]  │
  └────────────────────────────────┘
```

- "이 내용으로 채우기" → 기존 폼 필드에 값 주입 → autosave 트리거
- "닫기" → 아무것도 변경하지 않음
- AI 패널은 **기존 편집 폼 위에 접을 수 있는 섹션**으로 배치 (폼 자체를 대체하지 않음)

---

## 세부 작업 분해

### Worker A — 백엔드 (branch: `ai-assist-backend`)

**소유 파일**:
- `backend/src/services/ollamaAssist.js` (NEW)
- `backend/src/routes/aiAssist.js` (NEW)
- `backend/src/createApp.js` (수정 — 라우트 등록)

#### A-1. `ollamaAssist.js` 서비스

```js
// 레시피용 JSON 스키마 프롬프트
const RECIPE_JSON_SCHEMA = `{
  "name": "레시피 이름 (한국어, 80자 이내)",
  "category": "한식 또는 양식 또는 디저트 또는 기타",
  "difficulty": "easy 또는 medium 또는 hard",
  "cookTimeMin": 조리시간_분_숫자_또는_null,
  "servings": 인분_숫자_또는_null,
  "description": "레시피 한 줄 설명 또는 null",
  "ingredients": [{ "name": "재료명", "amount": "양 (예: 400g)" }],
  "steps": [{ "order": 1, "text": "조리 단계 설명" }]
}`;

// 일기용 JSON 스키마 프롬프트
const DIARY_JSON_SCHEMA = `{
  "title": "일기 제목 (한국어, 120자 이내) 또는 null",
  "mood": "happy 또는 sad 또는 anxious 또는 angry 또는 neutral 중 하나",
  "body": "정리된 일기 본문 (원문 의미 보존)"
}`;
```

- `extractRecipeFields(text)` — Ollama 호출, 레시피 JSON 파싱, 필드 유효성 검증
- `extractDiaryFields(text)` — Ollama 호출, 일기 JSON 파싱, 필드 유효성 검증
- 공통 Ollama 호출 로직 → 기존 `ollama.js` 패턴 그대로 재사용
- 파싱 실패 시 `throw new Error('LLM 응답에서 JSON을 파싱할 수 없습니다.')`

#### A-2. `aiAssist.js` 라우터

```
POST /api/ai/assist/recipe
  - auth 미들웨어
  - req.body.text 검증 (string, 1~5000자)
  - ollamaAssist.extractRecipeFields(text)
  - 응답: { data: { name, category, ... } }

POST /api/ai/assist/diary
  - auth 미들웨어
  - req.body.text 검증 (string, 1~5000자)
  - ollamaAssist.extractDiaryFields(text)
  - 응답: { data: { title, mood, body } }
```

#### A-3. `createApp.js` — 라우트 등록

```js
const aiAssistRouter = require('./routes/aiAssist');
app.use('/api/ai', aiAssistRouter);
```

#### A-4. 테스트 (`backend/__tests__/aiAssist.test.js`)

- `POST /api/ai/assist/recipe` — Ollama mock, happy path, 인증 없음 401, text 초과 400
- `POST /api/ai/assist/diary` — 동일 패턴

**커밋**:
- `feat(backend): add Ollama-backed AI assist service for recipe and diary field extraction`
- `feat(backend): add POST /api/ai/assist/recipe and /diary routes with auth + validation`
- `test(backend): add integration tests for AI assist endpoints`

---

### Worker B — 프론트엔드 레시피 (branch: `ai-assist-recipe-ui`)

**소유 파일**:
- `frontend/src/js/my-space/aiAssist.js` (NEW)
- `frontend/src/js/pages/my-space-recipe-edit.js` (수정)
- `frontend/src/css/my-space-recipe.css` (수정)
- `frontend/pages/my-space-recipe-edit.html` (수정 — script tag 추가)

#### B-1. `aiAssist.js` — 공유 AI 패널 모듈

```js
// createRecipeAiPanel(onApply)
//   onApply(fields) — 편집 페이지 JS가 필드를 채우는 콜백
//   반환: { el: HTMLElement, destroy: fn }

// createDiaryAiPanel(onApply)
//   onApply(fields) — 일기 페이지 JS가 필드를 채우는 콜백
```

- 패널 DOM 구조:
  - 접기/펼치기 토글 헤더 ("✨ AI로 채우기")
  - textarea (placeholder: "재료, 조리법, 인분 등을 자유롭게 적어주세요…")
  - "AI 분석" 버튼
  - 로딩 스피너
  - 프리뷰 카드 (결과 표시)
  - "이 내용으로 채우기" / "닫기" 버튼
- innerHTML 0 — 모든 DOM createElement
- API 호출: `fetch('/api/ai/assist/recipe', { method: 'POST', ... })`

#### B-2. `my-space-recipe-edit.js` 수정

- `buildForm()` 상단에 `createRecipeAiPanel` 호출 → main에 삽입
- `onApply(fields)` 콜백:
  - `nameInput.value = fields.name`
  - `categorySelect.value = fields.category`
  - `selectedDifficulty = fields.difficulty` + difficulty-btn 클래스 갱신
  - `cookTimeInput.value = fields.cookTimeMin`
  - `servingsInput.value = fields.servings`
  - `descriptionTextarea.value = fields.description || ''`
  - `ingredientsContainer.textContent = ''` → `fields.ingredients.forEach(addIngredientRow)`
  - `stepsContainer.textContent = ''` → `fields.steps.forEach(addStepRow)`
  - `autosaver.schedule()` 호출 (autosave 트리거)

#### B-3. CSS — `my-space-recipe.css` 추가

```css
/* AI assist panel */
.ms-ai-assist { ... }
.ms-ai-assist__header { ... }         /* 접기/펼치기 토글 */
.ms-ai-assist__body { ... }           /* 펼쳐진 상태 */
.ms-ai-assist__textarea { ... }
.ms-ai-assist__btn { ... }
.ms-ai-assist__preview { ... }        /* 결과 카드 */
.ms-ai-assist__preview-row { ... }
.ms-ai-assist__actions { ... }        /* 채우기 / 닫기 */
```

- 다크/라이트 토큰 사용
- 접힌 상태 기본값 (처음엔 compact, 사용 시 펼침)

**커밋**:
- `feat(frontend): add shared AI assist panel module (aiAssist.js)`
- `feat(frontend): wire AI assist panel into recipe edit page`

---

### Worker C — 프론트엔드 일기 (branch: `ai-assist-diary-ui`)

**소유 파일**:
- `frontend/src/js/pages/my-space-diary-edit.js` (수정)
- `frontend/src/css/my-space.css` (수정 — 일기 AI 패널 스타일)
- `frontend/pages/my-space-diary-edit.html` (수정 — script tag 추가)

#### C-1. `my-space-diary-edit.js` 수정

- `init()` 에서 `createDiaryAiPanel` 호출 → `diary-edit-main` 최상단에 삽입
- `onApply(fields)` 콜백:
  - `document.getElementById('entry-title').value = fields.title || ''`
  - 기분 버튼 선택: `selectedMood = fields.mood` + 버튼 active 상태 갱신
  - `document.getElementById('entry-body').value = fields.body || ''`
  - autosave 트리거

#### C-2. CSS

- Worker B의 `.ms-ai-assist` 공통 클래스 재사용 (my-space.css에 임포트 또는 공용 파일로 분리)
- 일기 테마 컬러(diary 토큰) 적용 가능

**커밋**:
- `feat(frontend): wire AI assist panel into diary edit page`

---

## 미루는 항목 (backlog)

- 이미지 첨부 → 이미지에서 레시피 인식 (멀티모달 모델 필요)
- 스트리밍 응답 (현재 non-streaming으로 충분)
- 재시도 시 이전 추출 결과 diff 표시
- AI 추출 결과 별점/피드백 수집

---

## Done 정의

- [ ] `POST /api/ai/assist/recipe` — 자연어 → 레시피 JSON, 인증 필요
- [ ] `POST /api/ai/assist/diary` — 자연어 → 일기 JSON, 인증 필요
- [ ] 레시피 편집 페이지에 AI 패널 표시 + "이 내용으로 채우기" 작동
- [ ] 일기 편집 페이지에 AI 패널 표시 + "이 내용으로 채우기" 작동
- [ ] Ollama 미연결 시 사용자에게 명확한 에러 메시지 (`"AI 서버에 연결할 수 없습니다"`)
- [ ] innerHTML 0 (aiAssist.js)
- [ ] 백엔드 통합 테스트 통과
- [ ] 모바일에서 패널 사용 가능 (touch 지원)
