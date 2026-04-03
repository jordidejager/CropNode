import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NODE_ENV,

  // 10% performance traces (free tier friendly)
  tracesSampleRate: 0.1,

  // Replay only on errors
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Filter noise
  ignoreErrors: [
    "ResizeObserver loop",
    "Network request failed",
    "Load failed",
    "AbortError",
  ],
});
