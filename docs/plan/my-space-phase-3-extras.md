# My Space — Phase 3 Extras (백로그)

_이 파일은 Phase 2 구현 완료 후 미구현 항목을 백로그로 이관한 목록입니다._

## 이관 배경

Phase 2 스프린트(2026-05-03)에서 Notes + Markdown 렌더링이 완료되었습니다. 아래 항목들은 원래 Phase 2 범위에 포함되어 있었으나 별도 스프린트로 분리되었습니다.

## 백로그 항목

### 이미지 업로드
- 레시피 커버 이미지 업로드 (`coverImage` 필드는 스키마에 이미 존재)
- 일기 본문 첨부 이미지
- 기존 `/api/upload` 엔드포인트 확장 또는 별도 정책 결정 필요
- `coverImage` 최대 크기, 허용 형식, 저장 방식(base64 vs. 오브젝트 스토리지) 정의 필요

### Space 다중 생성 / 멀티-Space UI
- 현재는 사실상 단일 Space 사용
- Space 목록 화면, Space 간 전환 UI
- 동일 템플릿의 Space를 여러 개 허용할지 정책 결정 필요

### 전문 검색 (Full-Text Search)
- 일기·레시피·노트 전체 검색
- PostgreSQL `tsvector` + GIN 인덱스 또는 `pg_trgm` 검토
- 검색 결과 하이라이팅 UI
