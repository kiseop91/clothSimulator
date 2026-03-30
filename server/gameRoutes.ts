import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, supabaseAdmin, type AuthRequest } from './middleware/auth.js';

const router = Router();

// List games (with optional filters)
router.get('/api/games', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { teamId, status, season, from, to, page = '1' } = req.query;
  const offset = (parseInt(page as string) - 1) * 20;

  let query = supabaseAdmin
    .from('games')
    .select('*, home_team:home_team_id(id, name, logo_url), away_team:away_team_id(id, name, logo_url)')
    .order('scheduled_at', { ascending: false })
    .range(offset, offset + 19);

  if (teamId) {
    query = query.or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
  }
  if (status && status !== 'all') query = query.eq('status', status as string);
  if (season) query = query.eq('season', season as string);
  if (from) query = query.gte('scheduled_at', from as string);
  if (to) query = query.lte('scheduled_at', to as string);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  const games = (data || []).map(g => ({
    ...g,
    homeTeam: g.home_team,
    awayTeam: g.away_team,
    home_team: undefined,
    away_team: undefined,
  }));

  res.json({ games });
});

// Get game detail with events and stats
router.get('/api/games/:id', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const [gameRes, eventsRes, statsRes] = await Promise.all([
    supabaseAdmin.from('games')
      .select('*, home_team:home_team_id(id, name, logo_url), away_team:away_team_id(id, name, logo_url)')
      .eq('id', id).single(),
    supabaseAdmin.from('game_events')
      .select('*')
      .eq('game_id', id)
      .order('period', { ascending: true })
      .order('time_in_period', { ascending: true }),
    supabaseAdmin.from('player_game_stats')
      .select('*')
      .eq('game_id', id)
      .order('goals', { ascending: false }),
  ]);

  if (!gameRes.data) { res.status(404).json({ error: 'Game not found' }); return; }

  const game = {
    ...gameRes.data,
    homeTeam: gameRes.data.home_team,
    awayTeam: gameRes.data.away_team,
    home_team: undefined,
    away_team: undefined,
  };

  res.json({ game, events: eventsRes.data || [], stats: statsRes.data || [] });
});

// Create game
router.post('/api/games', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { homeTeamId, awayTeamId, scheduledAt, venue, season, notes } = req.body;

  if (!homeTeamId || !awayTeamId || !scheduledAt) {
    res.status(400).json({ error: 'homeTeamId, awayTeamId, and scheduledAt are required' }); return;
  }
  if (homeTeamId === awayTeamId) {
    res.status(400).json({ error: 'Home and away teams must be different' }); return;
  }

  const { data, error } = await supabaseAdmin.from('games').insert({
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    scheduled_at: scheduledAt,
    venue: venue || '',
    season: season || '2025-2026',
    notes: notes || '',
    created_by: req.user!.id,
  }).select('*, home_team:home_team_id(id, name, logo_url), away_team:away_team_id(id, name, logo_url)').single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({
    game: { ...data, homeTeam: data.home_team, awayTeam: data.away_team, home_team: undefined, away_team: undefined }
  });
});

// Update game (score, status, period)
router.patch('/api/games/:id', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { homeScore, awayScore, status, period, periodTime, overtime, shootout, venue, scheduledAt, notes } = req.body;

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (homeScore !== undefined) updates.home_score = homeScore;
  if (awayScore !== undefined) updates.away_score = awayScore;
  if (status) updates.status = status;
  if (period !== undefined) updates.period = period;
  if (periodTime !== undefined) updates.period_time = periodTime;
  if (overtime !== undefined) updates.overtime = overtime;
  if (shootout !== undefined) updates.shootout = shootout;
  if (venue !== undefined) updates.venue = venue;
  if (scheduledAt !== undefined) updates.scheduled_at = scheduledAt;
  if (notes !== undefined) updates.notes = notes;

  const { error } = await supabaseAdmin.from('games').update(updates).eq('id', id);
  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ success: true });
});

// Delete game
router.delete('/api/games/:id', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await supabaseAdmin.from('games').delete().eq('id', id).eq('created_by', req.user!.id);
  res.json({ success: true });
});

// Add game event (goal, assist, penalty, etc.)
router.post('/api/games/:id/events', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { eventType, teamId, playerName, period, timeInPeriod, details } = req.body;

  if (!eventType || !teamId || !playerName) {
    res.status(400).json({ error: 'eventType, teamId, and playerName are required' }); return;
  }

  const { data, error } = await supabaseAdmin.from('game_events').insert({
    game_id: id,
    event_type: eventType,
    team_id: teamId,
    player_name: playerName,
    period: period || 1,
    time_in_period: timeInPeriod || '00:00',
    details: details || {},
  }).select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Auto-update game score for goals
  if (eventType === 'goal') {
    const { data: game } = await supabaseAdmin.from('games').select('home_team_id, home_score, away_score').eq('id', id).single();
    if (game) {
      const isHome = game.home_team_id === teamId;
      await supabaseAdmin.from('games').update({
        home_score: isHome ? game.home_score + 1 : game.home_score,
        away_score: isHome ? game.away_score : game.away_score + 1,
      }).eq('id', id);
    }
  }

  res.json({ event: data });
});

// Delete game event
router.delete('/api/games/:id/events/:eventId', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id, eventId } = req.params;

  // If deleting a goal, decrement score
  const { data: event } = await supabaseAdmin.from('game_events').select('event_type, team_id').eq('id', parseInt(eventId)).single();
  if (event?.event_type === 'goal') {
    const { data: game } = await supabaseAdmin.from('games').select('home_team_id, home_score, away_score').eq('id', id).single();
    if (game) {
      const isHome = game.home_team_id === event.team_id;
      await supabaseAdmin.from('games').update({
        home_score: isHome ? Math.max(0, game.home_score - 1) : game.home_score,
        away_score: isHome ? game.away_score : Math.max(0, game.away_score - 1),
      }).eq('id', id);
    }
  }

  await supabaseAdmin.from('game_events').delete().eq('id', parseInt(eventId));
  res.json({ success: true });
});

// Update/upsert player game stats
router.put('/api/games/:id/stats', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { teamId, playerName, goals, assists, penaltiesMinutes, shots, saves, hits, blocks, plusMinus, isGoalie, goalsAgainst } = req.body;

  if (!teamId || !playerName) {
    res.status(400).json({ error: 'teamId and playerName are required' }); return;
  }

  const { data, error } = await supabaseAdmin.from('player_game_stats').upsert({
    game_id: id,
    team_id: teamId,
    player_name: playerName,
    goals: goals || 0,
    assists: assists || 0,
    penalties_minutes: penaltiesMinutes || 0,
    shots: shots || 0,
    saves: saves || 0,
    hits: hits || 0,
    blocks: blocks || 0,
    plus_minus: plusMinus || 0,
    is_goalie: isGoalie || false,
    goals_against: goalsAgainst || 0,
  }, { onConflict: 'game_id,team_id,player_name' }).select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ stats: data });
});

// Standings (computed from games)
router.get('/api/standings', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { season = '2025-2026' } = req.query;

  const { data: games } = await supabaseAdmin
    .from('games')
    .select('home_team_id, away_team_id, home_score, away_score, overtime, shootout')
    .eq('status', 'final')
    .eq('season', season as string);

  if (!games?.length) { res.json({ standings: [] }); return; }

  // Compute standings
  const teamStats: Record<string, { teamId: string; gp: number; w: number; l: number; otl: number; pts: number; gf: number; ga: number }> = {};

  const ensureTeam = (id: string) => {
    if (!teamStats[id]) teamStats[id] = { teamId: id, gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0 };
  };

  for (const g of games) {
    ensureTeam(g.home_team_id);
    ensureTeam(g.away_team_id);

    const home = teamStats[g.home_team_id];
    const away = teamStats[g.away_team_id];

    home.gp++; away.gp++;
    home.gf += g.home_score; home.ga += g.away_score;
    away.gf += g.away_score; away.ga += g.home_score;

    if (g.home_score > g.away_score) {
      home.w++; home.pts += 2;
      if (g.overtime || g.shootout) { away.otl++; away.pts += 1; }
      else { away.l++; }
    } else {
      away.w++; away.pts += 2;
      if (g.overtime || g.shootout) { home.otl++; home.pts += 1; }
      else { home.l++; }
    }
  }

  // Get team info
  const teamIds = Object.keys(teamStats);
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .in('id', teamIds);

  const standings = Object.values(teamStats)
    .map(s => {
      const team = teams?.find(t => t.id === s.teamId);
      return { ...s, teamName: team?.name || 'Unknown', logoUrl: team?.logo_url };
    })
    .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));

  res.json({ standings });
});

// Player leaderboards (aggregated from player_game_stats)
router.get('/api/leaderboards', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { stat = 'points', season = '2025-2026', limit = '20' } = req.query;

  // Get game IDs for this season
  const { data: seasonGames } = await supabaseAdmin
    .from('games')
    .select('id')
    .eq('status', 'final')
    .eq('season', season as string);

  if (!seasonGames?.length) { res.json({ leaders: [] }); return; }

  const gameIds = seasonGames.map(g => g.id);

  const { data: allStats } = await supabaseAdmin
    .from('player_game_stats')
    .select('*')
    .in('game_id', gameIds);

  if (!allStats?.length) { res.json({ leaders: [] }); return; }

  // Aggregate per player
  const playerAgg: Record<string, {
    playerName: string; teamId: string; gp: number; goals: number; assists: number; points: number;
    penaltiesMinutes: number; shots: number; saves: number; hits: number; blocks: number;
    plusMinus: number; isGoalie: boolean; goalsAgainst: number;
  }> = {};

  for (const s of allStats) {
    const key = `${s.player_name}|${s.team_id}`;
    if (!playerAgg[key]) {
      playerAgg[key] = {
        playerName: s.player_name, teamId: s.team_id, gp: 0,
        goals: 0, assists: 0, points: 0, penaltiesMinutes: 0,
        shots: 0, saves: 0, hits: 0, blocks: 0, plusMinus: 0,
        isGoalie: s.is_goalie, goalsAgainst: 0,
      };
    }
    const p = playerAgg[key];
    p.gp++;
    p.goals += s.goals;
    p.assists += s.assists;
    p.points += s.goals + s.assists;
    p.penaltiesMinutes += s.penalties_minutes;
    p.shots += s.shots;
    p.saves += s.saves;
    p.hits += s.hits;
    p.blocks += s.blocks;
    p.plusMinus += s.plus_minus;
    p.goalsAgainst += s.goals_against;
  }

  // Sort by requested stat
  const sortKey = stat === 'points' ? 'points' : stat === 'goals' ? 'goals' : stat === 'assists' ? 'assists' : 'points';
  const leaders = Object.values(playerAgg)
    .sort((a, b) => (b as any)[sortKey] - (a as any)[sortKey])
    .slice(0, parseInt(limit as string));

  // Get team names
  const teamIds = [...new Set(leaders.map(l => l.teamId))];
  const { data: teams } = await supabaseAdmin.from('teams').select('id, name').in('id', teamIds);
  const teamMap: Record<string, string> = {};
  for (const t of (teams || [])) teamMap[t.id] = t.name;

  const result = leaders.map(l => ({ ...l, teamName: teamMap[l.teamId] || 'Unknown' }));
  res.json({ leaders: result });
});

export default router;
