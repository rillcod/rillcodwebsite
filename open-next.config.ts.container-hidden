import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Disable ISR caching — removes the WORKER_SELF_REFERENCE binding requirement.
// This app does not use on-demand revalidation so cache bindings are not needed.
// Force npm: a tracked bun.lock makes OpenNext prefer `bun run build`, which fails
// on machines (and Cloudflare) without Bun installed.
export default {
  ...defineCloudflareConfig({
    incrementalCache: "dummy",
    tagCache: "dummy",
    queue: "dummy",
  }),
  buildCommand: "npm run build",
};
