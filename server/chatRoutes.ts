import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, supabaseAdmin, type AuthRequest } from './middleware/auth.js';

const router = Router();

// List conversations
router.get('/api/conversations', requireAuth as any, async (req: AuthRequest, res: Response) => {
  // Get user's conversation IDs
  const { data: memberships } = await supabaseAdmin
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', req.user!.id);

  if (!memberships?.length) { res.json({ conversations: [] }); return; }

  const convIds = memberships.map(m => m.conversation_id);

  // Get conversations
  const { data: conversations } = await supabaseAdmin
    .from('conversations')
    .select('*, teams:team_id(name)')
    .in('id', convIds)
    .order('created_at', { ascending: false });

  // Get last message for each
  const result = await Promise.all((conversations || []).map(async (conv) => {
    const { data: lastMsg } = await supabaseAdmin
      .from('messages')
      .select('content, sender_id, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get other members' profiles for direct chats
    let otherUser = null;
    if (conv.type === 'direct') {
      const { data: members } = await supabaseAdmin
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conv.id)
        .neq('user_id', req.user!.id);

      if (members?.[0]) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id, display_name, avatar_url')
          .eq('id', members[0].user_id)
          .single();
        otherUser = profile;
      }
    }

    // Unread count
    const { count } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .neq('sender_id', req.user!.id)
      .is('read_at', null);

    return {
      ...conv,
      teamName: conv.teams?.name,
      teams: undefined,
      lastMessage: lastMsg,
      otherUser,
      unreadCount: count || 0,
    };
  }));

  res.json({ conversations: result });
});

// Create or find DM conversation
router.post('/api/conversations', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { userId, type = 'direct' } = req.body;

  if (type === 'direct' && !userId) {
    res.status(400).json({ error: 'userId required for direct messages' }); return;
  }

  if (type === 'direct') {
    // Check if DM already exists between these two users
    const { data: myConvs } = await supabaseAdmin
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', req.user!.id);

    if (myConvs?.length) {
      const myConvIds = myConvs.map(c => c.conversation_id);
      const { data: theirConvs } = await supabaseAdmin
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId)
        .in('conversation_id', myConvIds);

      if (theirConvs?.length) {
        // Check if any of these are direct conversations
        const sharedIds = theirConvs.map(c => c.conversation_id);
        const { data: directConv } = await supabaseAdmin
          .from('conversations')
          .select('*')
          .in('id', sharedIds)
          .eq('type', 'direct')
          .limit(1)
          .single();

        if (directConv) {
          res.json({ conversation: directConv, existing: true }); return;
        }
      }
    }

    // Create new DM
    const { data: conv, error } = await supabaseAdmin
      .from('conversations')
      .insert({ type: 'direct' })
      .select()
      .single();

    if (error || !conv) { res.status(500).json({ error: error?.message || 'Failed' }); return; }

    await supabaseAdmin.from('conversation_members').insert([
      { conversation_id: conv.id, user_id: req.user!.id },
      { conversation_id: conv.id, user_id: userId },
    ]);

    res.json({ conversation: conv, existing: false });
  }
});

// Get messages
router.get('/api/conversations/:id/messages', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { before, limit = '50' } = req.query;

  let query = supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(parseInt(limit as string));

  if (before) query = query.lt('created_at', before as string);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Fetch sender profiles
  const senderIds = [...new Set((data || []).map(m => m.sender_id))];
  let profileMap: Record<string, any> = {};
  if (senderIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', senderIds);
    for (const p of (profiles || [])) profileMap[p.id] = p;
  }

  const messages = (data || []).reverse().map(m => ({
    ...m,
    sender: profileMap[m.sender_id] || { display_name: 'Unknown' },
    isMine: m.sender_id === req.user!.id,
  }));

  res.json({ messages });
});

// Send message
router.post('/api/conversations/:id/messages', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content?.trim()) { res.status(400).json({ error: 'Content required' }); return; }

  const { data, error } = await supabaseAdmin.from('messages').insert({
    conversation_id: id,
    sender_id: req.user!.id,
    content: content.trim(),
  }).select('*').single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ message: { ...data, sender: { display_name: req.user!.email }, isMine: true } });
});

// Mark as read
router.put('/api/conversations/:id/read', requireAuth as any, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await supabaseAdmin.from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', id)
    .neq('sender_id', req.user!.id)
    .is('read_at', null);

  res.json({ success: true });
});

export default router;
