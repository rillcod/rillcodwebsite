/// <reference types="@cloudflare/workers-types" />

// Workers runtime globals for the container gateway only.
//
// This file lives inside src/cloudflare, which tsconfig.json excludes, so the reference
// applies to the worker program (tsconfig.worker.json) and never reaches the Next app.
// It matters: @cloudflare/workers-types redefines fetch and Response, and pulling it into
// the app program turns every `await request.json()` into `unknown`.
export {};
