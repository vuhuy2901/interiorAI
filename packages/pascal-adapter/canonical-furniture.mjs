/** Measured canonical geometry, never a guessed catalog asset. Units are metres. */
export function canonicalFurnitureObject(item) {
  const [w, d, h] = [item.width_mm, item.depth_mm, item.height_mm].map(v => v / 1000)
  if (![w, d, h].every(v => Number.isFinite(v) && v > 0)) throw new Error(`Invalid dimensions: ${item.id}`)
  const color = /^#[0-9a-f]{6}$/i.test(item.color_hex || '') ? item.color_hex : '#C8A986'
  const category = item.category || 'furniture'
  // Existing pieces without meshes are explicitly measured envelopes. A bench
  // has an authored seat and four legs, with exactly the requested outer bounds.
  const bench = category === 'bench'
  const leg = Math.min(w, d, h) * 0.15
  const seat = Math.min(0.08, h * 0.2)
  const parts = bench
    ? [[w, seat, d, 0, h - seat / 2, 0], ...[-1, 1].flatMap(x => [-1, 1].map(z =>
      [leg, h - seat, leg, x * (w - leg) / 2, (h - seat) / 2, z * (d - leg) / 2]))]
    : [[w, h, d, 0, h / 2, 0]]
  const code = `export const mount = 'floor';
export default function build({THREE}) {
 const group = new THREE.Group();
 const material = new THREE.MeshStandardMaterial({color:${JSON.stringify(color)},roughness:0.8});
 material.name = 'slot_finish';
 const parts = ${JSON.stringify(parts)};
 parts.forEach(([w,h,d,x,y,z], index) => {
   const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
   mesh.name = 'part:' + (${bench} && index === 0 ? 'seat' : 'body_' + index);
   mesh.position.set(x,y,z); group.add(mesh);
 }); return group;
}`
  return {
    code, language: 'three', name: item.name.slice(0, 120), category: category.slice(0, 60),
    description: `${bench ? 'Authored bench' : 'Canonical bounding envelope'}: ${item.id}`.slice(0, 200),
    reason: 'Preserve canonical furniture dimensions and placement during scene synchronization.',
    position: [item.x_mm / 1000, (item.z_mm ?? 0) / 1000, item.y_mm / 1000],
    // Canonical rotation is counterclockwise in XY; Pascal is Y-up (XZ).
    rotation: -(item.rotation_deg ?? 0), exact: true,
  }
}

export function canonicalSyncBrief() {
  const quote = 'Synchronize only the supplied canonical furniture, preserving existing furniture.'
  const axis = {kind: 'bounded', quote, reading: 'Preserve the supplied canonical scene without designing additional pieces.'}
  return {
    axes: Object.fromEntries(['action','size','form','facade','pieces','openings','style','materials','dressing']
      .map(key => [key, key === 'pieces' ? {...axis, extent: 'exact'} : axis])),
    source: 'existing', sourceQuote: 'existing furniture',
    vision: 'Faithful canonical scene synchronization using measured furniture envelopes and an authored bench.',
    beyond: Object.fromEntries(['textiles','light','windows','walls','floor','plants','objects','smallFurniture']
      .map(key => [key, {none: 'Add no pieces beyond the supplied canonical scene.'}])),
  }
}
