import 'dotenv/config';
import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, supabaseAdmin, type AuthRequest } from './middleware/auth.js';

const router = Router();

// Create team
router.post('/api/teams', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'Team name required' }); return; }

  const { data: team, error } = await supabaseAdmin
    .from('teams')
    .insert({ name: name.trim(), owner_id: req.user!.id })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Add owner as member
  await supabaseAdmin.from('team_members').insert({
    team_id: team.id, user_id: req.user!.id, role: 'owner'
  });

  // Create team group chat
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .insert({ type: 'team', team_id: team.id })
    .select()
    .single();

  if (conv) {
    await supabaseAdmin.from('conversation_members').insert({
      conversation_id: conv.id, user_id: req.user!.id
    });
  }

  res.json({ team });
});

// List my teams
router.get('/api/teams', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { data: memberships } = await supabaseAdmin
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', req.user!.id);

  if (!memberships?.length) { res.json({ teams: [] }); return; }

  const teamIds = memberships.map(m => m.team_id);
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('*')
    .in('id', teamIds);

  const result = (teams || []).map(t => ({
    ...t,
    myRole: memberships.find(m => m.team_id === t.id)?.role
  }));

  res.json({ teams: result });
});

// Get team detail + roster
router.get('/api/teams/:id', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const { data: team } = await supabaseAdmin.from('teams').select('*').eq('id', id).single();
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('user_id, role, joined_at')
    .eq('team_id', id);

  // Get profiles for members
  const userIds = (members || []).map(m => m.user_id);
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, avatar_url, is_coach')
    .in('id', userIds);

  const roster = (members || []).map(m => {
    const profile = profiles?.find(p => p.id === m.user_id);
    return { ...m, display_name: profile?.display_name, avatar_url: profile?.avatar_url, is_coach: profile?.is_coach };
  });

  const myMembership = members?.find(m => m.user_id === req.user!.id);

  res.json({ team, roster, myRole: myMembership?.role || null, memberCount: roster.length });
});

// Update team
router.put('/api/teams/:id', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, logo_url } = req.body;

  const { data: team } = await supabaseAdmin.from('teams').select('owner_id').eq('id', id).single();
  if (!team || team.owner_id !== req.user!.id) { res.status(403).json({ error: 'Not owner' }); return; }

  const { error } = await supabaseAdmin.from('teams')
    .update({ name, logo_url, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// Delete team
router.delete('/api/teams/:id', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { data: team } = await supabaseAdmin.from('teams').select('owner_id').eq('id', id).single();
  if (!team || team.owner_id !== req.user!.id) { res.status(403).json({ error: 'Not owner' }); return; }

  await supabaseAdmin.from('teams').delete().eq('id', id);
  res.json({ success: true });
});

// Join team via invite code
router.post('/api/teams/join', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { inviteCode } = req.body;
  if (!inviteCode) { res.status(400).json({ error: 'Invite code required' }); return; }

  const { data: team } = await supabaseAdmin.from('teams').select('id, name').eq('invite_code', inviteCode).single();
  if (!team) { res.status(404).json({ error: 'Invalid invite code' }); return; }

  // Check if already member
  const { data: existing } = await supabaseAdmin.from('team_members')
    .select('id').eq('team_id', team.id).eq('user_id', req.user!.id).single();
  if (existing) { res.json({ team, alreadyMember: true }); return; }

  await supabaseAdmin.from('team_members').insert({
    team_id: team.id, user_id: req.user!.id, role: 'player'
  });

  // Add to team group chat
  const { data: conv } = await supabaseAdmin.from('conversations')
    .select('id').eq('type', 'team').eq('team_id', team.id).single();
  if (conv) {
    await supabaseAdmin.from('conversation_members').insert({
      conversation_id: conv.id, user_id: req.user!.id
    });
  }

  res.json({ team, joined: true });
});

// Remove member or leave
router.delete('/api/teams/:id/members/:userId', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id, userId } = req.params;

  // Check permission: self or owner/coach
  if (userId !== req.user!.id) {
    const { data: myMember } = await supabaseAdmin.from('team_members')
      .select('role').eq('team_id', id).eq('user_id', req.user!.id).single();
    if (!myMember || !['owner', 'coach'].includes(myMember.role)) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
  }

  await supabaseAdmin.from('team_members').delete().eq('team_id', id).eq('user_id', userId);
  res.json({ success: true });
});

// Change member role
router.put('/api/teams/:id/members/:userId/role', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id, userId } = req.params;
  const { role } = req.body;

  if (!['coach', 'player'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }

  const { data: team } = await supabaseAdmin.from('teams').select('owner_id').eq('id', id).single();
  if (!team || team.owner_id !== req.user!.id) { res.status(403).json({ error: 'Not owner' }); return; }

  // Update role
  await supabaseAdmin.from('team_members').update({ role }).eq('team_id', id).eq('user_id', userId);

  // If promoting to coach, also update profile
  if (role === 'coach') {
    await supabaseAdmin.from('profiles').update({ is_coach: true, user_role: 'coach' }).eq('id', userId);
  }

  res.json({ success: true });
});

// Assign drill to team
router.post('/api/teams/:id/drills', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { drillId } = req.body;

  const { error } = await supabaseAdmin.from('team_drills').insert({
    team_id: id, drill_id: drillId, assigned_by: req.user!.id
  });

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json({ success: true });
});

// Assign session to team
router.post('/api/teams/:id/sessions', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { sessionId, scheduledDate } = req.body;

  const { error } = await supabaseAdmin.from('team_sessions').insert({
    team_id: id, session_id: sessionId, scheduled_date: scheduledDate, assigned_by: req.user!.id
  });

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json({ success: true });
});

// List team drills
router.get('/api/teams/:id/drills', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const { data: teamDrills } = await supabaseAdmin
    .from('team_drills')
    .select('drill_id, assigned_at')
    .eq('team_id', id);

  if (!teamDrills?.length) { res.json({ drills: [] }); return; }

  const drillIds = teamDrills.map(td => td.drill_id);
  const { data: drills } = await supabaseAdmin
    .from('drills')
    .select('id, name, description, data')
    .in('id', drillIds);

  res.json({ drills: drills || [] });
});

// List team sessions
router.get('/api/teams/:id/sessions', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { date } = req.query;

  let query = supabaseAdmin.from('team_sessions')
    .select('session_id, scheduled_date, assigned_at')
    .eq('team_id', id);

  if (date) query = query.eq('scheduled_date', date as string);

  const { data: teamSessions } = await query;
  if (!teamSessions?.length) { res.json({ sessions: [] }); return; }

  const sessionIds = teamSessions.map(ts => ts.session_id);
  const { data: sessions } = await supabaseAdmin
    .from('sessions')
    .select('id, name, data')
    .in('id', sessionIds);

  const result = (sessions || []).map(s => {
    const ts = teamSessions.find(t => t.session_id === s.id);
    return { ...s, scheduled_date: ts?.scheduled_date };
  });

  res.json({ sessions: result });
});

// Invite coach (only when 5+ players)
router.post('/api/teams/:id/invite-coach', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const { data: members } = await supabaseAdmin.from('team_members')
    .select('role').eq('team_id', id);

  const playerCount = (members || []).filter(m => m.role !== 'coach').length;
  if (playerCount < 5) {
    res.status(400).json({ error: '코치를 초대하려면 플레이어 5명이 필요합니다', currentCount: playerCount });
    return;
  }

  const { data: team } = await supabaseAdmin.from('teams').select('invite_code').eq('id', id).single();
  res.json({ inviteCode: team?.invite_code, coachInviteUrl: `/team/join/${team?.invite_code}?role=coach` });
});

export default router;
