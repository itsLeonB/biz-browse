import { ClerkProvider } from "@clerk/tanstack-react-start";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { StoreIcon } from "lucide-react";
import stylesheet from "../styles.css?url";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({ links: [{ rel: "stylesheet", href: stylesheet }] }),
  component: () => <Outlet />,
  shellComponent: Root,
  notFoundComponent: () => (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            <h1>Halaman tidak ditemukan</h1>
          </EmptyTitle>
          <EmptyDescription>Listing ini tidak tersedia atau tidak lagi publik.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <a className={buttonVariants()} href="/">
            Kembali ke direktori
          </a>
        </EmptyContent>
      </Empty>
    </main>
  ),
});
function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Direktori Bisnis</title>
        <meta name="theme-color" content="#ffffff" />
        <meta
          name="description"
          content="Temukan bisnis yang dijual di Indonesia. Telusuri kategori, kota, dan harga, lalu hubungi pemilik melalui WhatsApp."
        />
        <HeadContent />
      </head>
      <body>
        <ClerkProvider>
          <a className="skip-link" href="#main-content">
            Lewati ke konten
          </a>
          <header className="site-header">
            <nav className="site-nav" aria-label="Navigasi utama">
              <a className="brand" href="/">
                <span className="brand-mark">
                  <StoreIcon aria-hidden="true" className="size-5" />
                </span>
                Direktori Bisnis
              </a>
              <div className="nav-links">
                <Link to="/" reloadDocument activeOptions={{ exact: true }}>
                  Jelajahi bisnis
                </Link>
                <Link to="/admin" reloadDocument>
                  Admin
                </Link>
              </div>
            </nav>
          </header>
          {children}
          <footer className="site-footer">
            <div>
              <p>Bisnis yang dijual di Indonesia.</p>
              <p>Hubungi pemilik. Direktori ini tidak menangani transaksi.</p>
            </div>
          </footer>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  );
}
