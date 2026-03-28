# TODOS

## Phase 2 — After Coach Adoption Validation

### P2: Team Management
- **What:** 팀 생성/가입/로스터/코치초대 기능
- **Why:** 코치 채택 검증 후 팀 단위 사용으로 확장
- **Effort:** M (human) → S (CC: ~30분 — 코드 이미 작성됨)
- **Priority:** P2
- **Depends on:** 코치 채택 검증 (성공 기준 #1: 3명 코치 활성화, #4: 3회 연속 사용)
- **Context:** `teamRoutes.ts`, `TeamPage.tsx`, `TeamCreatePage.tsx`, `TeamJoinPage.tsx`, 마이그레이션 SQL 이미 작성됨. Phase 2에서는 코치 공유 데이터(`drill_shares`)와 팀 기능을 연결해야 함.

### P3: DM Chat + Team Group Chat
- **What:** 1:1 DM + 팀 그룹채팅 (Supabase Realtime)
- **Why:** 커뮤니티/팀 간 소통 채널
- **Effort:** M (human) → S (CC: ~15분 — 코드 이미 작성됨)
- **Priority:** P3
- **Depends on:** Team Management (그룹채팅), Community (DM)
- **Context:** `chatRoutes.ts` (201줄), `MessagesPage.tsx` (340줄) 이미 작성됨. Realtime 구독 구현 완료.

### P3: Team Matching
- **What:** 연습경기 상대 모집 게시판
- **Why:** 팀 간 교류 촉진
- **Effort:** S (human) → S (CC: ~10분 — 코드 이미 작성됨)
- **Priority:** P3
- **Depends on:** Team Management
- **Context:** `matchRoutes.ts` (80줄), `MatchesPage.tsx` 이미 작성됨.
