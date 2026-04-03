import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NODE_ENV,

  // 10% performance traces (free tier friendly)
  tracesSampleRate: 0.1,
});
