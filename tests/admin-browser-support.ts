export interface ClerkUser {
  id: string;
  private_metadata?: { browser_test_run?: string };
  email_addresses?: { email_address: string }[];
}

export type ClerkTransport = (
  path: string,
  options?: { method?: "POST" | "DELETE"; body?: string },
) => Promise<ClerkUser | ClerkUser[] | null | undefined>;

export function validateKeys(secret: string, publishable: string) {
  if (!/^sk_test_[A-Za-z0-9_-]+$/.test(secret)) throw new Error("Use a Clerk test secret key only");
  if (!/^pk_test_[A-Za-z0-9_-]+$/.test(publishable))
    throw new Error("Use a Clerk test publishable key only");
}

export function testUsers(clerk: ClerkTransport, runId: string) {
  const users: { email: string; id: string | null }[] = [];
  return {
    async create(email: string, password: string) {
      const entry: { email: string; id: string | null } = { email, id: null };
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
      if (!user || Array.isArray(user)) throw new Error("Invalid Clerk user response");
      entry.id = user.id;
      return user.id;
    },
    async cleanup() {
      const failures = [];
      for (const { email, id } of users) {
        try {
          const matches = id
            ? []
            : await clerk(`/users?email_address=${encodeURIComponent(email)}`);
          if (!Array.isArray(matches)) throw new Error("Invalid Clerk user list response");
          const ids = id
            ? [id]
            : matches
                .filter(
                  (user) =>
                    user.private_metadata?.browser_test_run === runId &&
                    user.email_addresses?.some((address) => address.email_address === email),
                )
                .map((user) => user.id);
          for (const userId of ids)
            await clerk(`/users/${encodeURIComponent(userId)}`, {
              method: "DELETE",
            });
        } catch {
          failures.push(`Clerk user for ${email}`);
        }
      }
      return failures;
    },
  };
}
