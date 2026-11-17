import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isAdmin } from "../server/auth.server";
import { listPhotos, uploadPhoto } from "../server/photos.server";

const maxBytes = 5 * 1024 * 1024;
const uuid = z.uuid();

export const Route = createFileRoute("/api/photos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });
        const listing = uuid.safeParse(new URL(request.url).searchParams.get("listing"));
        if (!listing.success) return new Response("Invalid listing", { status: 400 });
        return Response.json(await listPhotos(listing.data), {
          headers: { "Cache-Control": "no-store" },
        });
      },
      POST: async ({ request }) => {
        if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return new Response("Forbidden", { status: 403 });
        const listing = uuid.safeParse(request.headers.get("x-listing-id"));
        const type = request.headers.get("content-type");
        if (
          !listing.success ||
          !["image/jpeg", "image/png", "image/webp"].includes(type ?? "") ||
          !request.body
        )
          return new Response("Invalid photo", { status: 400 });
        const reader = request.body.getReader();
        const parts: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes) {
            await reader.cancel();
            return new Response("Photo too large", { status: 413 });
          }
          parts.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of parts) {
          bytes.set(part, offset);
          offset += part.length;
        }
        const valid =
          type === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : type === "image/png"
              ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
              : size >= 12 &&
                String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
                String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
        if (!valid) return new Response("Invalid photo", { status: 400 });
        const id = await uploadPhoto(listing.data, bytes, type!);
        return id
          ? Response.json({ id }, { headers: { "Cache-Control": "no-store" } })
          : new Response("Not found", { status: 404 });
      },
    },
  },
});
