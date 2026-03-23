import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, supabaseAdmin, type AuthRequest } from './middleware/auth.js';

const router = Router();

// List match requests
router.get('/api/matches', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { status = 'open', location, level, page = '1' } = req.query;
  const offset = (parseInt(page as string) - 1) * 20;

  let query = supabaseAdmin
    .from('match_requests')
    .select('*, teams:team_id(id, name, logo_url)')
    .eq('status', status as string)
    .order('preferred_date', { ascending: true })
    .range(offset, offset + 19);

  if (location) query = query.ilike('rink_location', `%${location}%`);
  if (level && level !== 'all') query = query.eq('skill_level', level as string);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ matches: (data || []).map(m => ({ ...m, team: m.teams, teams: undefined })) });
});

// Create match request
router.post('/api/matches', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { teamId, rinkLocation, preferredDate, timeSlot, skillLevel, description } = req.body;

  if (!teamId || !rinkLocation || !preferredDate || !timeSlot || !skillLevel) {
    res.status(400).json({ error: 'Missing required fields' }); return;
  }

  const { data, error } = await supabaseAdmin.from('match_requests').insert({
    team_id: teamId,
    created_by: req.user!.id,
    rink_location: rinkLocation,
    preferred_date: preferredDate,
    time_slot: timeSlot,
    skill_level: skillLevel,
    description: description || '',
  }).select('*, teams:team_id(id, name)').single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ match: { ...data, team: data.teams, teams: undefined } });
});

// Accept match
router.put('/api/matches/:id/accept', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { teamId } = req.body;

  const { error } = await supabaseAdmin.from('match_requests').update({
    matched_team_id: teamId,
    matched_at: new Date().toISOString(),
    status: 'matched',
  }).eq('id', id).eq('status', 'open');

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// Complete match
router.put('/api/matches/:id/complete', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await supabaseAdmin.from('match_requests').update({ status: 'completed' }).eq('id', id);
  res.json({ success: true });
});

// Cancel/delete match
router.delete('/api/matches/:id', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await supabaseAdmin.from('match_requests').delete().eq('id', id).eq('created_by', req.user!.id);
  res.json({ success: true });
});

export default router;
