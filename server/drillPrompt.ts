import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HOCKEY_KNOWLEDGE } from './hockeyKnowledge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let exampleDrill: string | null = null;

function loadExample(): string {
  if (!exampleDrill) {
    try {
      exampleDrill = readFileSync(join(__dirname, '..', 'drill-2on1.json'), 'utf-8');
    } catch {
      exampleDrill = '(example not available)';
    }
  }
  return exampleDrill;
}

export function buildPrompt(userPrompt: string): string {
  const example = loadExample();

  return `You are a hockey drill designer. Output ONLY valid JSON — no markdown, no explanation, no code fences.

## Data Types

interface DrillObject {
  id: string;         // unique, e.g. "f1", "d1", "puck1"
  type: number;       // TokenType: 0=PLAYER, 1=PUCK, 2=CONE, 3=COACH
  x: number;          // rink X in feet
  z: number;          // rink Z in feet
  color: [number, number, number]; // RGB 0..1
  label?: string;     // e.g. "F1", "D1", "G"
}

interface DrillPath {
  id: string;
  style: number;      // PathStyle: 0=SOLID(skate), 1=DASHED(pass), 2=ZIGZAG(shoot), 3=DOTTED, 4=BACKWARD
  color: [number, number, number];
  hasArrow: boolean;
  waypoints: Array<{ x: number; z: number }>;
}

interface DrillKeyframe {
  objectId: string;   // must match a DrillObject id
  waypoints: Array<{ x: number; z: number; t: number }>; // t: 0..1 normalized time
}

interface Drill {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  rinkLayout: number; // 0=FULL_RINK, 1=HALF_RINK, 2=NEUTRAL_ZONE, 3=END_ZONE
  duration: number;   // seconds (5-15 recommended)
  objects: DrillObject[];
  paths: DrillPath[];
  keyframes: DrillKeyframe[];
}

## Coordinate System

NHL rink: 200×85 feet.
- x: -100 (left goal) to +100 (right goal)
- z: -42.5 (near boards) to +42.5 (far boards)
- Center ice: (0, 0)
- Goal lines: x ≈ ±89
- Blue lines: x ≈ ±25
- Faceoff dots: (±69, ±22), (±22, ±22), (0, 0)

## Constraints

- Every keyframe's objectId MUST match an object's id
- keyframe t values: 0.0 to 1.0, first must be 0.0, last must be 1.0
- Initial keyframe (x,z) should match the object's starting (x,z)
- Paths show the planned route visually; keyframes drive actual animation
- Use pass paths (style=1, dashed) between passer and receiver positions
- Use shoot paths (style=2, zigzag) from shooter to goal
- Common team colors: red [0.8,0.15,0.15], blue [0.15,0.3,0.8], black [0.2,0.2,0.2]
- Puck color: [0.2,0.2,0.2], Coach/Goalie: [0.9,0.9,0.9]
- Duration: typically 5-12 seconds

## Hockey Rules & Tactics Reference
${HOCKEY_KNOWLEDGE}

## Example

${example}

## Task

Create a hockey drill for this request:
"${userPrompt}"

Output the complete Drill JSON object. ONLY JSON, nothing else.`;
}
