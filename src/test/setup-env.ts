// Tests must run with Supabase variables.
// CI uses placeholders for pure unit tests; real keys can be set in GitHub secrets for integration runs.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ci-placeholder.supabase.co';
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'ci-placeholder-anon-key';
}

// No wall-clock backoff in tests.
//
// The Gemini client retries a transient failure after 400ms, and its own tests
// walk the whole ladder — every key against every model — sleeping for real at
// each rung. That left the file at 4.8s against vitest's 5s limit: green when
// run alone, seven timeouts the moment the rest of the suite competed for the
// CPU. The retry paths are still exercised; only the waiting is removed.
process.env.AI_RETRY_BACKOFF_MS = '0';
