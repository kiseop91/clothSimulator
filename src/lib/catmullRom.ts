// Catmull-Rom spline utilities for smooth curved paths

interface Point2D {
  x: number;
  z: number;
}

interface PointWithTime {
  x: number;
  z: number;
  t: number;
}

/** Evaluate Catmull-Rom spline at parameter t (0..1) given 4 control points */
function catmullRom(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

/** Tessellate waypoints into a dense array of points using Catmull-Rom spline.
 *  Returns original waypoints if fewer than 3 points. */
export function tessellateSpline(waypoints: Point2D[], segments: number = 16): Point2D[] {
  if (waypoints.length < 3) return waypoints;

  const result: Point2D[] = [];
  const n = waypoints.length;

  for (let i = 0; i < n - 1; i++) {
    // Phantom points for endpoints via reflection
    const p0 = i === 0
      ? { x: 2 * waypoints[0].x - waypoints[1].x, z: 2 * waypoints[0].z - waypoints[1].z }
      : waypoints[i - 1];
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const p3 = i === n - 2
      ? { x: 2 * waypoints[n - 1].x - waypoints[n - 2].x, z: 2 * waypoints[n - 1].z - waypoints[n - 2].z }
      : waypoints[i + 2];

    const segCount = i === n - 2 ? segments : segments; // all segments same
    for (let s = 0; s < segCount; s++) {
      result.push(catmullRom(p0, p1, p2, p3, s / segCount));
    }
  }
  // Add the last point
  result.push({ x: waypoints[n - 1].x, z: waypoints[n - 1].z });

  return result;
}

/** Tessellate waypoints with time values. Time is linearly interpolated within each segment. */
export function tessellateSplineWithTime(waypoints: PointWithTime[], segments: number = 16): PointWithTime[] {
  if (waypoints.length < 3) return waypoints;

  const result: PointWithTime[] = [];
  const n = waypoints.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = i === 0
      ? { x: 2 * waypoints[0].x - waypoints[1].x, z: 2 * waypoints[0].z - waypoints[1].z }
      : waypoints[i - 1];
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const p3 = i === n - 2
      ? { x: 2 * waypoints[n - 1].x - waypoints[n - 2].x, z: 2 * waypoints[n - 1].z - waypoints[n - 2].z }
      : waypoints[i + 2];

    const t0 = waypoints[i].t;
    const t1 = waypoints[i + 1].t;

    for (let s = 0; s < segments; s++) {
      const frac = s / segments;
      const pt = catmullRom(p0, p1, p2, p3, frac);
      result.push({ x: pt.x, z: pt.z, t: t0 + (t1 - t0) * frac });
    }
  }
  // Add the last point
  const last = waypoints[n - 1];
  result.push({ x: last.x, z: last.z, t: last.t });

  return result;
}

/** Interpolate position on a spline at a given time t, using Catmull-Rom if 3+ waypoints. */
export function interpolateSpline(waypoints: PointWithTime[], t: number): Point2D | null {
  if (waypoints.length === 0) return null;
  if (waypoints.length === 1) return { x: waypoints[0].x, z: waypoints[0].z };
  if (t <= waypoints[0].t) return { x: waypoints[0].x, z: waypoints[0].z };
  if (t >= waypoints[waypoints.length - 1].t) {
    const last = waypoints[waypoints.length - 1];
    return { x: last.x, z: last.z };
  }

  // Find the segment containing t
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (t >= waypoints[i].t && t <= waypoints[i + 1].t) {
      const segT = (t - waypoints[i].t) / (waypoints[i + 1].t - waypoints[i].t);
      const n = waypoints.length;

      const p0 = i === 0
        ? { x: 2 * waypoints[0].x - waypoints[1].x, z: 2 * waypoints[0].z - waypoints[1].z }
        : waypoints[i - 1];
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const p3 = i === n - 2
        ? { x: 2 * waypoints[n - 1].x - waypoints[n - 2].x, z: 2 * waypoints[n - 1].z - waypoints[n - 2].z }
        : waypoints[i + 2];

      return catmullRom(p0, p1, p2, p3, segT);
    }
  }
  return null;
}
