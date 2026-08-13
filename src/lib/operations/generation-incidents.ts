export type GenerationIncidentKind = 'lessons' | 'slides' | 'flashcards' | 'assignments' | 'projects';

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/**
 * Persist only incidents that are still current. A successful retry removes
 * its content type so Operations Health does not keep displaying a repaired job.
 */
export function nextGenerationIncidentMetadata(
  metadata: unknown,
  kind: GenerationIncidentKind,
  failures: unknown[],
  generatedAt = new Date().toISOString(),
): Record<string, unknown> {
  const nextMetadata = objectValue(metadata);
  const incidents = objectValue(nextMetadata.last_generation_errors);

  if (failures.length > 0) incidents[kind] = failures;
  else delete incidents[kind];

  const hasFailures = ['lessons', 'slides', 'flashcards', 'assignments', 'projects']
    .some((key) => Array.isArray(incidents[key]) && (incidents[key] as unknown[]).length > 0);

  if (hasFailures) {
    incidents.generated_at = generatedAt;
    nextMetadata.last_generation_errors = incidents;
  } else {
    delete nextMetadata.last_generation_errors;
  }

  return nextMetadata;
}

