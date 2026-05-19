/**
 * Pet config loader — fetches /pets/pets.json at runtime.
 */

export async function loadPetConfig() {
  try {
    const res = await fetch('/pets/pets.json');
    return await res.json();
  } catch (err) {
    console.error('Failed to load pet config:', err);
    return null;
  }
}

export function resolveSkin(config, petId) {
  if (!config) return null;
  const pet = config.pets.find((p) => p.id === petId) || config.pets[0];
  if (!pet) return null;

  const rowMap = Object.fromEntries(
    config.spritesheetRows.map((r) => [r.key, r])
  );

  return {
    id: pet.id,
    name: pet.displayName,
    size: pet.size,
    src: `/pets/${pet.id}/${pet.spritesheetPath}`,
    grid: config.grid,
    sprite: config.spritesheetRows,
    rowMap,
    fps: config.fps,
    agentStateMap: config.agentStateMap,
  };
}
