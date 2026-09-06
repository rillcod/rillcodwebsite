export type ProgrammeDeliveryType = "compulsory" | "optional";

export type ProgrammeDeliveryOption = {
  value: ProgrammeDeliveryType;
  label: string;
  description: string;
};

/**
 * Programme delivery describes how a programme is taught. It is deliberately
 * independent from schools.programme_standing, which decides whose marks are
 * authoritative on a learner report.
 */
export const PROGRAMME_DELIVERY_OPTIONS: readonly ProgrammeDeliveryOption[] = [
  {
    value: "compulsory",
    label: "Core programme",
    description: "A guided course with planned lessons and checkpoints.",
  },
  {
    value: "optional",
    label: "Elective programme",
    description: "A flexible, project-led course learners can take by choice.",
  },
] as const;

export function normalizeProgrammeDeliveryType(
  value: unknown,
): ProgrammeDeliveryType {
  return value === "optional" ? "optional" : "compulsory";
}

export function programmeDeliveryOption(
  value: unknown,
): ProgrammeDeliveryOption {
  const normalized = normalizeProgrammeDeliveryType(value);
  return PROGRAMME_DELIVERY_OPTIONS.find((option) => option.value === normalized)!;
}
