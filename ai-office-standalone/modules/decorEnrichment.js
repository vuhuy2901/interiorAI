// FEAT-2026-164: Office Decoration Enrichment
// Placement rules & enrichment logic for 5 office rooms

const DECOR_PLACEMENTS = {
  executive: {
    name: "Executive Office",
    placements: [
      { id: "monstera", position: [-3, 0, -3], rotation: [0, 0.5, 0] },
      { id: "marble_table", position: [-2.5, 0.3, -3], rotation: [0, 0, 0] },
      { id: "abstract_art_1", position: [-5, 1.5, -4], rotation: [0, 0, 0] },
      { id: "area_rug_1", position: [0, 0.01, 0], rotation: [0, 0, 0] },
      { id: "pendant_light", position: [2, 2.5, 2], rotation: [0, 0, 0] },
      { id: "snakeplant", position: [3, 0.4, 3], rotation: [0, 0, 0] },
      { id: "bookshelf", position: [4, 0.3, -4], rotation: [0, 0, 0] }
    ]
  },
  creative: {
    name: "Creative Studio",
    placements: [
      { id: "fiddleleaf", position: [-4, 0, -4], rotation: [0, 0.3, 0] },
      { id: "area_rug_2", position: [0, 0.01, 0], rotation: [0, 0, 0] },
      { id: "gallery_frames", position: [5, 1.5, -5], rotation: [0, 0, 0] },
      { id: "abstract_art_2", position: [-5, 1.2, -5], rotation: [0, 0, 0] },
      { id: "task_lamp", position: [3, 0.6, 3], rotation: [0, 0, 0] },
      { id: "pothos", position: [4, 1.2, 2], rotation: [0, 0.2, 0] },
      { id: "succulents", position: [3.5, 0.3, 3.5], rotation: [0, 0, 0] },
      { id: "woven_basket", position: [-3, 0.2, -3.5], rotation: [0, 0, 0] }
    ]
  },
  meeting: {
    name: "Meeting Room",
    placements: [
      { id: "pothos", position: [3, 1.0, 3], rotation: [0, 0, 0] },
      { id: "mirror", position: [5, 1.5, -5], rotation: [0, 0, 0] },
      { id: "area_rug_3", position: [0, 0.01, 0], rotation: [0, 0, 0] },
      { id: "snakeplant", position: [0, 0.4, 2], rotation: [0, 0, 0] }
    ]
  },
  break: {
    name: "Break Room",
    placements: [
      { id: "monstera", position: [-3, 0, -3], rotation: [0, 0.4, 0] },
      { id: "area_rug_1", position: [0, 0.01, 0], rotation: [0, 0, 0] },
      { id: "abstract_art_2", position: [5, 1.2, -4], rotation: [0, 0, 0] },
      { id: "mirror", position: [-5, 1.5, 4], rotation: [0, 0, 0] },
      { id: "ceramic_vase", position: [3, 0.5, 3], rotation: [0, 0, 0] },
      { id: "woven_basket", position: [2, 0.2, 2.5], rotation: [0, 0, 0] },
      { id: "succulents", position: [1, 0.3, -4], rotation: [0, 0, 0] }
    ]
  },
  lobby: {
    name: "Main Lobby",
    placements: [
      { id: "fiddleleaf", position: [-4, 0, -4], rotation: [0, 0.5, 0] },
      { id: "marble_table", position: [-3.5, 0.3, -4.5], rotation: [0, 0, 0] },
      { id: "abstract_art_1", position: [5, 1.8, -5], rotation: [0, 0, 0] },
      { id: "ceramic_vase", position: [2, 0.5, 4], rotation: [0, 0, 0] },
      { id: "pendant_light", position: [0, 2.5, 0], rotation: [0, 0, 0] },
      { id: "pendant_light", position: [3, 2.5, -3], rotation: [0, 0, 0] },
      { id: "bookshelf", position: [-4, 0.3, 4], rotation: [0, 0, 0] },
      { id: "monstera", position: [4, 0, 4], rotation: [0, 0.2, 0] }
    ]
  }
};

export async function loadDecorLibrary() {
  try {
    const res = await fetch('models/decor-library.json');
    const data = await res.json();
    return data.decor.reduce((map, item) => {
      map[item.id] = item;
      return map;
    }, {});
  } catch (e) {
    console.error('Failed to load decor library:', e);
    return {};
  }
}

export async function enrichScene(scene, decorLibrary) {
  if (!decorLibrary || Object.keys(decorLibrary).length === 0) {
    console.warn('Decor library empty, skipping enrichment');
    return;
  }

  const decorGroup = new THREE.Group();
  decorGroup.name = 'DecorGroup';
  scene.add(decorGroup);

  let loaded = 0;
  let errors = 0;

  const loader = new THREE.GLTFLoader();

  for (const [roomId, roomConfig] of Object.entries(DECOR_PLACEMENTS)) {
    for (const placement of roomConfig.placements) {
      const decorSpec = decorLibrary[placement.id];
      if (!decorSpec) {
        console.warn(`Decor not found: ${placement.id}`);
        continue;
      }

      try {
        const gltf = await new Promise((resolve, reject) => {
          loader.load(
            decorSpec.url,
            resolve,
            undefined,
            reject
          );
        });

        const mesh = gltf.scene;

        // Apply scale
        mesh.scale.set(...decorSpec.scale);

        // Apply position & rotation
        mesh.position.set(...placement.position);
        if (placement.rotation) {
          mesh.rotation.set(...placement.rotation);
        }

        // Apply material roughness
        mesh.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.roughness = decorSpec.roughness;
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Add metadata
        mesh.userData.decorId = placement.id;
        mesh.userData.room = roomId;
        mesh.userData.decorName = decorSpec.name;

        decorGroup.add(mesh);
        loaded++;
      } catch (e) {
        console.error(`Failed to load decor ${placement.id}:`, e);
        errors++;
      }
    }
  }

  console.log(`[DecorEnrichment] Loaded ${loaded} models, ${errors} errors. Total: ${loaded + errors}`);
  return decorGroup;
}

export function validateDecorPlacement() {
  // Check for clipping with walls/agents (simplified)
  // Returns { valid: count, warnings: [] }
  const result = { valid: 0, warnings: [] };

  for (const [roomId, roomConfig] of Object.entries(DECOR_PLACEMENTS)) {
    for (const placement of roomConfig.placements) {
      const [x, y, z] = placement.position;

      // Warn if too close to walls (< 0.1m)
      if (Math.abs(x) < 0.1 || Math.abs(z) < 0.1) {
        result.warnings.push(`${placement.id} in ${roomId} too close to wall`);
      }

      // Warn if plants too tall (> 2.0m from floor)
      if (y > 2.0) {
        result.warnings.push(`${placement.id} in ${roomId} height > 2.0m`);
      }

      result.valid++;
    }
  }

  return result;
}

export function getDecorStats() {
  let totalPlacements = 0;
  const byRoom = {};

  for (const [roomId, roomConfig] of Object.entries(DECOR_PLACEMENTS)) {
    byRoom[roomId] = roomConfig.placements.length;
    totalPlacements += roomConfig.placements.length;
  }

  return { totalPlacements, byRoom, roomCount: Object.keys(DECOR_PLACEMENTS).length };
}
