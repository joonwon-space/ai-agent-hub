---
description: 신규 테스트 유저 시뮬레이션 — 회원가입, 로그인, 자유 클릭, 뒤로가기/새로고침 등 어색한 흐름 발굴
---

# UX Explore

`ux-explorer` 에이전트를 호출해 production 또는 local 환경에서 신규 테스트 유저처럼 사이트를 자유롭게 돌아다닌다. e2e-runner 가 정해진 시나리오를 검증한다면, 이 명령은 사용자가 실제로 할 만한 어색한 행동(뒤로가기, 새로고침, 빠른 더블클릭, 빈 입력, 딥링크 등)을 시도하며 깨지는 지점을 찾는다.

## 사용법

```
/ux-explore                  → live 환경 전체 phase 실행 (default)
/ux-explore --local          → 로컬 docker compose 환경
/ux-explore phase 4          → live 환경, Phase 4 만 (자동저장 + 새로고침)
/ux-explore --local phase 6  → 로컬, Phase 6 만 (노트 + 마크다운)
```

## 환경 결정

### 기본값: Live (`https://ai.joonwon.dev`)

| 항목 | 값 |
|---|---|
| Base URL | `https://ai.joonwon.dev` |
| 테스트 유저 | 매 실행마다 신규 (`ux-test-${timestamp}@test.local`) |
| 코드 수정 | 불가 — 발견 사항 리포트만 |
| 전제조건 | 없음 (production 항상 가동) |

### `--local` 플래그

| 항목 | 값 |
|---|---|
| Base URL | `http://localhost` |
| 전제조건 | `docker compose up -d` 실행 + 헬스 통과 |
| 코드 수정 | 발견 후 fix 가능 |

## 실행되는 Phase (총 11개)

| # | 영역 | 핵심 검증 |
|---|---|---|
| 1 | 첫 진입 + 회원가입 | redirect 체인 / 검증 실패 처리 / 가입 후 자동 로그인 |
| 2 | 로그인 + 온보딩 | 4-card 노출 / 뒤로가기 후 상태 |
| 3 | 4 template 시도 | rename Esc/blur / inner sidebar switch |
| 4 | 자동저장 + 새로고침 | debounce 중 F5 / 데이터 손실 추적 |
| 5 | 레시피 + 커버 + 체크리스트 | 잘못된 파일 거부 / 체크 persistence / edit↔view |
| 6 | 노트 + 마크다운 | XSS escape / javascript: 링크 살균 / 핀 토글 |
| 7 | 검색 | 결과 클릭 후 back / 검색어 유지 |
| 8 | 테마 토글 | localStorage persist / logout 후 유지 |
| 9 | 삭제 모달 | Esc / backdrop / 잘못된 이름 입력 |
| 10 | 딥링크 / 권한 / 404 | 비인증 deep link / 다른 user 404 / unmatched route fallback |
| 11 | 동시성 / 멀티탭 | 더블클릭 / last-write-wins |

## 호출 흐름

```
1. 사용자 의도 파싱 (--local 또는 --live, phase 번호 등)
2. 환경 사전 점검:
   - --local 이면 docker ps 로 backend/frontend 가동 확인, 미가동 시 먼저 실행 안내
   - --live 면 base URL 핑 (curl)
3. ux-explorer agent spawn:
   - args: BASE_URL, 실행할 phase 목록, 신규 테스트 유저 이메일
4. 결과 수신 → 마크다운 리포트 출력
5. 🔴 Broken 항목이 1건 이상이면 즉시 fix 진행 의사 묻기
```

## 출력 예시

```markdown
## UX Explorer 결과 — production (commit 94fcac6)

테스트 유저: ux-test-1778120000@test.local
실행 phase: 1~11
캡처: qa/ux-explorer/2026-05-07/ (45 screenshots)

### 🔴 Broken (1)
B-1: Phase 4 — 일기 자동저장 후 즉시 F5 시 마지막 1글자 유실
- 재현: ...
- 영향: 빈도 높음 / 사용자 데이터 손실 위험
- 추정 원인: my-space-diary-edit.js debounce + visibilitychange handler 부재

### 🟡 Awkward (3)
A-1: Phase 7 — 검색 결과 클릭 후 back → 검색어 사라지고 dashboard
A-2: Phase 9 — 모달 backdrop 클릭이 click-through 처리됨
A-3: Phase 2 — 가입 후 first space 만들기 전 새로고침 시 온보딩 다시 노출

### 🟢 Polish (2)
...

### ✅ Smooth (8)
...

### 다음 fix 우선순위
1. B-1 즉시
2. A-1, A-3 다음 sprint
```

## 안전 / cleanup

- **production 검사 시**: 매 실행마다 새 테스트 유저가 운영 DB 에 남는다. 검사 종료 후 cleanup 권장:
  ```bash
  docker compose exec db psql -U aihub -d aihub -c "DELETE FROM \"User\" WHERE email LIKE 'ux-test-%@test.local';"
  ```
  (cascade 로 Space/DiaryEntry/Recipe/FreeformNote 함께 삭제됨)
- **rate limit**: 5 logins/min — phase 1~2 도중 자주 부딪힐 수 있어 60s 대기 + 재시도 자동 처리
- **destructive 액션 금지**: 다른 사용자 데이터 / admin 액션 시도 X

## 사용 예시

```
/ux-explore
  → live 전체 phase, 약 5~10분 소요

/ux-explore --local
  → docker 환경에서 같은 phase

/ux-explore phase 4 phase 6
  → 자동저장 + 마크다운 영역만 집중 (특정 fix 후 회귀)
```

## 출력 후속

- 🔴 Broken → 즉시 fix 사이클 (`/fix` 또는 직접 수정)
- 🟡 Awkward → `docs/plan/backlog.md` UX 섹션에 항목 추가
- ✅ Smooth → e2e-runner 의 회귀 spec 후보로 등록 가능
