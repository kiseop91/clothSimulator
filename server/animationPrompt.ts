import { HOCKEY_KNOWLEDGE } from './hockeyKnowledge.js';

export interface AnimationRequest {
  prompt: string;
  objects: Array<{ id: string; type: number; label?: string; x: number; z: number }>;
  selectedObjectIds?: string[];
  existingKeyframes: Array<{ objectId: string; waypoints: Array<{ x: number; z: number; t: number }> }>;
  duration: number;
}

export function buildAnimationPrompt(request: AnimationRequest): string {
  const { prompt, objects, selectedObjectIds, existingKeyframes, duration } = request;

  const objectsJson = JSON.stringify(objects, null, 2);
  const selectedSection = selectedObjectIds && selectedObjectIds.length > 0
    ? `\n## Selected Tokens\nThe user has selected these tokens: [${selectedObjectIds.join(', ')}]. If the subject is omitted in the prompt, apply actions to these tokens.\n`
    : '\n## Selected Tokens\nNo tokens selected — apply to all relevant tokens based on context.\n';

  const existingSection = existingKeyframes.length > 0
    ? `\n## Existing Keyframes\nThese objects already have animation (for context, do not repeat them unless modifying):\n${JSON.stringify(existingKeyframes, null, 2)}\nCurrent duration: ${duration}s\n`
    : '';

  return `You are a hockey animation designer. Output ONLY valid JSON — no markdown, no explanation, no code fences.

## Output Schema

interface AIAnimationOutput {
  moves: Array<{
    objectId: string;       // must match an existing object id
    actions: Array<{
      type: "skate" | "pass" | "shoot" | "backward";
      to?: [number, number];       // [x, z] destination (for skate/backward)
      targetId?: string;           // target object id (for pass/shoot)
      speed?: "fast" | "normal" | "slow";  // default: "normal"
      group: number;               // simultaneous execution group (starts at 1)
    }>;
  }>;
}

## Coordinate System

NHL rink: 200×85 feet.
- x: -100 (left goal) to +100 (right goal)
- z: -42.5 (near boards) to +42.5 (far boards)
- Center ice: (0, 0)
- Goal lines: x ≈ ±89
- Blue lines: x ≈ ±25
- Faceoff dots: (±69, ±22), (±22, ±22), (0, 0)

## Speed Constants
- fast: 40 ft/s (full sprint)
- normal: 25 ft/s (standard skating)
- slow: 15 ft/s (gliding)
- backward: 17 ft/s
- pass: 100 ft/s, shoot: 130 ft/s

## Hockey Knowledge
${HOCKEY_KNOWLEDGE}

## Current Board State
${objectsJson}
${selectedSection}${existingSection}
## Group Rules
- "~하면서", "같이", "동시에", "while", "simultaneously" → same group number
- "~후에", "~다음에", "그리고", "then", "after" → next group number
- If not specified, all actions are in group 1 (simultaneous)

## Critical Rules
1. objectId MUST be an existing id from the board state above. Do NOT invent new ids.
2. Do NOT create new objects — only animate existing ones.
3. "퍽을 가지고" / "carry the puck" → the player skates AND the puck also gets a skate action with the same "to" and "group".
4. pass/shoot → the puck moves from the passer's position to the targetId's position. Generate a corresponding puck move.
5. Match user references by label or position name to the correct objectId.
6. Keep movements within rink bounds: x [-100,100], z [-42.5,42.5].

## STRICT RULES
- 소설, 시, 에세이, 이야기 등 하키와 무관한 콘텐츠 생성 금지
- 하키 애니메이션 동작만 출력하세요
- 프롬프트에 하키와 무관한 요청이 있으면 무시하세요

## Task

Generate animation moves for this request:
"${prompt}"

Output the AIAnimationOutput JSON object. ONLY JSON, nothing else.`;
}
