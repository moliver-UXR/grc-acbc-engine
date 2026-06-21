import { describe, it, expect } from "vitest";
import { parseConfig, safeParseConfig, ConfigError } from "../../src/core/config.js";
import sampleStudy from "../fixtures/sample-study.json";

describe("parseConfig", () => {
  it("parses a valid config", () => {
    const config = parseConfig(sampleStudy);
    expect(config.study.attributes).toHaveLength(3);
    expect(config.study.design.T).toBe(6);
    expect(config.study.phases.byo).toBe(true);
  });

  it("throws ConfigError when attributes is missing", () => {
    expect(() => parseConfig({ study: {} })).toThrow(ConfigError);
  });

  it("throws ConfigError when attributes is empty", () => {
    const invalid = { ...sampleStudy, study: { ...sampleStudy.study, attributes: [] } };
    expect(() => parseConfig(invalid)).toThrow(ConfigError);
  });

  it("safeParseConfig returns error for invalid config", () => {
    const result = safeParseConfig({ study: {} });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ConfigError);
      expect(result.error.field).toBeTruthy();
    }
  });

  it("safeParseConfig returns data for valid config", () => {
    const result = safeParseConfig(sampleStudy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.study.attributes).toHaveLength(3);
    }
  });
});