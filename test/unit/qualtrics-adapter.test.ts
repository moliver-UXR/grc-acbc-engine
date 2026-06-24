import { describe, it, expect } from "vitest";
import { parseConfig } from "../../src/core/config.js";
import { grcConfig } from "../../src/configs/grc.js";

describe("grcConfig", () => {
  it("parses without error", () => {
    expect(() => parseConfig(grcConfig)).not.toThrow();
  });

  it("has 8 attributes", () => {
    const parsed = parseConfig(grcConfig);
    expect(parsed.study.attributes).toHaveLength(8);
  });
});
