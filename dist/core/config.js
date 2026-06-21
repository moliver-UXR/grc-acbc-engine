import { z } from "zod";
export class ConfigError extends Error {
    field;
    constructor(field, message) {
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
});
const DesignParamsSchema = z.object({
    T: z.number().int().positive(),
    Amin: z.number().int().positive(),
    Amax: z.number().int().positive(),
    screens_per_concept_batch: z.number().int().positive(),
    total_screening_screens: z.number().int().positive(),
    price_variation_pct: z.number().min(0).max(1),
    price_rounding: z.number().positive(),
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
export function parseConfig(json) {
    const result = StudyConfigSchema.safeParse(json);
    if (!result.success) {
        const firstIssue = result.error.issues[0];
        const field = firstIssue.path.join(".");
        throw new ConfigError(field, firstIssue.message);
    }
    return result.data;
}
export function safeParseConfig(json) {
    const result = StudyConfigSchema.safeParse(json);
    if (!result.success) {
        const firstIssue = result.error.issues[0];
        const field = firstIssue.path.join(".");
        return { success: false, error: new ConfigError(field, firstIssue.message) };
    }
    return { success: true, data: result.data };
}
//# sourceMappingURL=config.js.map