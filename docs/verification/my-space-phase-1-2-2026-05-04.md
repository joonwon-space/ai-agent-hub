# My Space Phase 1 + 1.5 + 2 — Docker 환경 검증 요청

_요청일: 2026-05-04_
_요청자: 메인 개발 환경 (Docker daemon 비가동)_
_대상 브랜치: `main` (commit `bce9824` 이후)_

본 문서는 Docker 환경이 갖춰진 환경에서 수행해 줄 검증 요청서다. 메인 개발 환경에서는 Docker 데몬이 떠 있지 않아 통합/E2E 검증이 불가능하므로, 본 검증 결과를 가지고 main 의 안정성 여부를 판단한다.

---

## 1. 검증 대상

main 의 commit `bce9824 feat(my-space): merge Phase 1 + 1.5 + 2`에 포함된 모든 변경.

| 페이즈 | 범위 | 사양 문서 |
|---|---|---|
| Phase 1 | Space + Diary CRUD, 화면 01/02/03, 사이드바 Personal | [docs/plan/my-space-phase-1.md](../plan/my-space-phase-1.md) |
| Phase 1.5 | Recipe CRUD, 화면 04/05, 자동저장 | [docs/plan/my-space-phase-1.5.md](../plan/my-space-phase-1.5.md) |
| Phase 2 (Notes) | FreeformNote CRUD, sanitized 마크다운 | [docs/plan/my-space-phase-2-notes.md](../plan/my-space-phase-2-notes.md) |

이미 메인 환경에서 검증된 항목 (재검증 불요):
- 백엔드 Jest 테스트 40/40 passing (6 suites)
- 신규 코드 `innerHTML` 사용 0 (grep)
- 외부 마크다운 라이브러리 의존성 0
- Prisma generate 통과

이 환경에서만 검증 가능한 항목 (이번 요청의 핵심):
- Docker 빌드 + 컨테이너 기동 + 마이그레이션 적용
- 4개 신규 테이블이 PostgreSQL 에 실제 생성되는지
- 19개 `/api/my-space/*` 엔드포인트가 컨테이너 환경에서 응답
- 자동저장 end-to-end (브라우저 → API → DB)
- Playwright 3개 spec
- 사이드바 → My Space 진입 → 콘솔 에러 0

---

## 2. 사전 조건

- [ ] Docker Desktop 가동
- [ ] 저장소 main 으로 동기화: `git checkout main && git pull --ff-only`
- [ ] HEAD 가 `bce9824` 이상인지 확인 (`git log -1 --format=%H`)
- [ ] Node 환경: 백엔드 컨테이너는 `Dockerfile` 기준 Node 20+

---

## 3. 검증 절차

### 3.1 빌드 + 기동

```bash
docker compose down -v          # 깨끗한 DB 로 마이그레이션 검증
docker compose build
docker compose up -d
```

백엔드 컨테이너 startup 로그에서 다음 두 줄 확인:
```
Applying migration `20260426055925_init`
Applying migration `20260503000000_add_my_space`
```

헬스체크 폴링 (60s timeout):
```bash
until curl -fsS http://localhost:3100/health 2>/dev/null; do sleep 2; done
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost/   # 200
```

### 3.2 DB 스키마 실재 확인 (Phase 1 Done #1)

```bash
docker compose exec db psql -U postgres -d ai_agent_hub -c '\dt'
```
**예상**: 다음 8개 테이블 노출:
- `User`, `UserSetting`, `Session` (기존)
- `Space`, `DiaryEntry`, `Recipe`, `FreeformNote` (Phase 1 신규)
- `_prisma_migrations` (Prisma 메타)

```bash
docker compose exec db psql -U postgres -d ai_agent_hub \
  -c '\d "Space"' \
  -c '\d "DiaryEntry"' \
  -c '\d "Recipe"' \
  -c '\d "FreeformNote"'
```
- `Space.userId` 가 `User(id)` 외래키 + ON DELETE CASCADE 인지
- 각 모델의 `spaceId` 외래키 + 인덱스 존재
- `DiaryEntry.entryDate` 타입이 `date` 인지

### 3.3 백엔드 테스트 (컨테이너 환경)

호스트에서 이미 통과되었지만 컨테이너에서도 한번:
```bash
docker compose exec backend npm test
```
**예상**: 6 suites, 40 tests, 0 failures.

### 3.4 API 스모크 (curl)

스크립트로 자동화 권장. 핵심 시나리오:

```bash
# 사용자 1 등록 + 로그인
curl -c /tmp/c1.txt -sS -X POST http://localhost/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke1@test.local","password":"Pass1234!"}'
curl -c /tmp/c1.txt -sS -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke1@test.local","password":"Pass1234!"}'

# Space 생성
SID=$(curl -b /tmp/c1.txt -sS -X POST http://localhost/api/my-space \
  -H 'Content-Type: application/json' \
  -d '{"name":"내 공간","template":"diary"}' | jq -r .id)

# Diary
DID=$(curl -b /tmp/c1.txt -sS -X POST http://localhost/api/my-space/$SID/diary \
  -H 'Content-Type: application/json' \
  -d '{"entryDate":"2026-05-04","mood":"happy","title":"smoke","body":"hello"}' | jq -r .id)
curl -b /tmp/c1.txt -sS -X PATCH http://localhost/api/my-space/$SID/diary/$DID \
  -H 'Content-Type: application/json' \
  -d '{"body":"hello (autosave)"}'

# Recipe (같은 space 에 layered)
RID=$(curl -b /tmp/c1.txt -sS -X POST http://localhost/api/my-space/$SID/recipes \
  -H 'Content-Type: application/json' \
  -d '{"name":"김치찌개","category":"한식","difficulty":"easy","ingredients":[{"name":"김치","amount":"200g"}],"steps":[{"order":1,"text":"끓인다"}]}' | jq -r .id)
curl -b /tmp/c1.txt -sS http://localhost/api/my-space/$SID/recipes?category=한식

# Note
NID=$(curl -b /tmp/c1.txt -sS -X POST http://localhost/api/my-space/$SID/notes \
  -H 'Content-Type: application/json' \
  -d '{"title":"메모","body":"# 헤더\n\n**bold**"}' | jq -r .id)
curl -b /tmp/c1.txt -sS -X PATCH http://localhost/api/my-space/$SID/notes/$NID \
  -H 'Content-Type: application/json' \
  -d '{"pinned":true}'
curl -b /tmp/c1.txt -sS http://localhost/api/my-space/$SID/notes
# → 첫 원소가 pinned:true 인지 확인 (정렬: pinned desc, updatedAt desc)

# 소유자 격리 회귀 (CRITICAL)
curl -c /tmp/c2.txt -sS -X POST http://localhost/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke2@test.local","password":"Pass1234!"}'
# 다른 유저가 같은 spaceId 접근 → 404 만 통과 (403 이면 보안 이슈)
curl -b /tmp/c2.txt -sS -o /dev/null -w "%{http_code}\n" http://localhost/api/my-space/$SID/diary
curl -b /tmp/c2.txt -sS -o /dev/null -w "%{http_code}\n" http://localhost/api/my-space/$SID/recipes
curl -b /tmp/c2.txt -sS -o /dev/null -w "%{http_code}\n" http://localhost/api/my-space/$SID/notes
# 모두 404 여야 함
```

### 3.5 Playwright (3 specs)

```bash
npx playwright install chromium    # 최초 1회
npx playwright test qa/ --reporter=list
```

**기대값**: 3 specs 모두 통과 + 콘솔/페이지 에러 0:
- `qa/my-space.spec.js` — Phase 1 일기 happy path
- `qa/my-space-recipes.spec.js` — Phase 1.5 레시피 happy path
- `qa/my-space-notes.spec.js` — Phase 2 노트 happy path + **XSS/링크 살균 회귀** (이게 실패하면 즉시 STOP)

각 spec 의 핵심 단언:
- 일기/레시피/노트 작성 → 700ms 후 인디케이터 "저장됨 ✓"
- 목록 페이지에 방금 만든 항목 노출
- 노트: 미리보기에 `<h1>`, `<strong>`, `<em>`, `<code>`, `<ul><li>` 정상 렌더
- 노트: `<script>` 본문 → `window.__pwned === undefined`
- 노트: `[click](javascript:alert(1))` → `<a>` 0개

### 3.6 시각 점검 (수동 1회)

브라우저로 `http://localhost/login` → 로그인 → 사이드바 "My Space" 클릭 → 다음 확인:
- [ ] 사이드바 "Personal" 섹션 + "My Space" 링크 + "NEW" 배지
- [ ] 화면 01 (온보딩): 템플릿 카드 3개 (일기/레시피/자유 형식), 각각 token color 적용
- [ ] 화면 02 (대시보드): inner sidebar 180px, "+ 새로 작성" 버튼
- [ ] 화면 03 (일기 편집): 날짜 picker, mood 4 버튼, 자동저장 인디케이터
- [ ] 화면 04 (레시피 목록): 카테고리 탭 5개, 카드 그리드
- [ ] 화면 05 (레시피 편집): 재료/단계 행 추가/삭제 동작
- [ ] 화면 06 (노트 목록): 핀 섹션 + 일반 섹션
- [ ] 화면 07 (노트 편집): 좌(textarea) / 우(미리보기) 50/50 split
- [ ] 사이드바의 기존 jira 에이전트 링크가 여전히 클릭 가능 + 패널 노출 (회귀)

### 3.7 콘솔/네트워크

위 모든 페이지에서 DevTools Console 빨간 에러 0, Network 탭에 4xx/5xx 0 (인증 실패 의도된 401 제외).

---

## 4. 보고 포맷

본 파일에 PR 코멘트로 또는 별도 파일 `docs/verification/my-space-phase-1-2-2026-05-04-report.md` 로 회신:

1. 빌드 + up 결과 (마이그레이션 로그 발췌)
2. DB 검증: `\dt` 출력, 4개 신규 테이블 + FK 확인
3. 백엔드 테스트: pass/fail 카운트
4. curl 스모크 transcript (소유자 격리 회귀의 404 3건 강조)
5. Playwright 결과 (각 spec pass/fail + duration + 콘솔 에러)
6. 시각 점검 체크리스트 (3.6 의 9 항목)
7. **STOP 사유** (있다면) — 무엇이 왜 깨졌는지 + 최소 재현 명령
8. **GO/NO-GO 판단** — main 이 production-ready 인가

NO-GO 판단 시 issue 생성 또는 코멘트로 해당 페이즈 브랜치 (보존됨) 에 fix 커밋 제안.

---

## 5. 보존된 페이즈 브랜치 (참고용)

검증 회귀 발생 시 fix 작업 베이스로 사용할 수 있도록 다음 브랜치는 **삭제하지 말 것**으로 요청하던 브랜치들이다. **2026-05-04 시점에 main 머지 확정되어 정리 예정**:

- `team-implement/20260503-2148` (Phase 1)
- `team-implement-phase-1.5/20260503-2304` (Phase 1.5)
- `team-implement-phase-2-notes/20260503-2314` (Phase 2)

main 에 이미 다 머지되었으므로 검증 후 삭제해도 무방. 단 NO-GO 시 fix 워크플로 편의를 위해 회신 받기 전까지 보존.
