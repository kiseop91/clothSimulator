import express from 'express';
import { spawn } from 'child_process';
import { buildPrompt } from './drillPrompt.js';
import { validateAndSanitize } from './validateDrill.js';

const app = express();
app.use(express.json());

app.post('/api/generate-drill', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  const fullPrompt = buildPrompt(prompt.trim());

  try {
    const result = await new Promise<string>((resolve, reject) => {
      // Use stdin pipe instead of -p arg to avoid shell metacharacter issues
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

      // Write prompt via stdin to avoid shell escaping problems
      proc.stdin.write(fullPrompt);
      proc.stdin.end();

      // Safety timeout
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Drill API server running on http://localhost:${PORT}`);
});
