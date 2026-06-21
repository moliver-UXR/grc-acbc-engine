import { z } from "zod";
import type { ScreeningResponse, CalibrationAnswer } from "./types.js";
export interface BYOSubmittedEvent {
    type: "BYO_SUBMITTED";
    answers: Record<string, string>;
}
export interface ScreenSubmittedEvent {
    type: "SCREEN_SUBMITTED";
    responses: ScreeningResponse[];
}
export interface RuleConfirmedEvent {
    type: "RULE_CONFIRMED";
}
export interface RuleRejectedEvent {
    type: "RULE_REJECTED";
}
export interface TournamentTaskSubmittedEvent {
    type: "TOURNAMENT_TASK_SUBMITTED";
    matchupId: string;
    chosenConceptId: string | null;
}
export interface CalibrationSubmittedEvent {
    type: "CALIBRATION_SUBMITTED";
    answer: CalibrationAnswer;
}
export type EngineEvent = BYOSubmittedEvent | ScreenSubmittedEvent | RuleConfirmedEvent | RuleRejectedEvent | TournamentTaskSubmittedEvent | CalibrationSubmittedEvent;
export declare const BYOSubmittedSchema: z.ZodObject<{
    type: z.ZodLiteral<"BYO_SUBMITTED">;
    answers: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strip>;
export declare const ScreenSubmittedSchema: z.ZodObject<{
    type: z.ZodLiteral<"SCREEN_SUBMITTED">;
    responses: z.ZodArray<z.ZodObject<{
        conceptId: z.ZodString;
        possible: z.ZodBoolean;
        screenIndex: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const RuleConfirmedSchema: z.ZodObject<{
    type: z.ZodLiteral<"RULE_CONFIRMED">;
}, z.core.$strip>;
export declare const RuleRejectedSchema: z.ZodObject<{
    type: z.ZodLiteral<"RULE_REJECTED">;
}, z.core.$strip>;
export declare const TournamentTaskSubmittedSchema: z.ZodObject<{
    type: z.ZodLiteral<"TOURNAMENT_TASK_SUBMITTED">;
    matchupId: z.ZodString;
    chosenConceptId: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const CalibrationSubmittedSchema: z.ZodObject<{
    type: z.ZodLiteral<"CALIBRATION_SUBMITTED">;
    answer: z.ZodObject<{
        conceptId: z.ZodString;
        purchaseIntent: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const EngineEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"BYO_SUBMITTED">;
    answers: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"SCREEN_SUBMITTED">;
    responses: z.ZodArray<z.ZodObject<{
        conceptId: z.ZodString;
        possible: z.ZodBoolean;
        screenIndex: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"RULE_CONFIRMED">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"RULE_REJECTED">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"TOURNAMENT_TASK_SUBMITTED">;
    matchupId: z.ZodString;
    chosenConceptId: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"CALIBRATION_SUBMITTED">;
    answer: z.ZodObject<{
        conceptId: z.ZodString;
        purchaseIntent: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>], "type">;
export declare function parseEvent(raw: unknown): EngineEvent;
