import { SignIn } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
export const Route = createFileRoute("/sign-in/$")({
  component: () => (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <a className="back-link" href="/">
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Kembali ke direktori
      </a>
      <div className="sign-in-layout">
        <div className="page-intro">
          <Badge variant="outline">Area admin</Badge>
          <h1>Masuk admin</h1>
          <p>
            Kelola draf, foto, dan listing bisnis dari satu tempat. Akses hanya untuk admin yang
            ditunjuk.
          </p>
          <p>Ingin mencari bisnis? Direktori dapat dibuka tanpa akun.</p>
        </div>
        <div className="sign-in-widget">
          <SignIn routing="path" path="/sign-in" forceRedirectUrl="/admin" />
        </div>
      </div>
    </main>
  ),
});
