# My Space — Phase 3.1 작업 분해 (이미지 업로드: 레시피 커버)

_작성일: 2026-05-05_
_연관 결정사항: [docs/decisions/my-space-phase-3-decisions.md](../decisions/my-space-phase-3-decisions.md) §3.1 (1.1~1.4)_

## 결정사항 (확정값)

- **1.1 저장 백엔드**: A — 로컬 볼륨 (`./uploads`, docker-compose named volume + nginx 정적 서빙)
- **1.2 이미지 처리**: B — `sharp` 자동 리사이즈 (max 1200px width)
- **1.3 콘텐츠 타입**: jpeg / png / webp 만 허용, magic byte 검증
- **1.4 업로드 스코프**: A — 레시피 커버 1장만 (일기 첨부는 별도 페이즈)

## 현재 상태 (main)

- `Recipe.coverImage` 가 schema 에 이미 정의 (`String?`) — Phase 1.5 에서 비활성화됨
- `backend/src/routes/upload.js` — 기존 `/api/upload` 라우트 (PDF/이미지 → base64 응답). Jira agent 의 file 입력에 사용됨. **그대로 유지** — 본 페이즈는 새 라우트 추가.
- 프론트엔드 레시피 편집 화면 (`my-space-recipe-edit.html` + `.js`) 이미 동작 중. `coverImage` 필드는 폼에 없음.
- 기존 `multer` 의존성 활용 가능. `sharp` 신규 추가 필요.

## 목표

- 사용자가 레시피 편집 화면에서 커버 이미지 1장 업로드 가능
- 5MB 이하, jpeg/png/webp 만 허용, magic byte 검증으로 위장 거부
- 업로드 시 자동 리사이즈 (max 1200px width, aspect ratio 유지)
- 저장 위치: docker-compose named volume `recipe_covers:/app/uploads/recipes`, nginx 가 `/uploads/recipes/<filename>` 로 정적 서빙
- 파일명: `<userId>-<spaceId>-<recipeId>-<timestamp>.<ext>` (예측 어렵게 + collision 방지)
- 레시피 카드 그리드 / 편집 화면에서 커버 노출

---

## Worker A — Backend (upload route + sharp + tests)

**Branch suffix**: `recipe-image-be`

**소유 파일**:
- `backend/package.json` (sharp 의존성 추가)
- `backend/package-lock.json` (자동 갱신)
- `backend/src/routes/recipeUpload.js` (NEW — 별도 파일, upload.js 와 분리)
- `backend/src/createApp.js` (라우트 등록 1줄)
- `backend/__tests__/recipeUpload.test.js` (NEW)
- `Dockerfile` 또는 `backend/Dockerfile` (uploads 디렉토리 생성)
- `docker-compose.yml` (named volume + 마운트)

### 작업

1. **의존성 추가** (`backend/package.json`):
   - `sharp` ^0.33+ (이미지 리사이즈)
   - magic byte 검증은 직접 구현 (외부 lib 0 — 4-byte 시그니처만 확인)

2. **`recipeUpload.js`** (NEW 라우트):
   - `POST /api/my-space/:spaceId/recipes/:recipeId/cover` — `requireAuth` + `loadOwnedSpace` (404 정책 그대로)
   - `multer` memory storage (디스크 안 거치고 sharp 로 직접 파이프)
   - 검증:
     - `req.file.size <= 5 * 1024 * 1024` (5MB)
     - `req.file.mimetype ∈ { 'image/jpeg', 'image/png', 'image/webp' }`
     - magic byte 검증: 첫 4바이트로 실제 포맷 확인 (jpeg `FFD8FFXX`, png `89504E47`, webp `RIFF...WEBP`)
   - 처리:
     - `sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).toFormat('webp', { quality: 82 }).toBuffer()` — 항상 webp 로 정규화
     - 파일명: `${userId}-${spaceId}-${recipeId}-${Date.now()}.webp`
     - 저장 경로: `/app/uploads/recipes/<filename>`
     - 기존 cover 가 있으면 (`recipe.coverImage` 가 비어있지 않으면) 새 파일 저장 후 옛 파일 unlink (실패해도 graceful)
   - 응답: `{ url: '/uploads/recipes/<filename>' }` — 프론트는 이 URL 을 그대로 src 로 사용
   - `recipe.coverImage` 를 같은 URL 로 PATCH (Prisma)
3. **삭제 라우트** (`DELETE /api/my-space/:spaceId/recipes/:recipeId/cover`):
   - 기존 cover 가 있으면 unlink + DB 의 `coverImage` 를 null 로
   - 응답: `{ ok: true }`
4. **`createApp.js`**: `app.use('/api/my-space', requireAuth, recipeUploadRouter)` 또는 mySpaceRouter 안에 mount
5. **Dockerfile**: `RUN mkdir -p /app/uploads/recipes` 추가
6. **`docker-compose.yml`**:
   ```yaml
   volumes:
     postgres_data:
     recipe_covers:        # NEW
   services:
     backend:
       volumes:
         - recipe_covers:/app/uploads/recipes
     frontend:
       volumes:
         - recipe_covers:/usr/share/nginx/html/uploads/recipes:ro    # nginx 정적 서빙
   ```
7. **통합 테스트** (`recipeUpload.test.js`):
   - happy path: jpeg 5MB 미만 업로드 → 200 + URL 반환
   - 5MB 초과 → 413 (multer limits) 또는 400
   - mimetype 위장 (`.jpg` 인데 magic byte `text/plain`) → 400
   - svg 업로드 시도 → 400
   - 다른 유저의 recipeId → 404
   - DELETE cover happy path
   - Mock sharp/fs (또는 실제 파이프 — tmpfs 활용)

### Verify
- `npm --prefix backend test` 통과 (47 + 6+ = 53+)
- `docker compose build backend` 성공 (sharp 네이티브 빌드 포함)
- 컨테이너 안에서 `/app/uploads/recipes` 가 named volume 으로 마운트됨

### 커밋 (per-unit, 3개)
- `chore(deps): add sharp ^0.33 for image resize`
- `feat(backend): add recipe cover upload route with magic-byte validation and sharp resize`
- `chore(infra): add recipe_covers named volume to docker-compose for persistent uploads`

---

## Worker B — Frontend (편집 화면 + 카드 그리드)

**Branch suffix**: `recipe-image-fe`

**소유 파일**:
- `frontend/src/js/my-space/recipes.js` (확장 — 카드 렌더에 cover 추가, upload helper)
- `frontend/src/js/pages/my-space-recipe-edit.js` (확장 — cover dropzone)
- `frontend/src/css/my-space-recipe.css` (확장)

### 작업

1. **편집 화면 cover dropzone** (`my-space-recipe-edit.js`):
   - 폼 상단에 cover 영역:
     - 이미지 없음: 점선 박스 "📷 커버 이미지 업로드 / 클릭 또는 드래그 (JPEG/PNG/WebP, 5MB 이하)"
     - 이미지 있음: `<img>` 미리보기 + 우상단 ✕ 버튼 (삭제)
   - 클릭 → `<input type="file" accept="image/jpeg,image/png,image/webp">` trigger
   - 드래그 & 드롭 지원
   - 파일 선택 시:
     - 클라이언트 검증: type + size 즉시 거부 (5MB 초과, 비-허용 mime)
     - `FormData` 로 `POST /api/my-space/:spaceId/recipes/:recipeId/cover` 호출
     - 진행 중 spinner + "업로드 중…"
     - 응답 `{ url }` → 미리보기 갱신, `recipe.coverImage = url`
     - 실패 → 에러 토스트
   - ✕ 클릭 → 확인 후 `DELETE /api/my-space/:spaceId/recipes/:recipeId/cover` 호출 → 미리보기 제거
   - **innerHTML 0** — `<img>` 도 createElement 로

2. **레시피 카드에 cover** (`recipes.js` `renderRecipeCard`):
   - `recipe.coverImage` 있으면 카드 상단에 16:9 비율 이미지 (object-fit: cover) 노출
   - 없으면 placeholder (이모지 🍳 + 카테고리 토큰 색)
   - 카드 그리드 레이아웃 약간 조정 (cover 높이 추가)

3. **CSS** (`my-space-recipe.css`):
   - `.ms-recipe-cover-dropzone` — 점선 박스 (idle), 호버 시 accent border, dragover 시 더 짙은 accent
   - `.ms-recipe-cover-dropzone--has-image` — 점선 제거, 이미지 표시
   - `.ms-recipe-cover-preview` — img 스타일, 16:9 ratio, max-width 100%
   - `.ms-recipe-cover-remove-btn` — ✕ 버튼 (우상단)
   - `.ms-recipe-card__cover` — 카드 cover 영역 (height 160px, object-fit: cover)
   - `.ms-recipe-card__cover-placeholder` — 이모지 + bg

### 의존성
- Worker A 의 라우트 계약 (`POST/DELETE /api/my-space/:spaceId/recipes/:recipeId/cover`) 에만 의존 → 동시 진행 가능

### Verify
- 콘솔 에러 0
- `grep -nE "innerHTML\s*=" frontend/src/js/my-space/recipes.js frontend/src/js/pages/my-space-recipe-edit.js` → 빈 결과

### 커밋 (per-unit, 2개)
- `feat(frontend): add recipe cover dropzone with drag-and-drop upload`
- `feat(frontend): render recipe cover in card grid with placeholder fallback`

---

## Worker C — QA + nginx 정적 서빙

**Branch suffix**: `recipe-image-glue`

**소유 파일**:
- `frontend/nginx.conf` (`/uploads/` location block)
- `qa/my-space-recipe-cover.spec.js` (NEW)

### 작업

1. **nginx**:
   ```
   # 레시피 커버 정적 서빙
   location /uploads/ {
     alias /usr/share/nginx/html/uploads/;
     access_log off;
     expires 30d;
     add_header Cache-Control "public, immutable";
   }
   ```

2. **Playwright** (`qa/my-space-recipe-cover.spec.js`):
   - 로그인 → recipe space 생성 → 새 레시피 작성 페이지
   - dropzone 에 `setInputFiles` 로 테스트 jpeg (1024x768, ~50KB) 업로드
   - 업로드 진행 → 미리보기 노출 확인
   - 응답 URL 이 `/uploads/recipes/...webp` 패턴인지 (sharp 가 webp 로 변환)
   - 저장 → 목록으로 돌아가 카드 그리드에서 cover 이미지 노출 확인
   - 5MB 초과 파일 시도 → 클라이언트 거부 (서버 도달 X)
   - .txt 확장자만 변경한 fake jpeg 시도 → 서버 400
   - cover 삭제 → 미리보기 사라짐, 응답 OK
   - 콘솔/pageerror 0

### 의존성
- Worker A, B 의 머지 후 마지막 검증 — 단, nginx config 작성은 동시 진행 가능

### 커밋 (per-unit, 2개)
- `chore(infra): add nginx /uploads/ location block for recipe covers`
- `test(e2e): add Phase 3.1 recipe cover upload Playwright spec`

---

## 머지 / Synthesis 순서

1. Worker A → main (백엔드 + 의존성 + volume)
2. Worker C → main (nginx + Playwright — Worker A 의 라우트 + Worker B 의 UI 기다리지만 충돌 없음)
3. Worker B → main (프론트 — Worker A 의 API + Worker C 의 nginx 위에서 동작)
4. `docker compose down` (volume 보존) → `build` → `up -d` → healthcheck
5. `npm --prefix backend test` (53+)
6. Playwright 4 specs 회귀 + 신규 cover spec

---

## Done 정의 (Phase 3.1)

- [x] sharp 의존성 추가 + Dockerfile uploads 디렉토리
- [x] docker-compose 에 `recipe_covers` named volume + 마운트
- [x] nginx `/uploads/` 정적 서빙
- [x] `POST/DELETE /api/my-space/:spaceId/recipes/:recipeId/cover` 라우트 + magic byte 검증
- [x] sharp 로 자동 리사이즈 (max 1200px) + webp 변환
- [x] 편집 화면 dropzone (드래그/클릭/✕)
- [x] 카드 그리드 cover 노출 + placeholder
- [x] 백엔드 통합 테스트 6+ 추가 (8개 추가, 총 55개)
- [x] Playwright happy path + 거부 케이스 회귀
- [x] innerHTML 0
- [ ] **데이터 보존 검증**: 배포 후에도 기존 cover 파일이 named volume 에 유지됨 (배포 후 확인 필요)

---

## 데이터 보존 주의사항 (배포 시)

- `recipe_covers` named volume 은 `docker compose down` 으로 제거되지 않음. `docker compose down -v` 또는 `docker volume rm` 만 제거.
- 새 마이그레이션 추가 시 기존 cover 파일은 영향 없음 (DB 만 수정).
- production 배포: deploy.yml 이 `down -v` 사용 안 함 — 안전.
- 검증 환경에서 down -v 사용 시 cover 파일도 함께 사라짐 — 검증 후 재업로드 필요.

---

## 미루는 항목 (Phase 3.1 외)

- 일기 첨부 (다중 이미지) — Phase 3.1.5 또는 별도 페이즈
- 이미지 EXIF 메타데이터 제거 — 보안 강화 차원, 후속
- 썸네일 생성 (카드 그리드 전용 작은 사이즈) — 성능 최적화 후순위
- 이미지 lazy loading — 카드 30+ 일 때 의미

→ 잔여 후속 항목은 [`docs/plan/backlog.md`](./backlog.md) 에 통합 정리됨.
