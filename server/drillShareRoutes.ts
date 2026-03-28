import { Router } from 'express';
import type { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { requireAuth, optionalAuth, supabaseAdmin, type AuthRequest } from './middleware/auth.js';

const router = Router();

const FREE_SHARE_LIMIT = 5;

// --- API Routes ---

// Create a drill share link
router.post('/api/drill-shares', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { drillJson, title } = req.body;

  if (!drillJson || typeof drillJson !== 'object') {
    res.status(400).json({ error: 'drillJson is required' });
    return;
  }

  // Check payload size (500KB limit)
  const jsonSize = Buffer.byteLength(JSON.stringify(drillJson), 'utf-8');
  if (jsonSize > 500 * 1024) {
    res.status(413).json({ error: '드릴 데이터가 너무 큽니다 (최대 500KB)' });
    return;
  }

  // Free tier limit check
  if (req.user!.tier === 'free') {
    const { count } = await supabaseAdmin
      .from('drill_shares')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', req.user!.id)
      .eq('active', true);

    if ((count || 0) >= FREE_SHARE_LIMIT) {
      res.status(403).json({
        error: `Free 플랜은 최대 ${FREE_SHARE_LIMIT}개 공유 링크까지 가능합니다`,
        upgrade: true,
      });
      return;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('drill_shares')
    .insert({
      drill_json: drillJson,
      coach_id: req.user!.id,
      title: title || '',
    })
    .select('id, created_at')
    .single();

  if (error) {
    console.error('Failed to create drill share:', error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  console.log(`Drill share created: ${data.id} by user ${req.user!.id}`);
  res.json({ uuid: data.id, shareUrl: `/share/${data.id}` });
});

// Get drill share data (PUBLIC — no auth required)
router.get('/api/drill-shares/:uuid', async (req, res) => {
  const { uuid } = req.params;

  // Basic UUID format validation
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    res.status(400).json({ error: 'Invalid UUID format' });
    return;
  }

  const { data: share, error } = await supabaseAdmin
    .from('drill_shares')
    .select('id, drill_json, title, active, view_count')
    .eq('id', uuid)
    .single();

  if (error || !share) {
    res.status(404).json({ error: '드릴을 찾을 수 없습니다', code: 'NOT_FOUND' });
    return;
  }

  if (!share.active) {
    res.status(410).json({ error: '이 드릴은 더 이상 사용할 수 없습니다', code: 'DEACTIVATED' });
    return;
  }

  // Increment view count (non-blocking, approximate is fine)
  supabaseAdmin
    .rpc('increment_drill_share_views', { share_id: uuid })
    .then(() => {})
    .catch(() => {}); // Silent fail — view count is non-critical

  // Return drill data only (no coach PII)
  res.json({
    drill: share.drill_json,
    title: share.title,
  });
});

// Toggle active status (auth + owner check)
router.patch('/api/drill-shares/:uuid', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { uuid } = req.params;
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    res.status(400).json({ error: 'active field (boolean) is required' });
    return;
  }

  // Verify ownership (IDOR prevention)
  const { data: share } = await supabaseAdmin
    .from('drill_shares')
    .select('coach_id')
    .eq('id', uuid)
    .single();

  if (!share) {
    res.status(404).json({ error: '공유 드릴을 찾을 수 없습니다' });
    return;
  }

  if (share.coach_id !== req.user!.id) {
    res.status(403).json({ error: '권한이 없습니다' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('drill_shares')
    .update({ active })
    .eq('id', uuid);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  console.log(`Drill share ${uuid} ${active ? 'activated' : 'deactivated'} by ${req.user!.id}`);
  res.json({ success: true, active });
});

// List my shared drills (auth, paginated)
router.get('/api/drill-shares/mine', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { page = '1' } = req.query;
  const limit = 20;
  const offset = (parseInt(page as string) - 1) * limit;

  const { data, error } = await supabaseAdmin
    .from('drill_shares')
    .select('id, title, active, view_count, created_at')
    .eq('coach_id', req.user!.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const shares = (data || []).map(s => ({
    ...s,
    shareUrl: `/share/${s.id}`,
  }));

  res.json({ shares });
});

// --- Share Viewer Page (served by Express) ---

router.get('/share/:uuid', (req, res) => {
  const { uuid } = req.params;

  // Serve the standalone HTML player with UUID injected
  const playerHtml = fs.readFileSync(
    path.join(process.cwd(), 'public', 'share', 'player.html'),
    'utf-8'
  );

  // Inject UUID into the HTML
  const html = playerHtml.replace('{{DRILL_UUID}}', uuid);
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.send(html);
});

export default router;
