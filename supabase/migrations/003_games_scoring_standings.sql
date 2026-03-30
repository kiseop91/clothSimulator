-- =============================================
-- Phase 2: Games, Scoring, Stats, Standings
-- =============================================

-- 1. Games table
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  away_team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season text NOT NULL DEFAULT '2025-2026',
  venue text NOT NULL DEFAULT '',
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'final', 'cancelled', 'postponed')),
  home_score int NOT NULL DEFAULT 0,
  away_score int NOT NULL DEFAULT 0,
  period int NOT NULL DEFAULT 0,
  period_time text DEFAULT '20:00',
  overtime boolean NOT NULL DEFAULT false,
  shootout boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Game events (goals, penalties, saves, etc.)
CREATE TABLE public.game_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('goal', 'assist', 'penalty', 'save', 'shot', 'hit', 'block')),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  period int NOT NULL DEFAULT 1,
  time_in_period text NOT NULL DEFAULT '00:00',
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Player stats per game
CREATE TABLE public.player_game_stats (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  goals int NOT NULL DEFAULT 0,
  assists int NOT NULL DEFAULT 0,
  penalties_minutes int NOT NULL DEFAULT 0,
  shots int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  hits int NOT NULL DEFAULT 0,
  blocks int NOT NULL DEFAULT 0,
  plus_minus int NOT NULL DEFAULT 0,
  is_goalie boolean NOT NULL DEFAULT false,
  goals_against int NOT NULL DEFAULT 0,
  UNIQUE (game_id, team_id, player_name)
);

-- 4. Indexes
CREATE INDEX idx_games_home_team ON public.games(home_team_id);
CREATE INDEX idx_games_away_team ON public.games(away_team_id);
CREATE INDEX idx_games_scheduled ON public.games(scheduled_at);
CREATE INDEX idx_games_status ON public.games(status);
CREATE INDEX idx_games_season ON public.games(season);
CREATE INDEX idx_game_events_game ON public.game_events(game_id);
CREATE INDEX idx_game_events_type ON public.game_events(event_type);
CREATE INDEX idx_player_game_stats_game ON public.player_game_stats(game_id);
CREATE INDEX idx_player_game_stats_player ON public.player_game_stats(player_name, team_id);

-- 5. Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Games: any auth user can read, team owner/coach can create/update
CREATE POLICY "Auth users can read games" ON public.games FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Team members can create games" ON public.games FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE (tm.team_id = games.home_team_id OR tm.team_id = games.away_team_id)
    AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
  ));
CREATE POLICY "Team owner/coach can update games" ON public.games FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE (tm.team_id = games.home_team_id OR tm.team_id = games.away_team_id)
    AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
  ));
CREATE POLICY "Creator can delete games" ON public.games FOR DELETE USING (created_by = auth.uid());

-- Game events
CREATE POLICY "Auth users can read events" ON public.game_events FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Team members can create events" ON public.game_events FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = game_events.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
  ));
CREATE POLICY "Team members can delete events" ON public.game_events FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = game_events.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
  ));

-- Player game stats
CREATE POLICY "Auth users can read stats" ON public.player_game_stats FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Team members can manage stats" ON public.player_game_stats FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = player_game_stats.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
  ));
CREATE POLICY "Team members can update stats" ON public.player_game_stats FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = player_game_stats.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
  ));
