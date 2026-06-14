import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  DynamicTexture,
  Texture,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { CONFIG } from './config';

/**
 * Terrain height (analytic function used to snap all units to the ground). Currently fully flat.
 * If you want terrain elevation later, just return a height here (the rest of the ground-snapping is already wired up).
 */
export function terrainHeight(_x: number, _z: number): number {
  return 0;
}

/** Apocalypse asphalt material: high-res with varied random elements to reduce tiling repetition */
function asphaltMaterial(scene: Scene): StandardMaterial {
  const px = 1024;
  const tex = new DynamicTexture('ground-tex', px, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

  /** Base color */
  ctx.fillStyle = '#262d39';
  ctx.fillRect(0, 0, px, px);

  /** Light/dark asphalt patches (repair marks, breaking up a flat color) */
  for (let k = 0; k < 14; k++) {
    const w = 80 + Math.random() * 240;
    const h = 80 + Math.random() * 240;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(Math.random() * px, Math.random() * px, w, h);
  }

  /** Grain noise */
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(Math.random() * px, Math.random() * px, 2, 2);
  }

  /** seam */
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, px, px);

  /** Cracks (jagged branches) */
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  for (let k = 0; k < 10; k++) {
    let x = Math.random() * px;
    let y = Math.random() * px;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += (Math.random() - 0.5) * 160;
      y += (Math.random() - 0.5) * 160;
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.stroke();
  }

  /** Manhole cover */
  for (let k = 0; k < 3; k++) {
    const mx = Math.random() * px;
    const my = Math.random() * px;
    const r = 26 + Math.random() * 14;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,170,190,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mx, my, r - 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Water/oil stains (dark, irregular) */
  for (let k = 0; k < 5; k++) {
    const bx = Math.random() * px;
    const by = Math.random() * px;
    const r = 30 + Math.random() * 60;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, 'rgba(10,14,22,0.5)');
    g.addColorStop(1, 'rgba(10,14,22,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Blood stain */
  for (let k = 0; k < 4; k++) {
    const bx = Math.random() * px;
    const by = Math.random() * px;
    const r = 24 + Math.random() * 55;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, 'rgba(85,12,12,0.6)');
    g.addColorStop(1, 'rgba(85,12,12,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Faded road markings (white/yellow dashes, random angle) */
  for (let k = 0; k < 8; k++) {
    ctx.save();
    ctx.translate(Math.random() * px, Math.random() * px);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(200,180,45,0.18)' : 'rgba(210,210,210,0.16)';
    for (let d = 0; d < 3; d++) ctx.fillRect(d * 34, 0, 22, 5);
    ctx.restore();
  }

  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = 6;
  tex.vScale = 6;

  const material = new StandardMaterial('ground-material', scene);
  material.diffuseTexture = tex;
  material.specularColor = Color3.Black();
  return material;
}

/**
 * Build undulating terrain: subdivide the ground mesh, by terrainHeight Displace vertices and recompute normals.
 * return mesh and the height-query function (both share one function, keeping visuals and ground-snapping consistent).
 */
export function createTerrain(scene: Scene): { mesh: Mesh; heightAt: (x: number, z: number) => number } {
  const size = CONFIG.arenaHalf * 2.4;
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: size, height: size, subdivisions: 120, updatable: true },
    scene,
  );

  const positions = ground.getVerticesData(VertexBuffer.PositionKind);
  if (positions) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] = terrainHeight(positions[i], positions[i + 2]);
    }
    ground.updateVerticesData(VertexBuffer.PositionKind, positions);
    const indices = ground.getIndices();
    if (indices) {
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      ground.updateVerticesData(VertexBuffer.NormalKind, normals);
    }
  }

  ground.material = asphaltMaterial(scene);
  ground.isPickable = false;
  return { mesh: ground, heightAt: terrainHeight };
}
