/// <reference types="@cloudflare/workers-types" />
/**
 * Thin Cloudflare Worker gateway that proxies all traffic to a Next.js
 * Container (full Node runtime). This avoids OpenNext's single-Worker
 * 64 MiB script limit for the full LMS.
 *
 * Type-checked by tsconfig.worker.json, not the Next build: the Workers globals it needs
 * (DurableObjectNamespace, ScheduledController, …) redefine fetch and Response, so pulling
 * them into the app program breaks every route that reads a JSON body.
 */
import { Container, getContainer } from "@cloudflare/containers";
import {
  canReplayContainerRequest,
  classifyContainerFailure,
} from "../lib/cloudflare/container-request-recovery";

/** Public + secret keys forwarded into the Next.js container process. */
const CONTAINER_ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
  "NEXT_PUBLIC_LIVEKIT_URL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_SUMMER_SCHOOL_WHATSAPP_GROUP",
  "ENABLE_PAYMENTS",
  "LIVEKIT_URL",
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "RESEND_FROM_EMAIL",
  "WHATSAPP_API_URL",
  "ADMIN_OPS_EMAIL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "PAYSTACK_SECRET_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "SENDPULSE_API_ID",
  "SENDPULSE_API_SECRET",
  "OPENROUTER_API_KEY",
  // The AI engine rotates across every Gemini key it can see, and each free key
  // carries its own quota. Only the first was forwarded here, so adding
  // GEMINI_API_KEY_2.._5 multiplied the quota in local dev and did nothing at
  // all in production — the container never received them.
  "GEMINI_API_KEY",
  "GEMINI_API_KEY_2",
  "GEMINI_API_KEY_3",
  "GEMINI_API_KEY_4",
  "GEMINI_API_KEY_5",
  "GEMINI_API_KEYS",
  "HUGGINGFACE_API_KEY",
  // Workers AI is called over its REST API rather than a Worker binding,
  // because the Next app runs in the container and bindings live on the Worker.
  // Both must be forwarded or the free image and Whisper tiers are silently
  // absent in production while working perfectly in local dev — the same shape
  // of failure the Gemini keys above had.
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "R2_SECRET_ACCESS_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "VAPID_PRIVATE_KEY",
  "WHATSAPP_API_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "CRON_SECRET",
  "BILLING_CRON_SECRET",
  "BILLING_LINK_SECRET",
  "BILLING_LINK_LEGACY_UNTIL",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
] as const;

type GatewayEnv = {
  NEXT_APP: DurableObjectNamespace<NextAppContainer>;
  CRON_SECRET?: string;
  BILLING_CRON_SECRET?: string;
  /** Must be exactly "true" before this Worker is allowed to fire any cron. */
  CLOUDFLARE_OWNS_CRON?: string;
} & Record<string, string | undefined>;

function containerEnvFromWorker(env: GatewayEnv): Record<string, string> {
  const out: Record<string, string> = {
    NODE_ENV: "production",
    PORT: "3000",
    HOSTNAME: "0.0.0.0",
  };
  for (const key of CONTAINER_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Shared Next.js container instance.
 * standard-2 in wrangler.toml gives RAM headroom for Next + PDF.
 */
export class NextAppContainer extends Container {
  defaultPort = 3000;
  // Keep the short scale-to-zero window: standard-2 reserves 6 GiB while it is
  // running. Readiness recovery below fixes cold-start races without paying to
  // keep an idle container warm.
  sleepAfter = "3m";
  enableInternet = true;

  constructor(ctx: DurableObjectState<GatewayEnv>, env: GatewayEnv) {
    super(ctx, env);
    this.envVars = containerEnvFromWorker(env);
  }

  override onStart(): void {
    console.log("[NextAppContainer] started");
  }

  override onStop(): void {
    console.log("[NextAppContainer] stopped");
  }

  override onError(error: unknown): void {
    console.error("[NextAppContainer] error", error);
  }

  /**
   * The library normally starts a sleeping container inside containerFetch().
   * During the narrow stopped -> starting transition its transport can instead
   * return a raw 500 saying "consider calling start()". Intercept only those
   * library responses, wait for port 3000 once, and replay only read-only work.
   */
  override async fetch(request: Request): Promise<Response> {
    const replayRequest = canReplayContainerRequest(request) ? request.clone() : null;

    let response: Response;
    try {
      response = await this.containerFetch(request, this.defaultPort);
    } catch (error) {
      console.error("[NextAppContainer] proxy transport threw", error);
      return containerUnavailableResponse(request);
    }

    const failure = await classifyContainerResponse(response);
    if (!failure) return response;

    console.warn("[NextAppContainer] intercepted container lifecycle response", {
      status: response.status,
      failure,
      method: request.method,
      pathname: new URL(request.url).pathname,
    });

    if (failure !== "retryable" || !replayRequest) {
      return containerUnavailableResponse(request);
    }

    try {
      await this.startAndWaitForPorts({
        ports: this.defaultPort,
        cancellationOptions: {
          abort: replayRequest.signal,
          instanceGetTimeoutMS: 12_000,
          portReadyTimeoutMS: 20_000,
          waitInterval: 250,
        },
      });

      // Rebuild the read-only request through the URL overload. Workers Request
      // carries incoming-CF metadata generics that are deliberately narrower
      // than the Container library's internal Request type.
      const retryResponse = await this.containerFetch(
        replayRequest.url,
        {
          method: replayRequest.method,
          headers: replayRequest.headers,
          signal: replayRequest.signal,
        },
        this.defaultPort,
      );
      if (!(await classifyContainerResponse(retryResponse))) return retryResponse;
    } catch (error) {
      console.error("[NextAppContainer] one-shot readiness recovery failed", error);
    }

    return containerUnavailableResponse(request);
  }
}

async function classifyContainerResponse(response: Response) {
  if (response.status < 500) return null;
  try {
    return classifyContainerFailure(response.status, await response.clone().text());
  } catch {
    return null;
  }
}

function containerUnavailableResponse(request: Request): Response {
  const headers = new Headers({
    "cache-control": "no-store",
    "retry-after": "3",
    "x-rillcod-service-state": "starting",
  });
  const isDocument = request.headers.get("sec-fetch-dest") === "document";

  if (!isDocument) {
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(
      JSON.stringify({
        error: "Rillcod is starting. Please try again in a few seconds.",
        code: "SERVICE_STARTING",
        retryable: true,
      }),
      { status: 503, headers },
    );
  }

  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Rillcod is starting</title>
    <style>
      :root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
      body{min-height:100vh;margin:0;display:grid;place-items:center;background:#f5f7fb;color:#172033}
      main{width:min(34rem,calc(100% - 2rem));box-sizing:border-box;padding:2rem;border:1px solid #dce3ee;border-radius:1.25rem;background:#fff;box-shadow:0 18px 50px rgba(23,32,51,.1);text-align:center}
      .mark{display:grid;place-items:center;width:3rem;height:3rem;margin:0 auto 1rem;border-radius:1rem;background:#e8f1ff;color:#1261a6;font-weight:800}
      h1{margin:.25rem 0 .5rem;font-size:clamp(1.4rem,5vw,2rem)}p{margin:0 0 1.4rem;color:#526176;line-height:1.6}
      button{min-height:2.75rem;padding:.7rem 1.1rem;border:0;border-radius:.75rem;background:#1261a6;color:#fff;font:inherit;font-weight:700;cursor:pointer}
      @media(prefers-color-scheme:dark){body{background:#0d1420;color:#edf4ff}main{background:#141f2e;border-color:#2a3a50}.mark{background:#18395a;color:#b9dcff}p{color:#aebed2}}
    </style>
  </head>
  <body>
    <main role="status">
      <div class="mark" aria-hidden="true">R</div>
      <h1>Your workspace is starting</h1>
      <p>This normally takes only a few seconds. Your work is safe.</p>
      <button type="button" onclick="location.reload()">Try again</button>
    </main>
  </body>
</html>`,
    { status: 503, headers },
  );
}

/**
 * Cron expression → container route.
 *
 * These fire ONLY when `CLOUDFLARE_OWNS_CRON` is exactly "true" in wrangler.toml [vars].
 * Without that flag `scheduled()` is a no-op, so restoring a `[triggers]` block cannot by
 * itself start firing jobs.
 *
 * The flag exists because these routes are ALSO called by cron-job.org, which is the real
 * scheduler (see src/lib/operations/cron-registry.ts). Running both sends parents a second
 * copy of every invoice, billing and payment reminder — which is exactly what happened
 * between 2026-07-31 and 2026-08-04, when a `[triggers]` block sat live in wrangler.toml.
 *
 * To hand scheduling to Cloudflare: disable the cron-job.org entries FIRST, confirm they have
 * stopped, then add `[triggers]` and set CLOUDFLARE_OWNS_CRON = "true" in the same change.
 */
const CRON_PATHS: Record<string, string> = {
  "0 7 * * *": "/api/cron/invoice-reminders",
  "0 8 * * *": "/api/cron/billing-reminders",
  "0 9 * * *": "/api/cron/payment-reminders",
  "5 5 * * *": "/api/cron/term-scheduler",
  "30 6 * * *": "/api/cron/receipt-sweep",
  "0 10 * * *": "/api/cron/school-report-readiness",
  "30 4 * * *": "/api/cron/academic-readiness",
  "0 9 1 * *": "/api/cron/weekly-summary",
  "0 3 * * *": "/api/cron/integrity-sweep",
};

function appContainer(env: GatewayEnv) {
  return getContainer(env.NEXT_APP, "main");
}

export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    return appContainer(env).fetch(request);
  },

  async scheduled(controller: ScheduledController, env: GatewayEnv): Promise<void> {
    // Guard: cron-job.org owns scheduling unless this is explicitly flipped. Firing without it
    // double-sends the reminder emails that go to parents. See CRON_PATHS above.
    if (env.CLOUDFLARE_OWNS_CRON !== "true") {
      console.warn(
        "[gateway] ignoring cron",
        controller.cron,
        "— CLOUDFLARE_OWNS_CRON is not \"true\". cron-job.org is the scheduler; " +
          "firing here as well would double-send parent emails.",
      );
      return;
    }

    const path = CRON_PATHS[controller.cron];
    if (!path) {
      console.warn("[gateway] no route mapping for cron", controller.cron);
      return;
    }
    const secret = env.CRON_SECRET || env.BILLING_CRON_SECRET || "";
    const url = new URL(path, "http://container.local");
    const headers = new Headers({ "x-cron-secret": secret });
    if (secret) headers.set("authorization", `Bearer ${secret}`);
    const res = await appContainer(env).fetch(
      new Request(url.toString(), { method: "GET", headers }),
    );
    console.log("[gateway] cron", controller.cron, path, res.status);
  },
};
