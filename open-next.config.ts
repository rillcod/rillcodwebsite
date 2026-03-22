import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Disable ISR caching — removes the WORKER_SELF_REFERENCE binding requirement.
// This app does not use on-demand revalidation so cache bindings are not needed.
export default defineCloudflareConfig({
  minify: true,
  incrementalCache: "dummy",
  tagCache: "dummy",
  queue: "dummy",
} as any);
