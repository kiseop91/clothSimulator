import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    tier: 'free' | 'pro' | 'team';
    isCoach: boolean;
  };
}

// Requires valid auth — rejects if no token
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  await _attachUser(req, authHeader.slice(7));
  if (!req.user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  next();
}

// Attaches user if token present, passes through if not
export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    await _attachUser(req, authHeader.slice(7));
  }
  next();
}

async function _attachUser(req: AuthRequest, token: string): Promise<void> {
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tier, is_coach')
      .eq('id', user.id)
      .single();

    req.user = {
      id: user.id,
      email: user.email || '',
      tier: (profile?.tier as 'free' | 'pro' | 'team') || 'free',
      isCoach: profile?.is_coach || false,
    };
  } catch {}
}

export { supabaseAdmin };
