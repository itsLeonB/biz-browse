import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isAdmin } from "../server/auth.server";
import { unpublish } from "../server/publication.server";

export const Route = createFileRoute("/api/drafts/$listingId/unpublish")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return new Response("Forbidden", { status: 403 });
        if (!z.uuid().safeParse(params.listingId).success)
          return new Response("Not found", { status: 404 });
        return (await unpublish(params.listingId))
          ? new Response("Unpublished", { headers: { "Cache-Control": "no-store" } })
          : new Response("Not found", { status: 404 });
      },
    },
  },
});
