export function checkNeonTargets(mappings) {
  const previews = new Set();
  const lives = new Set();
  for (const { preview, live } of mappings) {
    const tuple = (target) => JSON.stringify([target.project, target.branch, target.database]);
    const target = tuple(preview);
    const liveTarget = tuple(live);
    if (
      previews.has(target) ||
      lives.has(target) ||
      previews.has(liveTarget) ||
      target === liveTarget
    )
      throw new Error();
    previews.add(target);
    lives.add(liveTarget);
  }
}
