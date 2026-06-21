import type { StudyConfig } from "./types.js";
export declare class ConfigError extends Error {
    field: string;
    constructor(field: string, message: string);
}
export declare function parseConfig(json: unknown): StudyConfig;
export declare function safeParseConfig(json: unknown): {
    success: true;
    data: StudyConfig;
} | {
    success: false;
    error: ConfigError;
};
