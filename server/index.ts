import 'dotenv/config';
import express from 'express';
import { spawn } from 'child_process';
import { buildPrompt } from './drillPrompt.js';
import { validateAndSanitize } from './validateDrill.js';
import { buildAnimationPrompt } from './animationPrompt.js';
import { validateAndSanitizeMoves } from './validateAnimation.js';
import { computeKeyframes } from './computeKeyframes.js';
import { validatePromptInput, ABUSE_WARNING } from './promptGuard.js';
import { requireAuth, optionalAuth, supabaseAdmin, type AuthRequest } from './middleware/auth.js';
import paymentRoutes from './paymentRoutes.js';
import communityRoutes from './communityRoutes.js';
import drillShareRoutes from './drillShareRoutes.js';
import teamRoutes from './teamRoutes.js';
import matchRoutes from './matchRoutes.js';
import chatRoutes from './chatRoutes.js';
import gameRoutes from './gameRoutes.js';

const app = express();

// Webhooks need raw body — register before express.json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));

// Routes
app.use(paymentRoutes);
app.use(communityRoutes);
app.use(drillShareRoutes);
app.use(teamRoutes);
app.use(matchRoutes);
app.use(chatRoutes);
app.use(gameRoutes);

// AI usage check middleware for free tier
async function checkAIUsage(req: AuthRequest, res: express.Response, next: express.NextFunction): Promise<void> {
  if (!req.user) { next(); return; }
  if (req.user.tier === 'pro') { next(); return; }

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from('ai_usage')
    .select('generation_count')
    .eq('user_id', req.user.id)
    .eq('usage_date', today)
    .single();

  const count = data?.generation_count ?? 0;
  if (count >= 5) {
    res.status(403).json({ error: '일일 AI 사용 한도 초과 (5회/일)', upgrade: true });
    return;
  }
  next();
}

async function incrementAIUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from('ai_usage')
    .select('generation_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .single();

  if (data) {
    await supabaseAdmin
      .from('ai_usage')
      .update({ generation_count: data.generation_count + 1 })
      .eq('user_id', userId)
      .eq('usage_date', today);
  } else {
    await supabaseAdmin
      .from('ai_usage')
      .insert({ user_id: userId, usage_date: today, generation_count: 1 });
  }
}

app.post('/api/generate-drill', optionalAuth as any, checkAIUsage as any, async (req: AuthRequest, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  const guard = validatePromptInput(prompt.trim());
  if (!guard.safe) {
    console.log('Prompt blocked:', guard.reason);
    res.json({
      drill: {
        id: `drill_${Date.now()}`,
        name: 'Blocked',
        description: ABUSE_WARNING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        rinkLayout: 0,
        duration: 5,
        objects: [],
        paths: [],
        keyframes: [],
      },
    });
    return;
  }

  const fullPrompt = buildPrompt(prompt.trim());

  try {
    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn('claude', ['-p', '--output-format', 'text'], {
        shell: true,
        timeout: 120_000,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
      });

      proc.stdin.write(fullPrompt);
      proc.stdin.end();

      setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill();
        reject(new Error('Claude CLI timed out after 120 seconds'));
      }, 120_000);
    });

    console.log('Claude CLI stdout length:', result.length);
    console.log('Claude CLI stdout preview:', result.slice(0, 200));
    const drill = validateAndSanitize(result);

    // Increment AI usage
    if (req.user) {
      await incrementAIUsage(req.user.id);
    }

    res.json({ drill });
  } catch (err: any) {
    console.error('Generate drill error:', err.message);
    if (err.message.includes('parse') || err.message.includes('JSON') || err.message.includes('Missing')) {
      res.status(422).json({ error: `Invalid drill format: ${err.message}` });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.post('/api/generate-animation', optionalAuth as any, checkAIUsage as any, async (req: AuthRequest, res) => {
  const { prompt, objects, selectedObjectIds, existingKeyframes, duration } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }
  if (!Array.isArray(objects) || objects.length === 0) {
    res.status(400).json({ error: 'Objects array is required' });
    return;
  }

  const animGuard = validatePromptInput(prompt.trim());
  if (!animGuard.safe) {
    console.log('Animation prompt blocked:', animGuard.reason);
    res.status(422).json({ error: ABUSE_WARNING });
    return;
  }

  const fullPrompt = buildAnimationPrompt({
    prompt: prompt.trim(),
    objects,
    selectedObjectIds,
    existingKeyframes: existingKeyframes || [],
    duration: duration || 5,
  });

  try {
    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn('claude', ['-p', '--output-format', 'text'], {
        shell: true,
        timeout: 120_000,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
      });

      proc.stdin.write(fullPrompt);
      proc.stdin.end();

      setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill();
        reject(new Error('Claude CLI timed out after 120 seconds'));
      }, 120_000);
    });

    console.log('Animation CLI stdout length:', result.length);
    console.log('Animation CLI stdout preview:', result.slice(0, 200));

    const validObjectIds = objects.map((o: any) => o.id);
    const validated = validateAndSanitizeMoves(result, validObjectIds);
    const computed = computeKeyframes(
      validated.moves,
      objects,
      existingKeyframes || [],
      duration || 5
    );

    // Increment AI usage
    if (req.user) {
      await incrementAIUsage(req.user.id);
    }

    res.json({
      keyframes: computed.keyframes,
      paths: computed.paths,
      duration: computed.duration,
      warnings: validated.warnings,
    });
  } catch (err: any) {
    console.error('Generate animation error:', err.message);
    if (err.message.includes('parse') || err.message.includes('JSON') || err.message.includes('Missing') || err.message.includes('No valid')) {
      res.status(422).json({ error: `Invalid animation format: ${err.message}` });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Drill API server running on http://localhost:${PORT}`);
});
