import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHttpTestUsers } from "../tests/clerk-http-support.ts";

const secret = process.env.TEST_CLERK_SECRET_KEY;
const publishable = process.env.TEST_CLERK_PUBLISHABLE_KEY;
if (
  !secret ||
  !/^sk_test_[a-zA-Z0-9_-]+$/.test(secret) ||
  !publishable ||
  !/^pk_test_[a-zA-Z0-9_-]+$/.test(publishable)
) {
  console.error(
    "Set TEST_CLERK_SECRET_KEY and TEST_CLERK_PUBLISHABLE_KEY to dedicated Clerk test-instance keys.",
  );
  process.exit(1);
}

process.umask(0o077);
let child: ChildProcess | undefined;
let interrupted = false;
const interrupt = () => {
  interrupted = true;
  child?.kill("SIGTERM");
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
process.on("SIGHUP", interrupt);
let directory: string | undefined;
let fixture: Awaited<ReturnType<typeof createHttpTestUsers>> | undefined;
let failed = false;
try {
  fixture = await createHttpTestUsers(secret, publishable);
  if (interrupted) throw new Error("Interrupted");
  directory = await mkdtemp(join(tmpdir(), "authenticated-tests-"));
  const envFile = join(directory, "env");
  const varsFile = join(directory, "dev.vars");
  await writeFile(envFile, `VITE_CLERK_PUBLISHABLE_KEY=${publishable}\n`, { mode: 0o600 });
  await writeFile(
    varsFile,
    `CLERK_SECRET_KEY=${secret}\nVITE_CLERK_PUBLISHABLE_KEY=${publishable}\nADMIN_USER_IDS=${fixture.adminUserIds}\n`,
    { mode: 0o600 },
  );
  if (interrupted) throw new Error("Interrupted");
  child = spawn("./scripts/test-compose.sh", [], {
    stdio: "inherit",
    env: {
      ...process.env,
      ENV_FILE: envFile,
      DEV_VARS_FILE: varsFile,
      TEST_CLERK_SECRET_KEY: secret,
      TEST_AUTHENTICATED: "1",
      TEST_ADMIN_1_SESSION_ID: fixture.sessionIds.admin1,
      TEST_ADMIN_2_SESSION_ID: fixture.sessionIds.admin2,
      TEST_OUTSIDER_SESSION_ID: fixture.sessionIds.outsider,
    },
  });
  const status = await new Promise<number | null>((resolve, reject) => {
    child?.once("error", reject);
    child?.once("close", resolve);
  });
  if (status !== 0 || interrupted) failed = true;
} catch {
  console.error("Authenticated test setup or execution failed.");
  failed = true;
} finally {
  if (fixture) {
    try {
      await fixture.cleanup();
    } catch {
      console.error("Failed to delete authenticated test users.");
      failed = true;
    }
  }
  if (directory) {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      console.error("Failed to remove authenticated test files.");
      failed = true;
    }
  }
}
if (interrupted) failed = true;
if (failed) process.exitCode = 1;
