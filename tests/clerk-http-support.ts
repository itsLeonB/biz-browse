import { randomUUID } from "node:crypto";
import { testUsers, validateKeys, type ClerkTransport } from "./admin-browser-support.ts";

async function clerkRequest(
  secret: string,
  path: string,
  options?: { method?: "POST" | "DELETE"; body?: string },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`https://api.clerk.com/v1${path}`, {
      method: options?.method ?? "GET",
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: options?.body,
    });
  } catch {
    throw new Error("Clerk request failed");
  }
  if (!response.ok) throw new Error(`Clerk request failed (${response.status})`);
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new Error("Invalid Clerk response");
  }
}

export async function createHttpTestUsers(
  secret: string,
  publishable: string,
): Promise<{
  adminUserIds: string;
  sessionIds: { admin1: string; admin2: string; outsider: string };
  cleanup(): Promise<void>;
}> {
  validateKeys(secret, publishable);
  const runId = randomUUID();
  const clerk: ClerkTransport = async (path, options) => {
    const result = await clerkRequest(secret, path, options);
    if (result === null || result === undefined) return result;
    if (Array.isArray(result)) return result;
    if (typeof result !== "object") throw new Error("Invalid Clerk user response");
    return result as { id: string };
  };
  const users = testUsers(clerk, runId);
  const cleanup = async () => {
    if ((await users.cleanup()).length) throw new Error("Failed to clean up Clerk test users");
  };
  try {
    const create = async (role: string) => {
      const userId = await users.create(`${runId}-${role}@example.com`, `${randomUUID()}Aa1!`);
      if (typeof userId !== "string" || !userId) throw new Error("Invalid Clerk user response");
      const session = await clerkRequest(secret, "/sessions", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
      if (
        !session ||
        typeof session !== "object" ||
        !("id" in session) ||
        typeof session.id !== "string" ||
        !session.id
      )
        throw new Error("Invalid Clerk session response");
      return { userId, sessionId: session.id };
    };
    const admin1 = await create("admin1");
    const admin2 = await create("admin2");
    const outsider = await create("outsider");
    return {
      adminUserIds: `${admin1.userId},${admin2.userId}`,
      sessionIds: {
        admin1: admin1.sessionId,
        admin2: admin2.sessionId,
        outsider: outsider.sessionId,
      },
      cleanup,
    };
  } catch {
    try {
      await cleanup();
    } catch {
      throw new Error("Clerk test setup failed; cleanup failed");
    }
    throw new Error("Clerk test setup failed");
  }
}

export async function httpAuthHeaders(
  sessionId: string | undefined,
): Promise<Record<string, string>> {
  if (!sessionId) return {};
  const secret = process.env.TEST_CLERK_SECRET_KEY;
  if (!secret || !/^sk_test_[A-Za-z0-9_-]+$/.test(secret))
    throw new Error("Use a Clerk test secret key only");
  const token = await clerkRequest(secret, `/sessions/${encodeURIComponent(sessionId)}/tokens`, {
    method: "POST",
  });
  if (
    !token ||
    typeof token !== "object" ||
    !("jwt" in token) ||
    typeof token.jwt !== "string" ||
    !token.jwt
  )
    throw new Error("Invalid Clerk token response");
  return { Authorization: `Bearer ${token.jwt}` };
}
