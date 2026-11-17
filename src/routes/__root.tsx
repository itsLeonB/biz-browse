import { ClerkProvider } from "@clerk/tanstack-react-start";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({ component: () => <Outlet />, shellComponent: Root });
function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Direktori Bisnis</title>
        <HeadContent />
      </head>
      <body>
        <ClerkProvider>{children}</ClerkProvider>
        <Scripts />
      </body>
    </html>
  );
}
