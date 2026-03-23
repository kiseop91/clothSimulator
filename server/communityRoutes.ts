import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, optionalAuth, supabaseAdmin, type AuthRequest } from './middleware/auth.js';

const router = Router();

// List public drills
router.get('/api/community/drills', optionalAuth as any, async (req: AuthRequest, res: Response) => {
  const { sort = 'recent', tags, page = '1', limit = '20' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  let query = supabaseAdmin
    .from('shared_drills')
    .select('*')
    .eq('is_public', true);

  if (tags) {
    const tagList = (tags as string).split(',');
    query = query.overlaps('tags', tagList);
  }

  if (sort === 'likes') {
    query = query.order('likes_count', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(offset, offset + parseInt(limit as string) - 1);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Fetch author profiles
  const userIds = [...new Set((data || []).map(d => d.user_id))];
  let profileMap: Record<string, any> = {};
  if (userIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);
    for (const p of (profiles || [])) profileMap[p.id] = p;
  }

  // Check likes
  let likedIds: string[] = [];
  if (req.user) {
    const drillIds = (data || []).map(d => d.id);
    if (drillIds.length) {
      const { data: likes } = await supabaseAdmin
        .from('drill_likes')
        .select('shared_drill_id')
        .eq('user_id', req.user.id)
        .in('shared_drill_id', drillIds);
      likedIds = (likes || []).map(l => l.shared_drill_id);
    }
  }

  const drills = (data || []).map(d => ({
    ...d,
    author: profileMap[d.user_id] || { display_name: 'Unknown', avatar_url: null },
    liked: likedIds.includes(d.id),
  }));

  res.json({ drills });
});

// Get shared drill detail
router.get('/api/community/drills/:id', optionalAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const { data: drill } = await supabaseAdmin
    .from('shared_drills')
    .select('*')
    .eq('id', id)
    .single();

  if (!drill) { res.status(404).json({ error: 'Not found' }); return; }

  // Increment view count
  await supabaseAdmin.from('shared_drills')
    .update({ views_count: drill.views_count + 1 })
    .eq('id', id);

  // Author
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', drill.user_id)
    .single();

  let liked = false;
  if (req.user) {
    const { data } = await supabaseAdmin.from('drill_likes')
      .select('user_id').eq('user_id', req.user.id).eq('shared_drill_id', id).single();
    liked = !!data;
  }

  res.json({ drill: { ...drill, author: profile || { display_name: 'Unknown' }, liked } });
});

// Publish drill
router.post('/api/community/drills', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { title, description, tags, drillData } = req.body;

  if (!title?.trim() || !drillData) {
    res.status(400).json({ error: 'Title and drill data required' }); return;
  }

  const { data, error } = await supabaseAdmin.from('shared_drills').insert({
    user_id: req.user!.id,
    title: title.trim(),
    description: description || '',
    tags: tags || [],
    drill_data: drillData,
  }).select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ sharedDrill: data });
});

// Unpublish drill
router.delete('/api/community/drills/:id', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { error } = await supabaseAdmin.from('shared_drills')
    .delete().eq('id', id).eq('user_id', req.user!.id);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// Toggle like
router.post('/api/community/drills/:id/like', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const { data: existing } = await supabaseAdmin.from('drill_likes')
    .select('user_id').eq('user_id', req.user!.id).eq('shared_drill_id', id).single();

  if (existing) {
    await supabaseAdmin.from('drill_likes')
      .delete().eq('user_id', req.user!.id).eq('shared_drill_id', id);
    res.json({ liked: false });
  } else {
    await supabaseAdmin.from('drill_likes')
      .insert({ user_id: req.user!.id, shared_drill_id: id });
    res.json({ liked: true });
  }
});

// Import drill
router.post('/api/community/drills/:id/import', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const { data: shared } = await supabaseAdmin.from('shared_drills')
    .select('drill_data, title').eq('id', id).single();

  if (!shared) { res.status(404).json({ error: 'Not found' }); return; }

  const drillData = shared.drill_data as any;
  const newId = `drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const { error } = await supabaseAdmin.from('drills').insert({
    id: newId,
    user_id: req.user!.id,
    name: drillData.name || shared.title,
    description: drillData.description || '',
    data: { ...drillData, id: newId, source: 'community' },
  });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ drillId: newId });
});

export default router;
