import { spawn } from "node:child_process";

export function validateKeys(secret, publishable) {
  if (!/^sk_test_[A-Za-z0-9_-]+$/.test(secret)) throw new Error("Use a Clerk test secret key only");
  if (!/^pk_test_[A-Za-z0-9_-]+$/.test(publishable))
    throw new Error("Use a Clerk test publishable key only");
}

export async function startChrome(executable, args) {
  const browser = spawn(executable, args, { stdio: "ignore" });
  await new Promise((resolve, reject) => {
    browser.once("spawn", resolve);
    browser.once("error", reject);
  });
  return browser;
}

export function testUsers(clerk, runId) {
  const users = [];
  return {
    async create(email, password) {
      const entry = { email, id: null };
      users.push(entry);
      const user = await clerk("/users", {
        method: "POST",
        body: JSON.stringify({
          email_address: [email],
          password,
          skip_password_checks: true,
          private_metadata: { browser_test_run: runId },
        }),
      });
      entry.id = user.id;
      return user.id;
    },
    async cleanup() {
      const failures = [];
      for (const { email, id } of users) {
        try {
          let ids = id
            ? [id]
            : (await clerk(`/users?email_address=${encodeURIComponent(email)}`))
                .filter(
                  (user) =>
                    user.private_metadata?.browser_test_run === runId &&
                    user.email_addresses?.some((address) => address.email_address === email),
                )
                .map((user) => user.id);
          for (const userId of ids)
            await clerk(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
        } catch {
          failures.push(`Clerk user for ${email}`);
        }
      }
      return failures;
    },
  };
}
