import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isAdmin } from "../server/auth.server";
import { deletePhoto, readPhoto } from "../server/photos.server";

export const Route = createFileRoute("/api/photos/$photoId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const admin = await isAdmin();
        if (!z.uuid().safeParse(params.photoId).success)
          return new Response("Not found", { status: 404 });
        const photo = await readPhoto(params.photoId, admin);
        return photo
          ? new Response(photo.body, {
              headers: {
                "Content-Type": photo.contentType,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
              },
            })
          : new Response(admin ? "Not found" : "Forbidden", { status: admin ? 404 : 403 });
      },
      DELETE: async ({ request, params }) => {
        if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return new Response("Forbidden", { status: 403 });
        if (!z.uuid().safeParse(params.photoId).success)
          return new Response("Not found", { status: 404 });
        return (await deletePhoto(params.photoId))
          ? new Response(null, { status: 204 })
          : new Response("Not found", { status: 404 });
      },
    },
  },
});
