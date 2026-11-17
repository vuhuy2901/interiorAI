import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

function makeBlueprintTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#fffdf8';
  context.fillRect(0, 0, 512, 512);
  context.strokeStyle = '#bfdbfe';
  context.lineWidth = 2;
  for (let offset = 32; offset < 512; offset += 32) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset, 512);
    context.stroke();
    context.beginPath();
    context.moveTo(0, offset);
    context.lineTo(512, offset);
    context.stroke();
  }
  context.strokeStyle = '#2563eb';
  context.lineWidth = 8;
  context.strokeRect(74, 92, 360, 300);
  context.lineWidth = 5;
  context.strokeRect(116, 140, 128, 112);
  context.strokeRect(282, 140, 110, 76);
  context.strokeRect(282, 278, 110, 78);
  context.fillStyle = '#2563eb';
  context.font = '24px sans-serif';
  context.fillText('BEDROOM / 3×4M', 104, 60);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function BlueprintWall() {
  const texture = useMemo(makeBlueprintTexture, []);
  const panelXs = [-3.7, 0, 3.7];

  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <group>
      {panelXs.map((x, index) => (
        <group key={x} position={[x, 2.25, -9.78]}>
          <mesh position={[0, 0, -0.025]} castShadow receiveShadow>
            <boxGeometry args={[1.65, 1.65, 0.04]} />
            <meshStandardMaterial color="#111827" roughness={0.55} />
          </mesh>
          <mesh rotation={[0, 0, 0]} position={[0, 0, 0.01]} castShadow receiveShadow>
            <planeGeometry args={[1.5, 1.5]} />
            <meshStandardMaterial map={texture ?? undefined} color={texture ? '#ffffff' : index % 2 ? '#dbeafe' : '#eff6ff'} roughness={0.82} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
