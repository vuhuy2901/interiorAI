const swatches = [
  '#8b5a2b', '#9ca3af', '#f5f5dc',
  '#6b8e23', '#d4a373', '#94a3b8',
  '#c08457', '#e7d8c9', '#64748b',
];

export function MaterialBoard() {
  const rows = [0, 1, 2];
  const columns = [0, 1, 2];

  return (
    <group position={[-9.78, 2.3, -2.4]}>
      <mesh position={[-0.035, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 2.1, 1.6]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
      </mesh>
      {rows.map((row) => rows.map((_, column) => (
        <mesh key={`${row}-${column}`} position={[0.02, 0.55 - row * 0.5, -0.5 + column * 0.5]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
          <planeGeometry args={[0.4, 0.4]} />
          <meshStandardMaterial color={swatches[row * 3 + column]} roughness={0.86} />
        </mesh>
      )))}
    </group>
  );
}
