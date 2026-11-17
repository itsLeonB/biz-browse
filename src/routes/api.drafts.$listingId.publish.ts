import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isAdmin } from "../server/auth.server";
import { publish } from "../server/publication.server";

export const Route = createFileRoute("/api/drafts/$listingId/publish")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return new Response("Forbidden", { status: 403 });
        if (!z.uuid().safeParse(params.listingId).success)
          return new Response("Not found", { status: 404 });
        const status = await publish(params.listingId);
        return new Response(
          status === 200 ? "Published" : status === 400 ? "Incomplete listing" : "Not found",
          { status, headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
