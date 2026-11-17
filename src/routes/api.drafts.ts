import { createFileRoute } from "@tanstack/react-router";
import { isAdmin } from "../server/auth.server";
import { draftSchema, getDrafts, saveDraft } from "../server/drafts.server";

export const Route = createFileRoute("/api/drafts")({
  server: {
    handlers: {
      GET: async () => {
        if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });
        return Response.json(await getDrafts(), { headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });
        if (
          request.headers.get("origin") !== new URL(request.url).origin ||
          !request.headers.get("content-type")?.startsWith("application/json")
        )
          return new Response("Forbidden", { status: 403 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const result = draftSchema.safeParse(body);
        if (!result.success) return new Response("Invalid draft", { status: 400 });
        const saved = await saveDraft(result.data);
        return saved.status === 200
          ? Response.json({ id: saved.id }, { headers: { "Cache-Control": "no-store" } })
          : new Response(saved.status === 400 ? "Incomplete listing" : "Not found", {
              status: saved.status,
            });
      },
    },
  },
});
