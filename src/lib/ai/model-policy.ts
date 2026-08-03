import {
  availableFreeModels,
  freeModelCatalogue,
  isFreeModel,
  FREE_FALLBACK_MODELS,
} from "./openrouter";

/**
 * One place that decides which AI models anything in this app may call.
 *
 * Before this, every route carried its own hand-written queue — generate,
 * project-gen, spine-regen, graphics, study-chat and others, each repeating the
 * same ids. They drifted: only one of them got the free-first fix, and all of
 * them still named free models OpenRouter retired long ago. A queue written in
 * six places is a rule enforced in none.
 *
 * Routes now describe the job and get a queue back. Nothing else picks models.
 */

export type AiTask = {
  /** The route's preferred models, strongest first. Optional. */
  prefer?: string[];
  /** The reply must be a JSON document. */
  needsJson?: boolean;
  /** Roughly how much input this task sends, so short-window models are skipped. */
  contextTokensNeeded?: number;
  signal?: AbortSignal;
};

/**
 * The queue to try, in order.
 *
 * Free models come first and paid preferences are kept behind them, so an
 * exhausted free tier degrades to something billable rather than failing the
 * user. Within the free tier:
 *
 *  - a JSON task only offers models that support response_format, because
 *    coaxing JSON out of a model that cannot promise it is where malformed
 *    lessons came from;
 *  - models whose window is too small for the input are dropped rather than
 *    called and truncated;
 *  - the route's own picks lead, if they still exist.
 */
export async function modelQueueFor(task: AiTask): Promise<string[]> {
  const preferred = task.prefer ?? [];
  const catalogue = await freeModelCatalogue(task.signal);

  const usable = catalogue.filter((model) => {
    if (task.needsJson && !model.supportsJson) return false;
    if (
      task.contextTokensNeeded &&
      model.contextTokens &&
      model.contextTokens < task.contextTokensNeeded
    ) {
      return false;
    }
    return true;
  });

  // Falling back to the whole free tier beats returning nothing: a model that
  // cannot promise JSON can still usually produce it, and the caller's parser
  // already recovers from fenced or prefixed output.
  const freeTier = usable.length ? usable : catalogue;
  const freeIds = freeTier.map((model) => model.id);

  const requestedFirst = preferred.filter((id) => freeIds.includes(id));
  const rest = freeIds.filter((id) => !requestedFirst.includes(id));
  const free = [...requestedFirst, ...rest];

  if (process.env.AI_FREE_MODELS_ONLY === "true") {
    return free.length ? free : FREE_FALLBACK_MODELS;
  }

  const paid = preferred.filter((id) => !isFreeModel(id));
  const queue = [...free, ...paid];
  return queue.length ? queue : FREE_FALLBACK_MODELS;
}

/** Convenience for callers that only need somewhere to start. */
export async function defaultFreeModel(signal?: AbortSignal): Promise<string> {
  const ids = await availableFreeModels(signal);
  return ids[0] ?? FREE_FALLBACK_MODELS[0];
}
