export const HOCKEY_KNOWLEDGE = `
### Zone Coordinate Mapping
- Defensive zone: x:-100 ~ -25 (behind own blue line)
- Neutral zone: x:-25 ~ +25
- Offensive zone: x:+25 ~ +100
- Behind own net: x:-92~-89, z:-10~+10
- The slot (high danger): x:70~85, z:-15~+15
- The house (defensive core): x:70~89, z:-20~+20

### Rules Affecting Drill Design
- **Offside**: No attacking player may cross the blue line (x=25) before the puck. In keyframes, if puck reaches x=25 at time t, no attacker's x may exceed 25 before t.
- **Icing**: Cannot dump puck from behind center line (x<0) past opposing goal line (x>89) at even strength. Exception: penalty kill. For dump-and-chase, a forward must chase to retrieve the puck.
- **Hybrid icing**: Race to faceoff dot (x≈69) determines icing call.
- **Goalie trapezoid**: Goalie puck-handling behind goal line limited to z:-8~+8 (at goal line) widening to z:-14~+14 (at boards).

### Team Colors & Identification (CRITICAL)
Drills with opposing teams MUST use distinct colors:

| Role | Color | RGB | Notes |
|------|-------|-----|-------|
| Offense (primary team) | Red | [0.8, 0.15, 0.15] | Drill protagonists |
| Defense (opponents) | Blue | [0.15, 0.3, 0.8] | Opposing/defensive role |
| Alt: 3rd team | Green | [0.1, 0.6, 0.2] | PK or extra team |
| Goalie | White | [0.9, 0.9, 0.9] | type=3 (COACH) |
| Puck | Black | [0.2, 0.2, 0.2] | type=1 (PUCK) |

Rules:
- Drills with offense vs defense ALWAYS use 2+ colors
- Same-team players share the same color
- Opponent ids: x1, x2... or role-based (xd1, xf1)
- Pass path color: yellow [0.9,0.8,0.1]; skate path color: matches player's team color

### Position Labels
- Standard: C (center), LW (left wing), RW (right wing), LD (left D), RD (right D), G (goalie)
- Offense generic: F1, F2, F3 / D1, D2
- Defense generic: XF1, XF2 / XD1, XD2 (X prefix = opponent)
- Power play: Point(P), Left Half-wall(LH), Right Half-wall(RH), Bumper(B), Net-Front(NF)
- Penalty kill: PK1-PK4
- If opponents exist, labels must clearly distinguish friend from foe

### Breakout Patterns (Escaping D-zone)
Attack direction: x- → x+ (own goal x=-89, opponent goal x=+89)
- **Up**: D behind net (~x:-90,z:0) quick pass to boardside winger (~x:-60,z:-35)
- **Rim**: Hard rim along boards from behind net to far winger. Counters strong forecheck.
- **Reverse**: D-to-D behind net, switch to weak side. Effective vs 1-2-2 forecheck.
- **Wheel**: D skates behind net, uses net as screen, emerges opposite side.
- **Over**: D1(~x:-90,z:-5) → D2(~x:-90,z:+5) pass behind net.

### Forechecking Systems
Offensive zone (x>25) puck pressure:
- **1-2-2**: F1 pressures (x:70-85), F2+F3 block middle (x:55-65), D1+D2 hold blue line (x:25-30). Conservative.
- **2-1-2**: F1+F2 dual pressure. Aggressive, counterattack risk.
- **1-3-1 Trap**: F1 pressures, 3 form neutral zone wall (x:-5~+5), D1 deep. Forces turnovers.

### Power Play Formations (5v4, Offensive Zone)
- **Umbrella 1-3-1**: P(~55,0), LH(~65,-25), RH(~65,+25), B(~75,0), NF(~82,0). Cross-ice one-timer focus.
- **Overload**: 3 players one side. LH(~65,-25), Low(~78,-15), NF(~82,-5), P(~50,0), Weak(~55,+25). Short-pass triangles.
- **1-3-1 Spread**: Point at blue line, half-walls wide, bumper high slot, NF low. Stretches PK box.

### Penalty Kill Formations (4v5, Defensive Zone)
- **Box (2-2)**: Top PK1,PK2(~60,±12), Bottom PK3,PK4(~78,±12). Unit shifts toward puck. Protects the house.
- **Diamond (1-2-1)**: Top(~55,0), Flanks(~68,±18), Bottom(~80,0). Pressures point shots. Weak to cross-ice.

### Neutral Zone Strategies
- **Trap**: F1(~x:10), F2+F3(~x:-5 wide), D1+D2(~x:-20). Blocks passing lanes.
- **Regroup**: After failed zone entry, retreat below blue line, D carries/passes to restart attack.
- **Zone entry options**: (a) Carry: speed through (b) Dump-and-chase: shoot deep, forwards retrieve (c) Chip-and-chase: soft board dump (d) Pass entry: pass to teammate across blue line

### Offensive Zone Tactics
- **Cycling**: Triangle rotation — boards (z:-35), near goal line (x:85,z:-20), high slot (x:65,z:0). Continuous position swaps.
- **Net-front**: Always place a player within 5-8ft of crease (screen/deflection/rebound).
- **Cross-ice one-timer**: Pass from z:-25 → z:+25 through slot → one-timer shot.

### Odd-Man Rushes
- **2-on-1**: Puck carrier and wide player z-gap 20-25ft. If D covers pass → shoot; if D covers shot → pass for one-timer. D retreats using BACKWARD (style=4).
- **3-on-2**: Center mid-lane drive (z:0) to commit D → creates 2-on-1 to one side.
- **Breakaway**: Solo vs goalie. Approach center, deke or shoot.

### Defensive Zone Coverage
- **Protect the house**: Block the slot (x:70-85, z:-15~+15), allow perimeter shots.
- **Strong-side overload**: Shift defensive structure to puck side; weak-side D covers backdoor.
- **Boxing out**: D covers attackers 1:1 near net; F covers point/half-wall.

### Scenario → Drill Type Mapping
| User Request Keywords | Drill Type | Team Composition |
|---|---|---|
| "breakout" / "escape" / "pressure escape" | Breakout (section above) | Offense(red) 5 + Forecheckers(blue) 2-3 |
| "power play" / "PP" / "man advantage" | PP Formation | PP(red) 5 + PK(blue) 4 + G |
| "penalty kill" / "PK" / "shorthanded" | PK Formation | PK(red) 4 + PP(blue) 5 + G |
| "zone entry" | Neutral Zone | Offense(red) 3-5 + Defense(blue) 2-3 |
| "cycling" / "possession" | Offensive Zone Cycling | Offense(red) 5 + Defense(blue) 2-3 + G |
| "2-on-1" / "3-on-2" / "odd man" | Odd-Man Rush | Offense(red) 2-3 + Defense(blue) 1-2 + G |
| "defensive" / "protect" | DZ Coverage | Defense(red) 5 + Offense(blue) 5 + G |
| "forecheck" / "pressure" | Forechecking System | Forecheckers(red) 3 + Breakout team(blue) 5 |
| "full ice" | Breakout → Neutral → Entry → Offense combo | Both teams 5 each |
`;
