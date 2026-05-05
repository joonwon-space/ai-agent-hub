# 보류된 dependency 업그레이드

_작성일: 2026-05-05_

dependabot 가 제안한 업그레이드 중 **즉시 적용 불가**라 보류한 항목 기록. 각 항목은 단순 cherry-pick 으로 끝나지 않으며 별도 마이그레이션 작업이 필요하다.

---

## 1. pdf-parse 1.1.4 → 2.4.5

### 시도 결과
- 2026-05-05 cherry-pick → `npm test` 실패 (모든 6 suite 가 require 단계에서 깨짐)
- 에러: `ReferenceError: DOMMatrix is not defined` at `node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.mjs`
- 원인: pdf-parse 2.x 가 `pdfjs-dist` 를 bundling. 이 라이브러리는 브라우저 전제로 만들어져 Node.js 에서 `DOMMatrix` 글로벌이 없어 require 자체가 실패.

### 사용 위치
- `backend/src/routes/upload.js` 라인 3 — `const pdfParse = require('pdf-parse');`
- `/api/upload` 라우트에서 PDF 첨부의 텍스트 추출 (Jira agent 의 file 입력에 활용)

### 마이그레이션에 필요한 것
1. **대안 1**: `pdfjs-dist` 의 Node-friendly path 임포트 (`pdfjs-dist/legacy/build/pdf.js` 가 아닌 다른 entrypoint) 가 가능한지 점검
2. **대안 2**: Node 환경 polyfill (`canvas`, `jsdom` 의 `DOMMatrix`) 추가 — 단, 의존성 무겁고 테스트 환경 분리 필요
3. **대안 3**: pdf-parse 대신 다른 라이브러리 (`pdf2json`, `pdf-text-extract`) 로 교체 — API 차이로 upload.js 재작성 필요
4. **대안 4**: 1.x 유지 — 최신 보안 패치만 1.x branch 에서 cherry-pick

### 권장
**대안 4** (현재 1.1.x 유지). PDF 추출 기능이 핵심 기능 아닌 부가 기능이므로 메이저 업그레이드 ROI 낮음. dependabot 이 다시 제안할 때까지 또는 1.x EOL 시까지 유지.

---

## 2. @prisma/client 5.22.0 → 7.8.0

### 시도 결과
- cherry-pick 시도 안 함 (사전 차단)
- 사유: 버전 점프가 너무 큼 (5 → 6 → 7, 메이저 2단계). 6.x, 7.x 각각 breaking change 다수.

### 영향 범위
- `backend/prisma/schema.prisma` — 스키마 syntax 변경 가능성 (5.x → 6.x 에서 일부 deprecation)
- `backend/src/services/db.js` — Prisma Client 사용처
- `backend/__tests__/*.test.js` — 모든 통합 테스트가 Prisma 사용
- 마이그레이션 파일 — 형식 변경 시 재생성 필요

### 마이그레이션에 필요한 것
1. **5.x → 6.x changelog 검토**: deprecated API 사용 여부 확인
   - Reference: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-6
2. **6.x → 7.x changelog 검토**: 추가 breaking change
3. **schema.prisma 검증**: `npx prisma validate` 후 `npx prisma generate`
4. **마이그레이션 무결성**: 기존 migration 파일을 새 Prisma CLI 가 그대로 적용 가능한지 (`prisma migrate diff`)
5. **테스트 회귀**: 40+ 통합 테스트 모두 통과 확인

### 권장
**별도 sprint** — `team-implement` 의 `migration-checker` agent + `database-reviewer` agent 활용. 단계별:
1. 먼저 5 → 6 만 시도. 6 에서 안정화되면 7 로 추가 점프.
2. 또는 7 직행 후 회귀 테스트 결과로 판단.

dependabot 브랜치 `dependabot/npm_and_yarn/backend/prisma/client-7.8.0` 는 **삭제하지 않고 보존** — 마이그레이션 sprint 시 base 로 활용.

### 시작 조건
- 다른 진행 중인 작업 (Jira 검증, Phase 3 sprint) 가 모두 완료되어 main 이 안정 상태일 때
- DB 백업/복원 테스트 가능한 환경 확보

---

## 3. dependabot 정리 결과 (2026-05-05)

| dep | from | to | 결과 |
|---|---|---|---|
| `actions/setup-node` | v4 | v6 | ✅ 머지 (`4d9e085`) |
| `docker/build-push-action` | v6 | v7 | ✅ 머지 (`13f513c`) |
| `dorny/paths-filter` | v3 | v4 | ✅ 머지 (`665e9f8`) |
| `dotenv` | 16.6.1 | 17.4.2 | ✅ 머지 (`a20850d`) — 테스트 40/40 통과 |
| `pdf-parse` | 1.1.4 | 2.4.5 | ❌ 보류 (DOMMatrix 이슈) — §1 참조 |
| `@prisma/client` | 5.22.0 | 7.8.0 | ❌ 보류 (메이저 2단계 점프) — §2 참조 |

머지된 4개 dependabot 브랜치는 origin 에서 삭제. pdf-parse, prisma 브랜치는 보존.
