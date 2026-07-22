import { z } from 'zod';

export const schoolReportPatchSchema = z
  .object({
    title: z.string().trim().min(3).max(180).optional(),
    narrative: z.record(z.string(), z.unknown()).optional(),
    narrativePatch: z.record(z.string(), z.unknown()).optional(),
    design: z.record(z.string(), z.unknown()).optional(),
    autosave: z.boolean().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    forcePublish: z.boolean().optional(),
    forcePublishReason: z.string().trim().min(8).max(500).optional(),
    withdrawReason: z.string().trim().min(8).max(500).optional(),
    expectedRevision: z.number().int().positive().optional(),
    deliveryDeclaration: z
      .object({
        selectedTopicKeys: z.array(z.string()).optional(),
        /** Report window length (8/10/14) — judgment denominator stored with span in snapshot. */
        reportingWeeks: z.number().int().positive().optional(),
      })
      .optional(),
  });

export type SchoolReportPatchInput = z.infer<typeof schoolReportPatchSchema>;
