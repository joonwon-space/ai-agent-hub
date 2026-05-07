# My Space — 통합 백로그

_Last updated: 2026-05-06_

이 문서는 main에 머지 완료된 페이즈들 이후 **남은 후속 작업**을 한 곳에 모았다. 출처는 각 페이즈 plan 의 "미루는 항목" 섹션 + 의사결정 문서들. 본 문서가 single source of truth이며, 각 phase plan 의 "미루는 항목" 은 historical record 로 유지된다.

## 우선순위 / 스코프 표기

| 표기 | 의미 |
|---|---|
| **P-H / P-M / P-L** | High / Medium / Low priority |
| **S / M / L** | Small (1 commit) / Medium (1 sprint) / Large (multi-sprint) |
| **🚫 Blocked** | 사용자 결정 또는 외부 작업 선행 필요 |

---

## 1. 검색 고도화 (Phase 3.2 후속)

| ID | 항목 | P | 스코프 | 블로커 | 비고 |
|---|---|---|---|---|---|
| S-1 | Recipe ingredients/steps JSON 검색 | M | M | — | Prisma JSON path 쿼리 또는 raw SQL 필요 |
| S-2 | 검색 필터 조합 (카테고리/날짜/mood/pinned) | M | M | — | UI 재설계 동반 — 검색바 옆 필터 dropdown |
| S-3 | 페이지네이션 (`?cursor=`) | L | S | 콘텐츠 누적 후 의미 | 현재 limit 기본 10. 1000+ 누적 전엔 불필요 |
| S-4 | 한국어 형태소 분석 (`tsvector` + pg_trgm 또는 pgroonga) | L | L | 콘텐츠 1000+ 누적 시 트리거 | 의사결정 §2.1 의 마이그레이션 시점 |
| S-5 | 검색 히스토리 / autocomplete | L | M | — | localStorage 기반 시작 가능 |

**시작 권장 조건**: 콘텐츠 ≥ 500건 누적 후 측정 → S-1 또는 S-2 우선.

---

## 2. 이미지 / 미디어 (Phase 3.1 후속)

| ID | 항목 | P | 스코프 | 블로커 | 비고 |
|---|---|---|---|---|---|
| I-1 | 일기 첨부 (다중 이미지) | M | M | 디자인 시안 | 현재 레시피 커버 1장만. DiaryEntry 에 attachments JSON 또는 Attachment 테이블 |
| I-2 | 이미지 EXIF 메타데이터 제거 | M | S | — | sharp 가 자동 strip 가능 (`.rotate()` 호출 시) — 1줄 변경 |
| I-3 | 썸네일 생성 (카드 그리드 전용 작은 사이즈) | L | S | 카드 30+ 일 때 가치 | 현재 webp 1200px 1장만. 400px 변환 추가 |
| I-4 | 이미지 lazy loading | L | S | — | `loading="lazy"` 이미 일부 적용. 일관성 점검 |

**시작 권장**: I-2 즉시 가능 (보안 강화 + 작은 변경). 나머지는 사용 패턴 확인 후.

---

## 3. Recipe / 요리 보조 (Phase 3.5 후속)

| ID | 항목 | P | 스코프 | 블로커 | 비고 |
|---|---|---|---|---|---|
| R-1 | 진행 상태 서버 저장 | L | M | 사용자 가치 검증 | 현재 localStorage 기반. 디바이스 동기화 필요성 명확하지 않음 |
| R-2 | 카테고리 enum 사용자 정의 | M | M | — | 현재 4종 고정 (한식/양식/디저트/기타). UserSetting 또는 Space-level metadata |
| R-3 | 음성 안내 / 타이머 / 단위 변환 | L | L | UX 시안 | nice-to-have. 사용자 인터뷰 후 |

**시작 권장**: 사용 빈도 데이터 모은 뒤 결정. 현재로선 모두 후순위.

---

## 4. Agent / 통합 (Jira phase 후속)

| ID | 항목 | P | 스코프 | 블로커 | 비고 |
|---|---|---|---|---|---|
| A-1 | Per-space Jira config | M | M | 사용자 요구 확인 | 현재 user-level UserSetting. 다중 Jira 인스턴스 시 필요 |
| A-2 | 새 에이전트 추가 시 template enum 통합 | M | L | 새 에이전트 도입 시점 | 현재 enum 4종(diary/recipe/freeform/jira). enum 확장 vs generic agent template 결정 |
| A-3 | `--color-jira-*` 디자인 토큰 | L | S | — | 현재 freeform 토큰 재사용 중. 실제 시각적 충돌 발생 시 분리 |

**시작 권장**: A-3 은 1 commit 으로 가능하지만 trigger 약함. A-1 / A-2 는 사용자 시나리오 확인 후.

---

## 5. 접근성 보강 (Phase 3.4 후속)

| ID | 항목 | P | 스코프 | 블로커 | 비고 |
|---|---|---|---|---|---|
| AC-1 | moderate/minor a11y 위반 처리 | M | S | — | `qa/a11y-report.md` 가 현재 빈 상태(critical/serious 0). 정기적 회귀 점검 항목 |
| AC-2 | 모바일 ≤ 480px (작은 스마트폰) | L | S | — | 현재 ≤ 768px 까지. 부족하면 추가 breakpoint |
| AC-3 | 색맹 친화 색상 검토 | M | S | — | 다이어리 amber + 노트 purple 만 명도 차이 충분, recipe green 이 일부 색맹 패턴에서 비슷할 수 있음 |
| AC-4 | Screen reader 풀 테스트 (NVDA / VoiceOver 수동) | M | M | 환경 준비 | axe-core 가 자동 검출하지 못하는 의미론 검증 |

**시작 권장**: AC-3 가 작고 의미 있음. AC-4 는 사용자 풀이 좁으면 후순위.

---

## 6. AI 보조 (Phase 3.6 — Phase 3 결정 §6.1 ~ §6.2)

| ID | 항목 | P | 스코프 | 블로커 | 비고 |
|---|---|---|---|---|---|
| AI-1 | AI 보조 페이즈 자체 | M | L | 🚫 **사용자 가치 인터뷰 선행 필수** | 결정 §6.1 에 명시. 본인이 어떤 시나리오에서 AI 가 가치 있을지 답변 후 진행 |

후보 시나리오 (인터뷰 시 검토):
- 일기: "오늘 요약해줘" 버튼
- 레시피: 재료 입력 → 추천 단계 generate
- 노트: 마크다운 보조 (제목/요약 generate)

LLM 백엔드는 결정 §6.2 에 따라 **Ollama 로컬 고정** (외부 API 송신 금지).

---

## 7. 의존성 마이그레이션 (별도 sprint)

[`docs/decisions/deferred-dependency-upgrades.md`](../decisions/deferred-dependency-upgrades.md) 참조.

| ID | 항목 | P | 스코프 | 블로커 | 비고 |
|---|---|---|---|---|---|
| D-1 | `pdf-parse` 1.1.x → 2.x | L | M | 마이그레이션 전략 결정 | DOMMatrix 폴리필 또는 라이브러리 교체. 현재 1.1.x 유지 안전 |
| D-2 | `@prisma/client` 5.22 → 7.x | M | L | DB 백업/복원 환경 | 메이저 2단계 점프. 5→6 → 7 단계별 권장. main 안정 상태일 때 진행 |

브랜치 보존: `dependabot/.../pdf-parse-2.4.5`, `dependabot/.../prisma/client-7.8.0` (origin)

---

## 7.5 마크다운 렌더 확장 (`my-space/markdown.js` 후속)

| ID | 항목 | P | 스코프 | 블로커 | 비고 |
|---|---|---|---|---|---|
| MD-1 | 테이블 syntax (`\| col \| col \|`) | L | M | — | UX Explorer round 3 P-2. 현재는 raw `\|` 노출. 파서 확장 시 alignment, escape 등 attack surface 증가 — 명시적 결정 필요 |
| MD-2 | 코드 블록 syntax highlighting | L | M | 외부 라이브러리 도입 결정 | highlight.js 또는 prism — 현재 `<pre><code>` plain |
| MD-3 | nested list 5+ depth 검증 | L | S | — | 현재 동작 확인 필요 |

마크다운 정책: 외부 라이브러리 0 유지 + allowlist 기반 (PRD §11). MD-1/MD-2 도입 시 이 원칙과 trade-off 합의 필요.

---

## 8. 정리 / hygiene

| ID | 항목 | P | 스코프 | 비고 |
|---|---|---|---|---|
| H-1 | 각 phase plan 의 "미루는 항목" 섹션에 backlog.md 링크 추가 | L | S | navigation 보강. 현재는 historical-only |
| H-2 | `phase-3-extras.md` 첫 줄에 backlog.md 이전 notice 추가 | L | S | discoverability. 다른 plan 들이 참조 |
| H-3 | dependabot 자동 PR 정책 검토 | L | S | 마이너 자동 머지 + 메이저 수동 정책 합의 필요 |

---

## 시작 권장 순서 (가치/비용 기준)

각 카테고리 1순위만 추리면:

| 순서 | 항목 | 즉시 가능? |
|---|---|---|
| 1 | **I-2** EXIF 제거 | ✅ (1줄 추가, sharp.rotate()) |
| 2 | **AC-3** 색맹 친화 색상 검토 + 보강 | ✅ |
| 3 | **H-2** phase-3-extras.md notice + 본 문서 cross-link | ✅ |
| 4 | **D-2** Prisma 메이저 마이그레이션 (5→6) | 환경 준비 후 |
| 5 | **AI-1** AI 보조 페이즈 | 가치 인터뷰 후 |
| 6 | **A-1** Per-space Jira config | 사용자 요구 확인 후 |
| 7 | **R-2** 카테고리 enum 사용자 정의 | 사용자 요구 확인 후 |

**즉시 처리 가능한 작은 항목 (I-2, AC-3, H-2)** 부터 묶어서 단일 commit 으로 처리하는 것 권장. 나머지는 트리거 (사용자 요구, 콘텐츠 누적, 환경 준비) 발생 시 시작.
