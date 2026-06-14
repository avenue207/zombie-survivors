/** Solid obstacles in the arena (barrels, containers, water towers) blocking the player and enemies. */
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

/**
 * Push a circular entity out of all overlapping obstacles, writing the result into out. 
 * entityRadius is the entity's own radius; handle each obstacle's minimum separation distance one by one.
 */
export function resolveObstacles(
  obstacles: Obstacle[],
  x: number,
  z: number,
  entityRadius: number,
  out: { x: number; z: number },
): void {
  out.x = x;
  out.z = z;
  for (let k = 0; k < obstacles.length; k++) {
    const o = obstacles[k];
    const dx = out.x - o.x;
    const dz = out.z - o.z;
    const min = o.radius + entityRadius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (min - d) / d;
      out.x += dx * push;
      out.z += dz * push;
    } else {
      /** Centers nearly coincide: push out in any direction */
      out.x += min;
    }
  }
}
