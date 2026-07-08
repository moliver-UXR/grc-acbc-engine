import { z } from "zod";
import type { StudyConfig } from "./types.js";

export class ConfigError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(`Config error [${field}]: ${message}`);
    this.name = "ConfigError";
    this.field = field;
  }
}

const LevelSchema = z.object({
  id: z.string(),
  label: z.string(),
  price_increment: z.number().optional(),
});

const AttributeSchema = z.object({
  id: z.string(),
  label: z.string(),
  levels: z.array(LevelSchema).min(1),
  in_byo: z.boolean(),
  price_type: z.enum(["none", "component", "summed"]),
  vary_in_screening: z.boolean().optional(),
});

const DesignParamsSchema = z.object({
  T: z.number().int().positive(),
  Amin: z.number().int().positive(),
  Amax: z.number().int().positive(),
  screens_per_concept_batch: z.number().int().positive(),
  total_screening_screens: z.number().int().positive(),
  price_variation_pct: z.number().min(0).max(1),
  price_rounding: z.number().positive(),
  prohibited_pairs: z
    .array(
      z
        .array(z.object({ attributeId: z.string(), levelId: z.string() }))
        .length(2),
    )
    .optional(),
});

const EstimationConfigSchema = z.object({
  method: z.enum(["hb", "mnl", "monotone_regression"]),
  price_function: z.enum(["linear", "log_linear", "piecewise"]),
  piecewise_breakpoints: z.array(z.number()).optional(),
});

const PhaseFlagsSchema = z.object({
  byo: z.boolean(),
  screening: z.boolean(),
  must_have: z.boolean(),
  unacceptable: z.boolean(),
  tournament: z.boolean(),
  calibration: z.boolean(),
});

const StudyConfigSchema = z.object({
  study: z.object({
    attributes: z.array(AttributeSchema).min(1),
    design: DesignParamsSchema,
    phases: PhaseFlagsSchema,
    estimation: EstimationConfigSchema,
  }),
});

export function parseConfig(json: unknown): StudyConfig {
  const result = StudyConfigSchema.safeParse(json);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue.path.join(".");
    throw new ConfigError(field, firstIssue.message);
  }
  return result.data as StudyConfig;
}

export function safeParseConfig(json: unknown): { success: true; data: StudyConfig } | { success: false; error: ConfigError } {
  const result = StudyConfigSchema.safeParse(json);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue.path.join(".");
    return { success: false, error: new ConfigError(field, firstIssue.message) };
  }
  return { success: true, data: result.data as StudyConfig };
}
