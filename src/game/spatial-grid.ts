/** Spatial hash grid: used for enemy separation, projectile hits, contact checks and other proximity queries, avoiding O(n^2). 
 *
 * per frame clear() then re- insert all targets, then query() Get nearby cell the index.
 */
export class SpatialGrid {
  private cellSize: number;
  private map = new Map<number, number[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  /** will cell Pack coordinates into a single number key(assuming cell the index falls in ±4096 within range) */
  private cellKey(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  clear() {
    this.map.clear();
  }

  insert(index: number, x: number, z: number) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const key = this.cellKey(cx, cz);
    let bucket = this.map.get(key);
    if (!bucket) {
      bucket = [];
      this.map.set(key, bucket);
    }
    bucket.push(index);
  }

  /** query (x,z) current and neighboring cell(3x3) indices, called one by one cb */
  query(x: number, z: number, cb: (index: number) => void) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.map.get(this.cellKey(cx + dx, cz + dz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) cb(bucket[i]);
      }
    }
  }
}
