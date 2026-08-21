import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter config for deploying this Next.js app to Cloudflare Workers.
 *
 * This app is entirely dynamic — every route is `force-dynamic` or driven by
 * Server Actions, with no ISR / `revalidate` / `generateStaticParams`. So the
 * incremental cache is intentionally left unconfigured: there is nothing to
 * cache between requests. If a statically-revalidated route is ever added,
 * wire an R2 (or KV) incremental cache here per the OpenNext Cloudflare docs.
 */
export default defineCloudflareConfig({});
