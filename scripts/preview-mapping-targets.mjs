export function checkCloudflareTargets(mappings) {
  const previews = new Set();
  const lives = new Set();
  for (const { account, mapping } of mappings) {
    if (!/^[a-f0-9]{32}$/.test(account ?? "")) throw new Error();
    for (const field of ["worker", "bucket"]) {
      const target = `${account}/${field}/${mapping.preview[field]}`;
      const liveTarget = `${account}/${field}/${mapping.live[field]}`;
      if (previews.has(target) || lives.has(target) || previews.has(liveTarget)) throw new Error();
      previews.add(target);
      lives.add(liveTarget);
    }
  }
}

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
