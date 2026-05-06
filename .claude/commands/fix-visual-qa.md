# Fix Visual QA Issues

`docs/plan/visual-qa-issues.md`에 정의된 UI/UX 이슈를 순서대로 수정한다.

## 워크플로우

### 1. 이슈 목록 로드

`docs/plan/visual-qa-issues.md`를 읽어 수정해야 할 이슈 전체를 파악한다.

### 2. 프론트엔드 구조 파악

`frontend/src/`, `frontend/pages/`, `frontend/src/styles/` 등 관련 파일을 먼저 탐색해 스타일 시스템(CSS 변수, Tailwind, 컴포넌트 구조)을 이해한다.

### 3. Warning 이슈 우선 수정 (W-1 → W-6)

각 이슈마다:
1. 관련 소스 파일을 `Read`로 확인
2. `Edit`으로 최소 변경 적용
3. 수정 내용과 파일명을 간략히 보고

수정 순서:
- **W-1**: 다크모드 링크 텍스트 색상 — CSS 변수 또는 클래스에서 `color` 값 조정
- **W-2**: 모바일 카드 패딩 — 카드 컴포넌트 또는 CSS에서 반응형 padding 추가
- **W-3**: 테마 전환 버튼 `min-height: 44px` 추가
- **W-4**: 페이지 이동 링크 `padding` 확대로 터치 타겟 44px 확보
- **W-5**: 입력 필드 테두리 불투명도 상향 (다크 0.20+, 라이트 0.15+)
- **W-6**: 로그인 페이지에서 인증 API 호출 조건 추가

### 4. Minor 이슈 수정 (M-1 → M-6)

- **M-1**: 레이블/서브타이틀 글꼴 크기 상향
- **M-2**: 입력 필드 `aria-label` 추가
- **M-3**: 데스크탑 폼 수직 중앙 정렬 수정
- **M-4**: nginx 커스텀 404 또는 SPA fallback 설정 (`frontend/nginx.conf`)
- **M-5**: Cloudflare RUM — 코드 수정 불필요, 사용자에게 대시보드 확인 요청
- **M-6**: `.glow` 요소 `max-width` 또는 `right` 제한 추가

### 5. 로컬 서버에서 재검증

수정 완료 후 `http://localhost:3100`에서 브라우저로 각 수정 사항을 확인한다:
- 다크/라이트 모드 전환
- 모바일(375px) 뷰포트 리사이즈
- 폼 입력 필드 테두리 가시성
- 링크 터치 영역

### 6. 이슈 파일 업데이트

수정 완료한 이슈에 `✅ 수정완료` 표시를 추가한다. 수정하지 못한 이슈(M-5 등)에는 이유를 명시한다.

### 7. 결과 보고

```
Fix Visual QA 완료

수정된 이슈: W-N개, M-N개
수정 파일: path/to/file.css 등
미수정 이슈: M-5 (Cloudflare 대시보드 설정 필요)
```

## 주의사항

- 코드 수정은 최소 diff 원칙 — 이슈 수정에 필요한 변경만 적용
- 다른 기능에 영향을 주는 전역 CSS 변경 시 반드시 라이트/다크 양쪽 확인
- nginx.conf 수정 시 `docker compose restart frontend` 필요
