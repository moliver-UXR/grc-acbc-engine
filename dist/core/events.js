// ACBC Engine — Event Types (discriminated union for the reducer)
import { z } from "zod";
// --- Zod schemas for runtime validation ---
export const BYOSubmittedSchema = z.object({
    type: z.literal("BYO_SUBMITTED"),
    answers: z.record(z.string(), z.string()),
});
export const ScreenSubmittedSchema = z.object({
    type: z.literal("SCREEN_SUBMITTED"),
    responses: z.array(z.object({
        conceptId: z.string(),
        possible: z.boolean(),
        screenIndex: z.number(),
    })),
});
export const RuleConfirmedSchema = z.object({
    type: z.literal("RULE_CONFIRMED"),
});
export const RuleRejectedSchema = z.object({
    type: z.literal("RULE_REJECTED"),
});
export const TournamentTaskSubmittedSchema = z.object({
    type: z.literal("TOURNAMENT_TASK_SUBMITTED"),
    matchupId: z.string(),
    chosenConceptId: z.string().nullable(),
});
export const CalibrationSubmittedSchema = z.object({
    type: z.literal("CALIBRATION_SUBMITTED"),
    answer: z.object({
        conceptId: z.string(),
        purchaseIntent: z.number(),
    }),
});
export const EngineEventSchema = z.discriminatedUnion("type", [
    BYOSubmittedSchema,
    ScreenSubmittedSchema,
    RuleConfirmedSchema,
    RuleRejectedSchema,
    TournamentTaskSubmittedSchema,
    CalibrationSubmittedSchema,
]);
// --- Helper to parse and validate an event ---
export function parseEvent(raw) {
    return EngineEventSchema.parse(raw);
}
//# sourceMappingURL=events.js.map