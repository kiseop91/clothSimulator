-- =============================================
-- Phase 1: Teams, Community, Matching, Chat
-- 순서: 모든 테이블 먼저 → RLS/정책 나중에
-- =============================================

-- 1. Update profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tier_check CHECK (tier IN ('free', 'pro', 'team'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_role text NOT NULL DEFAULT 'player' CHECK (user_role IN ('player', 'coach'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_coach boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coach_bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tip_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_tips_received int NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- =============================================
-- 2. CREATE ALL TABLES FIRST (no RLS yet)
-- =============================================

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.team_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('owner', 'coach', 'player')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE public.team_drills (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  drill_id text NOT NULL REFERENCES public.drills(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, drill_id)
);

CREATE TABLE public.team_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  scheduled_date date,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shared_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  tags text[] DEFAULT '{}',
  drill_data jsonb NOT NULL,
  likes_count int NOT NULL DEFAULT 0,
  views_count int NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.drill_likes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_drill_id uuid NOT NULL REFERENCES public.shared_drills(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shared_drill_id)
);

CREATE TABLE public.match_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  rink_location text NOT NULL,
  preferred_date date NOT NULL,
  time_slot text NOT NULL,
  skill_level text NOT NULL CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'all')),
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'completed', 'canceled')),
  matched_team_id uuid REFERENCES public.teams(id),
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'team')),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE public.messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE TABLE public.tips (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount int NOT NULL,
  platform_fee int NOT NULL DEFAULT 0,
  coach_payout int NOT NULL DEFAULT 0,
  payment_provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 3. INDEXES
-- =============================================

CREATE INDEX idx_teams_owner ON public.teams(owner_id);
CREATE INDEX idx_teams_invite_code ON public.teams(invite_code);
CREATE INDEX idx_team_members_team ON public.team_members(team_id);
CREATE INDEX idx_team_members_user ON public.team_members(user_id);
CREATE INDEX idx_team_drills_team ON public.team_drills(team_id);
CREATE INDEX idx_team_sessions_team ON public.team_sessions(team_id);
CREATE INDEX idx_team_sessions_date ON public.team_sessions(scheduled_date);
CREATE INDEX idx_shared_drills_user ON public.shared_drills(user_id);
CREATE INDEX idx_shared_drills_public ON public.shared_drills(is_public, created_at DESC);
CREATE INDEX idx_shared_drills_tags ON public.shared_drills USING GIN(tags);
CREATE INDEX idx_shared_drills_likes ON public.shared_drills(likes_count DESC);
CREATE INDEX idx_match_requests_status ON public.match_requests(status, preferred_date);
CREATE INDEX idx_match_requests_team ON public.match_requests(team_id);
CREATE INDEX idx_conversation_members_user ON public.conversation_members(user_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_tips_coach ON public.tips(to_coach_id);

-- =============================================
-- 4. ENABLE RLS ON ALL TABLES
-- =============================================

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drill_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 5. RLS POLICIES (all tables exist now)
-- =============================================

-- teams
CREATE POLICY "Anyone can read teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Auth users can create teams" ON public.teams FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can update team" ON public.teams FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete team" ON public.teams FOR DELETE USING (auth.uid() = owner_id);

-- team_members
CREATE POLICY "Team members can read members" ON public.team_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid()));
CREATE POLICY "Can insert own membership" ON public.team_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner/coach/self can delete" ON public.team_members FOR DELETE
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')));
CREATE POLICY "Owner can update roles" ON public.team_members FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid() AND tm.role = 'owner'));

-- team_drills
CREATE POLICY "Team members can read team drills" ON public.team_drills FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_drills.team_id AND tm.user_id = auth.uid()));
CREATE POLICY "Owner/coach can assign drills" ON public.team_drills FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_drills.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')));
CREATE POLICY "Owner/coach can remove drills" ON public.team_drills FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_drills.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')));

-- team_sessions
CREATE POLICY "Team members can read team sessions" ON public.team_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_sessions.team_id AND tm.user_id = auth.uid()));
CREATE POLICY "Owner/coach can assign sessions" ON public.team_sessions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_sessions.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')));
CREATE POLICY "Owner/coach can remove sessions" ON public.team_sessions FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_sessions.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')));

-- shared_drills
CREATE POLICY "Public drills readable by all" ON public.shared_drills FOR SELECT USING (is_public = true OR user_id = auth.uid());
CREATE POLICY "Users can publish own drills" ON public.shared_drills FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own shared drills" ON public.shared_drills FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own shared drills" ON public.shared_drills FOR DELETE USING (auth.uid() = user_id);

-- drill_likes
CREATE POLICY "Anyone can read likes" ON public.drill_likes FOR SELECT USING (true);
CREATE POLICY "Users can like" ON public.drill_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.drill_likes FOR DELETE USING (auth.uid() = user_id);

-- match_requests
CREATE POLICY "Auth users can read matches" ON public.match_requests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Team owner/coach can create matches" ON public.match_requests FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = match_requests.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')));
CREATE POLICY "Creator or matched team can update" ON public.match_requests FOR UPDATE
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = match_requests.matched_team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')));
CREATE POLICY "Creator can delete" ON public.match_requests FOR DELETE USING (created_by = auth.uid());

-- conversations
CREATE POLICY "Members can read conversations" ON public.conversations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = id AND cm.user_id = auth.uid()));
CREATE POLICY "Auth users can create conversations" ON public.conversations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- conversation_members
CREATE POLICY "Members can read conversation members" ON public.conversation_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversation_members.conversation_id AND cm.user_id = auth.uid()));
CREATE POLICY "Can add members" ON public.conversation_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- messages
CREATE POLICY "Conversation members can read messages" ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()));
CREATE POLICY "Members can send messages" ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()));
CREATE POLICY "Sender can update own messages" ON public.messages FOR UPDATE USING (auth.uid() = sender_id);

-- tips
CREATE POLICY "Coach can read own tips" ON public.tips FOR SELECT USING (auth.uid() = to_coach_id OR auth.uid() = from_user_id);
CREATE POLICY "Users can send tips" ON public.tips FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- =============================================
-- 6. TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.shared_drills SET likes_count = likes_count + 1 WHERE id = NEW.shared_drill_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.shared_drills SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.shared_drill_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_drill_like_change
  AFTER INSERT OR DELETE ON public.drill_likes
  FOR EACH ROW EXECUTE PROCEDURE public.update_likes_count();

-- =============================================
-- 7. REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- =============================================
-- 8. DRILL SHARES (Coach sharing workflow)
-- =============================================

CREATE TABLE public.drill_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_json jsonb NOT NULL,
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  view_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_drill_shares_coach ON public.drill_shares(coach_id);
CREATE INDEX idx_drill_shares_active ON public.drill_shares(active);

ALTER TABLE public.drill_shares ENABLE ROW LEVEL SECURITY;

-- Public read for active shares (no auth needed for player viewing)
CREATE POLICY "Anyone can read active shares" ON public.drill_shares
  FOR SELECT USING (active = true);

-- Coach can read all own shares (including inactive)
CREATE POLICY "Coach can read own shares" ON public.drill_shares
  FOR SELECT USING (auth.uid() = coach_id);

-- Coach can create shares
CREATE POLICY "Coach can create shares" ON public.drill_shares
  FOR INSERT WITH CHECK (auth.uid() = coach_id);

-- Coach can update own shares (toggle active)
CREATE POLICY "Coach can update own shares" ON public.drill_shares
  FOR UPDATE USING (auth.uid() = coach_id);

-- Coach can delete own shares
CREATE POLICY "Coach can delete own shares" ON public.drill_shares
  FOR DELETE USING (auth.uid() = coach_id);

-- Atomic view count increment (avoids race condition)
CREATE OR REPLACE FUNCTION public.increment_drill_share_views(share_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.drill_shares
  SET view_count = view_count + 1
  WHERE id = share_id AND active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic view count increment for community drills
CREATE OR REPLACE FUNCTION public.increment_community_views(drill_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.shared_drills
  SET views_count = views_count + 1
  WHERE id = drill_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
