import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

try {
  const env = process.env;
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const repo = env.GITHUB_REPOSITORY;
  const sha = /^[a-f0-9]{40}$/;
  const positive = /^[1-9][0-9]*$/;
  if (
    env.GITHUB_EVENT_NAME !== "pull_request_target" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? "") ||
    !positive.test(env.GITHUB_RUN_ID ?? "") ||
    !positive.test(env.GITHUB_RUN_ATTEMPT ?? "") ||
    !sha.test(env.GITHUB_SHA ?? "") ||
    !sha.test(env.GITHUB_WORKFLOW_SHA ?? "") ||
    env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA ||
    !env.GITHUB_TOKEN
  )
    throw new Error();

  const gate = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./preview-build-entry.mjs", import.meta.url)),
      env.GITHUB_EVENT_PATH,
      env.PREVIEW_MAPPINGS,
      repo,
    ],
    { encoding: "utf8" },
  );
  if (gate.status !== 0) throw new Error();

  const api = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error();
    return response.json();
  };
  const [repository, pr, run] = await Promise.all([
    api(""),
    api(`/pulls/${event.number}`),
    api(`/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}`),
  ]);
  if (
    repository.full_name !== repo ||
    repository.default_branch !== event.repository.default_branch ||
    env.GITHUB_WORKFLOW_REF !==
      `${repo}/.github/workflows/preview-build.yml@refs/heads/${repository.default_branch}` ||
    pr.number !== event.number ||
    pr.state !== "open" ||
    !["OWNER", "MEMBER", "COLLABORATOR"].includes(pr.author_association) ||
    pr.user?.id !== event.pull_request.user?.id ||
    !Number.isSafeInteger(pr.user?.id) ||
    pr.user.id < 1 ||
    pr.base?.repo?.id !== repository.id ||
    pr.head?.repo?.id !== repository.id ||
    pr.base?.repo?.full_name !== repo ||
    pr.head?.repo?.full_name !== repo ||
    pr.base.ref !== repository.default_branch ||
    pr.head.sha !== event.pull_request.head.sha ||
    !Number.isSafeInteger(repository.id) ||
    repository.id < 1 ||
    String(run.id) !== env.GITHUB_RUN_ID ||
    String(run.run_attempt) !== env.GITHUB_RUN_ATTEMPT ||
    run.event !== "pull_request_target" ||
    run.path !== ".github/workflows/preview-build.yml" ||
    run.repository?.id !== repository.id ||
    run.head_sha !== env.GITHUB_SHA
  )
    throw new Error();

  process.stdout.write(
    JSON.stringify({
      pr: pr.number,
      head_sha: pr.head.sha,
      source_repository: repo,
      source_repository_id: repository.id,
      workflow_ref: env.GITHUB_WORKFLOW_REF,
      workflow_sha: env.GITHUB_WORKFLOW_SHA,
      run_id: env.GITHUB_RUN_ID,
      run_attempt: env.GITHUB_RUN_ATTEMPT,
      mapping_sha256: createHash("sha256")
        .update(readFileSync(join(env.PREVIEW_MAPPINGS, `pr-${event.number}.json`)))
        .digest("hex"),
    }),
  );
} catch {
  process.stderr.write("Preview identity rejected: validation failed.\n");
  process.exitCode = 1;
}
