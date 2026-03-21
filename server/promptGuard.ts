export const ABUSE_WARNING = "하지마세요 하... 진짜 신고합니다";

const INJECTION_PATTERNS = [
  /ignore\s*.{0,20}instruction/i,
  /forget\s*.{0,20}above/i,
  /대신.{0,10}써줘/,
  /소설/,
  /시\s*를?\s*써/,
  /에세이/,
  /작문/,
  /이야기.{0,10}써/,
  /무시.{0,10}지시/,
  /you\s+are\s+now/i,
  /act\s+as\b/i,
  /pretend\s+(to\s+be|you)/i,
  /너는\s*이제/,
  /description에.{0,10}써/,
  /name에.{0,10}써/,
  /label에.{0,10}써/,
  /disregard\s*.{0,20}(instruction|prompt|above)/i,
  /override\s*.{0,20}(system|instruction)/i,
];

const MAX_PROMPT_LENGTH = 500;

export function validatePromptInput(prompt: string): { safe: boolean; reason?: string } {
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { safe: false, reason: `Prompt too long (${prompt.length} > ${MAX_PROMPT_LENGTH})` };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      return { safe: false, reason: `Blocked pattern: ${pattern.source}` };
    }
  }

  return { safe: true };
}

export function sanitizeTextField(text: string, maxLength: number): { text: string; abused: boolean } {
  if (typeof text !== 'string') {
    return { text: '', abused: false };
  }

  // Strip HTML/script tags
  let cleaned = text.replace(/<[^>]*>/g, '');

  // Truncate
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }

  // Detect abuse: more than 10 sentences suggests non-drill content
  const sentences = cleaned.split(/[.!?。！？]\s*/);
  if (sentences.length > 10) {
    return { text: cleaned, abused: true };
  }

  return { text: cleaned, abused: false };
}
