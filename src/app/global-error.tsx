"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="dark bg-background text-foreground">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold">Er ging iets mis</h2>
            <p className="text-muted-foreground">
              Het probleem is automatisch gemeld.
            </p>
            <button
              onClick={reset}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full transition-colors"
            >
              Opnieuw proberen
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
