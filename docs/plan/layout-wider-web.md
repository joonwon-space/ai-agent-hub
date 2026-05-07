# 레이아웃 개선 — 웹에서 더 넓은 콘텐츠 영역

_작성일: 2026-05-07_

## 배경 및 동기

현재 모든 편집 화면과 에이전트 패널이 `max-width: 680~720px`로 고정돼 있어 넓은 데스크탑 화면에서 양쪽 여백이 크게 비어 보인다.
모바일 우선(mobile-first) 설계는 유지하되, **데스크탑(≥1280px)에서 콘텐츠 영역을 넓혀** 공간을 더 활용한다.

---

## 현재 상태 (병목 지점)

| 파일 | 선택자 | 현재 max-width |
|------|--------|---------------|
| `frontend/src/css/main.css` | `.main-inner` | 680px |
| `frontend/src/css/my-space-recipe.css` | `.recipe-edit-main` | 680px |
| `frontend/src/css/my-space.css` | `#diary-edit-main` | 720px |
| `frontend/src/css/my-space.css` | `.ms-onboarding` | 700px |
| `frontend/src/css/my-space.css` | `.ms-space-delete-modal` | 400px (변경 불필요) |

---

## 목표 너비 정책

반응형 3단계:

| 뷰포트 | 정책 | max-width |
|--------|------|-----------|
| `≤768px` (모바일) | 현재와 동일, full-width | 100% (변경 없음) |
| `769px – 1279px` (태블릿/소형 노트북) | 현재와 동일 | 680–720px (변경 없음) |
| `≥1280px` (데스크탑) | 넓게 확장 | **960px** |

960px 선택 근거:
- 1280px 뷰포트 기준 양쪽 160px 여백 → 충분히 여유있는 느낌
- 1440px 뷰포트에서도 과하지 않음
- 레시피 재료/단계 행이 2컬럼 그리드로 전환 가능한 너비 (옵션)

---

## 세부 작업

### Task 1 — `main.css` `.main-inner` 확장

**파일**: `frontend/src/css/main.css`

현재 (line ~325):
```css
.main-inner {
  width: 100%;
  max-width: 680px;
}
```

변경:
```css
.main-inner {
  width: 100%;
  max-width: 680px;
}

@media (min-width: 1280px) {
  .main-inner {
    max-width: 960px;
  }
}
```

영향 범위: Jira 에이전트 패널 (`#main > .main-inner`)

---

### Task 2 — `my-space-recipe.css` `.recipe-edit-main` 확장

**파일**: `frontend/src/css/my-space-recipe.css`

현재 (line ~202):
```css
.recipe-edit-main {
  max-width: 680px;
  ...
}
```

변경:
```css
@media (min-width: 1280px) {
  .recipe-edit-main {
    max-width: 960px;
  }
}
```

추가 고려: 960px에서 재료 행을 2컬럼으로 배치하면 밀도 향상 가능 (선택적 — 재료가 많을 때 유용):
```css
@media (min-width: 1280px) {
  #ingredients-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
}
```

---

### Task 3 — `my-space.css` `#diary-edit-main` 확장

**파일**: `frontend/src/css/my-space.css`

현재 (line ~498):
```css
#diary-edit-main {
  max-width: 720px;
  ...
}
```

변경:
```css
@media (min-width: 1280px) {
  #diary-edit-main {
    max-width: 960px;
  }
}
```

일기는 본문 textarea가 넓어지면 글쓰기 경험 향상. 단, 본문 `line-length` 가독성을 위해 textarea 내부 `max-width` 별도 지정이나 폰트 크기 조정은 하지 않음 (960px 본문 폭도 한국어 글쓰기에 무리 없음).

---

### Task 4 — `my-space.css` `.ms-onboarding` 확장

**파일**: `frontend/src/css/my-space.css`

현재 (line ~43):
```css
.ms-onboarding {
  max-width: 700px;
  ...
}
```

변경:
```css
@media (min-width: 1280px) {
  .ms-onboarding {
    max-width: 900px;
  }
}
```

온보딩 템플릿 카드 그리드(3열)가 더 여유롭게 배치됨.

---

### Task 5 — 노트 편집 화면 확인

`frontend/src/css/my-space-note.css`에 너비 제약이 있는지 확인 후 동일 패턴 적용.

---

### Task 6 — 대시보드 내부 패널 (`ms-dashboard`) 확인

대시보드(Screen 02)는 좌측 inner sidebar + 우측 pane 레이아웃. 별도 너비 처리가 있는지 확인:
- `.ms-dashboard` wrapper max-width 제약 있으면 동일하게 확장
- 없으면 자연스럽게 늘어나므로 변경 불필요

---

## 변경하지 않는 것

| 항목 | 이유 |
|------|------|
| 모달 (`.ms-space-delete-modal`) | 400px가 적절한 모달 크기 |
| 모바일 (≤768px) 레이아웃 | 현재 잘 작동 중 |
| 태블릿 (769~1279px) 레이아웃 | 현재 크게 불편하지 않음 |
| sidebar 너비 (`--sidebar-width: 240px`) | 변경 불필요 |
| topbar | 이미 full-width |

---

## 검증 체크리스트

- [ ] 1280px 뷰포트: 레시피 편집 main이 960px으로 확장됨
- [ ] 1440px 뷰포트: 양쪽 여백이 생기고 콘텐츠가 중앙 정렬됨
- [ ] 768px 뷰포트: 기존 모바일 레이아웃 그대로 (회귀 없음)
- [ ] 1024px 뷰포트: 기존 태블릿 레이아웃 그대로 (회귀 없음)
- [ ] 일기 편집: textarea가 더 넓어져 글쓰기 공간 확보
- [ ] Jira 에이전트 패널: 폼이 더 넓게 펼쳐짐
- [ ] 온보딩 카드 그리드: 3열 배치가 더 여유롭게 보임
- [ ] 콘솔 에러 0
- [ ] 라이트/다크 테마 모두 정상

---

## Done 정의

- [ ] `@media (min-width: 1280px)` 블록 4곳 추가 (main-inner, recipe-edit-main, diary-edit-main, ms-onboarding)
- [ ] 데스크탑(1280px+)에서 콘텐츠가 960px으로 확장 확인
- [ ] 모바일·태블릿 회귀 없음 (Playwright visual-qa 통과)
- [ ] 노트 편집 화면 확인 후 필요 시 동일 적용
