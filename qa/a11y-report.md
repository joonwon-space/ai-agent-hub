# a11y Report

_Last updated: 2026-05-06_

## axe-core 자동 검출 (Phase 3.4)

`qa/my-space-a11y.spec.js` 가 5 페이지 × 3 viewport × 2 theme = 30 audit 통합 실행.

### moderate violations
_none_

### minor violations
_none_

---

## 색맹 친화 검토 (Phase 3 백로그 AC-3, 2026-05-06)

### 현재 팔레트 (`my-space-tokens.css`)

| 카테고리 | 다크 | 라이트 | hue (HSL) |
|---|---|---|---|
| Diary  | `#f59e0b` (amber-500)   | `#d97706` (amber-600)  | ~38° |
| Recipe | `#10b981` (emerald-500) | `#059669` (emerald-600) | ~162° |
| Freeform / Jira | `#7c5cff` (violet-500)  | `#5b3fe0` (violet-700) | ~252° |

### 시뮬레이션 (deuteranopia / protanopia, 가장 흔한 적녹 색맹)

| 카테고리 | 정상 시력 | 적녹 색맹 변환 후 |
|---|---|---|
| Diary  | warm yellow-orange | dark mustard / yellow-brown |
| Recipe | green | yellow-brown (amber 와 비슷한 톤) |
| Freeform | violet | blue-gray (구분 명확) |

→ **amber 와 emerald 가 적녹 색맹 환경에서 유사하게 보일 수 있음.**

### 보강 신호 (이미 적용됨)

| 신호 | Diary | Recipe | Freeform | Jira |
|---|---|---|---|---|
| 이모지 prefix | 📔 | 🍳 | 📝 | 🎫 |
| 텍스트 라벨 | 일기장 | 레시피 | 자유 형식 | Jira 워크스페이스 |
| 위치 (대시보드 inner sidebar) | 사용자 명명 | 사용자 명명 | 사용자 명명 | 사용자 명명 |

각 카테고리는 **색 외 최소 2가지 신호 (이모지 + 텍스트)** 로 구분 가능. WCAG 2.1 §1.4.1 ("Use of Color") 준수: 색만으로 정보 전달하지 않음.

### 결론

색 자체 변경 **없음**. 이모지 + 텍스트 라벨이 색맹 환경에서도 충분한 redundant signal 을 제공.

다만 향후 다음 시나리오에서는 색상 분리 강화 검토 필요:
- 이모지 미노출 영역에 카테고리 색만 사용 (현재 없음)
- 카테고리 필터 칩이 텍스트 없이 색으로만 표현 (현재 텍스트 동반)
- 통계/차트 시각화 (현재 없음, 향후 도입 시)

대안 팔레트 (필요 시 적용 가능):
- Recipe: emerald `#10b981` → **teal `#14b8a6`** (hue 162° → 173°). amber 와의 색상 거리 +11°. 색맹 환경에서 명도/saturation 패턴 차이 더 분명.
- light: `#059669` → `#0d9488`

이 변경은 1 commit 으로 가능하지만, 현재 시점에서는 redundant signal 만으로 충분하다고 판단되어 보류.

### 검토 메서드

직접 실행한 자동 도구는 axe-core (Phase 3.4) — color contrast 검출 (WCAG AA pass 확인) 만 수행. 색맹 시뮬레이션은 hue 분석 + 색맹 시뮬레이션 일반 지식 기반. 정밀 검증이 필요하면 NoCoffee / Sim Daltonism 같은 외부 도구 활용 권장.

---

## 후속 (Phase 3 백로그 §5)

- AC-1: moderate/minor 회귀 정기 점검 — 본 문서 갱신
- AC-2: 모바일 ≤ 480px breakpoint
- AC-4: NVDA / VoiceOver screen reader 수동 테스트
