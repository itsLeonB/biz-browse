import { afterEach, expect, test, vi } from "vitest";
import { createHttpTestUsers, httpAuthHeaders } from "./clerk-http-support";

const secret = "sk_test_synthetic";
const publishable = "pk_test_synthetic";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("creates isolated users and sessions and cleans up only those users", async () => {
  const deleted: string[] = [];
  const users: { id: string; email: string; run: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/v1/users" && options.method === "POST") {
        const body = JSON.parse(String(options.body));
        const user = {
          id: `user_${users.length + 1}`,
          email: body.email_address[0],
          run: body.private_metadata.browser_test_run,
        };
        users.push(user);
        return Response.json({ id: user.id });
      }
      if (path === "/v1/sessions") {
        const body = JSON.parse(String(options.body));
        return Response.json({ id: `session_${body.user_id}` });
      }
      if (options.method === "DELETE") {
        deleted.push(path);
        return Response.json({ deleted: true });
      }
      throw new Error("Unexpected request");
    }),
  );
  const result = await createHttpTestUsers(secret, publishable);
  expect(result.adminUserIds).toBe("user_1,user_2");
  expect(result.sessionIds).toEqual({
    admin1: "session_user_1",
    admin2: "session_user_2",
    outsider: "session_user_3",
  });
  expect(new Set(users.map((user) => user.run)).size).toBe(1);
  await result.cleanup();
  expect(deleted).toEqual(["/v1/users/user_1", "/v1/users/user_2", "/v1/users/user_3"]);
});

test.each(["user", "session"])(
  "cleans up after uncertain %s creation without leaking errors",
  async (failure) => {
    const deleted: string[] = [];
    let email = "";
    let run = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        const parsed = new URL(url);
        if (parsed.pathname === "/v1/users" && options.method === "POST") {
          const body = JSON.parse(String(options.body));
          email = body.email_address[0];
          run = body.private_metadata.browser_test_run;
          if (failure === "user") throw new Error(`leak ${secret}`);
          return Response.json({ id: "own" });
        }
        if (parsed.pathname === "/v1/sessions") throw new Error(`leak ${secret}`);
        if (parsed.pathname === "/v1/users" && options.method === "GET")
          return Response.json([
            {
              id: "own",
              private_metadata: { browser_test_run: run },
              email_addresses: [{ email_address: email }],
            },
            {
              id: "other",
              private_metadata: { browser_test_run: "other" },
              email_addresses: [{ email_address: email }],
            },
          ]);
        if (options.method === "DELETE") {
          deleted.push(parsed.pathname);
          return Response.json({ deleted: true });
        }
        throw new Error("Unexpected request");
      }),
    );
    await expect(createHttpTestUsers(secret, publishable)).rejects.toThrow(
      /^Clerk test setup failed$/,
    );
    expect(deleted).toEqual(["/v1/users/own"]);
  },
);

test("cleans up earlier users when a later session fails", async () => {
  const deleted: string[] = [];
  let count = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/v1/users" && options.method === "POST")
        return Response.json({ id: `user_${++count}` });
      if (path === "/v1/sessions")
        return count === 2
          ? new Response("secret body", { status: 500 })
          : Response.json({ id: "session" });
      if (options.method === "DELETE") {
        deleted.push(path);
        return Response.json({ deleted: true });
      }
      throw new Error("Unexpected request");
    }),
  );
  await expect(createHttpTestUsers(secret, publishable)).rejects.toThrow(
    /^Clerk test setup failed$/,
  );
  expect(deleted).toEqual(["/v1/users/user_1", "/v1/users/user_2"]);
});

test("gets a fresh token on every request and reports token failures safely", async () => {
  vi.stubEnv("TEST_CLERK_SECRET_KEY", secret);
  let count = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      count++;
      if (count === 3) throw new Error(`leak ${secret}`);
      return Response.json({ jwt: `token_${count}` });
    }),
  );
  expect(await httpAuthHeaders(undefined)).toEqual({});
  expect(await httpAuthHeaders("session")).toEqual({ Authorization: "Bearer token_1" });
  expect(await httpAuthHeaders("session")).toEqual({ Authorization: "Bearer token_2" });
  await expect(httpAuthHeaders("session")).rejects.toThrow(/^Clerk request failed$/);
});

test("rejects live keys before making requests", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(createHttpTestUsers("sk_live_example", publishable)).rejects.toThrow("test secret");
  expect(fetch).not.toHaveBeenCalled();
});
