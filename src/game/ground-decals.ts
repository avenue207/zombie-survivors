import { Scene, MeshBuilder, StandardMaterial, DynamicTexture, Color3, TransformNode, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders';
import { CONFIG } from './config';

/** Road tile native size (8×8) */
const TILE = 8;
/**
 * Road-tile orientation offset: if the road looks rotated wrong by 90°; change this to Math.PI/2 and that's it.
 */
const ROAD_TILE_YAW = 0;

/** Number of scattered ground decals */
const COUNT = 48;

/** Build a ground material from a procedurally drawn texture (with transparency) */
function decalMaterial(scene: Scene, name: string, draw: (ctx: CanvasRenderingContext2D) => void): StandardMaterial {
  const tex = new DynamicTexture(name, 256, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 256);
  draw(ctx);
  tex.update();

  const mat = new StandardMaterial(name, scene);
  mat.diffuseTexture = tex;
  mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;
  return mat;
}

/** Oil stain: a dark radial smear */
function drawOil(ctx: CanvasRenderingContext2D) {
  for (let k = 0; k < 3; k++) {
    const cx = 128 + (Math.random() - 0.5) * 80;
    const cy = 128 + (Math.random() - 0.5) * 80;
    const r = 60 + Math.random() * 60;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(8,10,16,0.7)');
    g.addColorStop(1, 'rgba(8,10,16,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Crack cluster: jagged dark lines radiating from the center */
function drawCrack(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  for (let k = 0; k < 5; k++) {
    let x = 128;
    let y = 128;
    const dir = Math.random() * Math.PI * 2;
    let dx = Math.cos(dir);
    let dy = Math.sin(dir);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      dx += (Math.random() - 0.5) * 0.8;
      dy += (Math.random() - 0.5) * 0.8;
      x += dx * 18;
      y += dy * 18;
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.stroke();
  }
}

/** Road arrow markings (yellow) */
function drawArrow(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(210,190,60,0.5)';
  ctx.fillRect(116, 96, 24, 120);
  ctx.beginPath();
  ctx.moveTo(128, 40);
  ctx.lineTo(86, 104);
  ctx.lineTo(170, 104);
  ctx.closePath();
  ctx.fill();
}

/**
 * Randomly scatter large ground decals (oil/cracks/road marks) to break up the repeating floor.
 * all are static and ground-aligned quad(rotation.y random), used CreateGround so no quaternion handling is needed.
 */
export function scatterGroundDecals(scene: Scene, heightAt: (x: number, z: number) => number) {
  const mats = [
    { mat: decalMaterial(scene, 'decal-oil', drawOil), min: 6, max: 12 },
    { mat: decalMaterial(scene, 'decal-crack', drawCrack), min: 5, max: 10 },
    { mat: decalMaterial(scene, 'decal-arrow', drawArrow), min: 4, max: 7 },
  ];
  const half = CONFIG.arenaHalf;

  for (let i = 0; i < COUNT; i++) {
    const t = mats[i % mats.length];
    const size = t.min + Math.random() * (t.max - t.min);
    const decal = MeshBuilder.CreateGround(`gdecal-${i}`, { width: size, height: size }, scene);
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    decal.position.set(x, heightAt(x, z) + 0.03, z);
    decal.rotation.y = Math.random() * Math.PI * 2;
    decal.material = t.mat;
    decal.isPickable = false;
  }
}

/**
 * use Street_Straight Road tiles join into roads spanning the map (vertical and horizontal crossing into intersections).
 * Occasionally mix in cracked tiles for variety.
 */
export async function buildRoads(scene: Scene, heightAt: (x: number, z: number) => number) {
  const paths = [
    '/models/zombie/street_straight.gltf',
    '/models/zombie/street_crack1.gltf',
    '/models/zombie/street_crack2.gltf',
  ];
  const templates = await Promise.all(
    paths.map(async (p) => {
      const slash = p.lastIndexOf('/');
      const res = await SceneLoader.ImportMeshAsync('', p.slice(0, slash + 1), p.slice(slash + 1), scene);
      res.animationGroups.forEach((g) => g.stop());
      const root = res.meshes[0] as TransformNode;
      res.meshes.forEach((m) => (m.isPickable = false));
      root.setEnabled(false);
      return root;
    }),
  );
  if (!templates[0]) return;

  const half = CONFIG.arenaHalf * 1.2;
  const tiles = Math.ceil((half * 2) / TILE);
  const start = -((tiles - 1) * TILE) / 2;

  /** Lay a full row of road tiles along a line;horizontal=true along x, otherwise along z */
  const layRoad = (offset: number, horizontal: boolean) => {
    for (let k = 0; k < tiles; k++) {
      const along = start + k * TILE;
      const x = horizontal ? along : offset;
      const z = horizontal ? offset : along;
      /** Mostly normal road tiles, a few cracked variants */
      const r = Math.random();
      const tmpl = r < 0.18 && templates[1] ? templates[1] : r < 0.32 && templates[2] ? templates[2] : templates[0];
      const tile = tmpl.clone(`road-tile`, null);
      if (!tile) continue;
      const holder = new TransformNode('road', scene);
      tile.parent = holder;
      tile.setEnabled(true);
      holder.position.set(x, heightAt(x, z) + 0.02, z);
      holder.rotation.y = ROAD_TILE_YAW + (horizontal ? Math.PI / 2 : 0);
      holder.setEnabled(true);
    }
  };

  layRoad(-24, false); // Vertical
  layRoad(32, false); // Vertical
  layRoad(16, true); // Horizontal
}
