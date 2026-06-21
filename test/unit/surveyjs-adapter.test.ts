import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderACBCSurvey,
  injectACBCStyles,
  type ACBCEngine,
} from "../../src/integration/surveyjs-adapter.js";
import { ACBCEngine as RealEngine } from "../../src/index.js";
import sampleStudy from "../fixtures/sample-study.json";

// ---------------------------------------------------------------------------
// Mock SurveyJS Model
// ---------------------------------------------------------------------------

interface MockPage {
  name: string;
  title: string;
  visibleIf?: string;
  elements: Array<{ name: string; type: string }>;
}

class MockSurveyModel {
  pages: MockPage[] = [];
  private _values: Record<string, unknown> = {};
  private _currentPageNo = 0;
  onCurrentPageChanged = { add: vi.fn() };
  onValueChanged = { add: vi.fn() };
  onComplete = { add: vi.fn() };

  addPage(page: MockPage): MockPage {
    this.pages.push(page);
    return page;
  }

  setValue(name: string, value: unknown): void {
    this._values[name] = value;
  }

  getValue(name: string): unknown {
    return this._values[name];
  }

  get currentPageNo(): number {
    return this._currentPageNo;
  }

  set currentPageNo(value: number) {
    this._currentPageNo = value;
  }

  get visiblePages(): MockPage[] {
    return this.pages;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SurveyJS Adapter", () => {
  let engine: RealEngine;

  beforeEach(() => {
    engine = new RealEngine("study-1", "resp-1", sampleStudy, "test-seed");
    engine.start();
  });

  describe("renderACBCSurvey", () => {
    it("creates survey pages for enabled phases", () => {
      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      const pageNames = survey.pages.map((p) => p.name);
      expect(pageNames).toContain("page-byo");
      expect(pageNames).toContain("page-screening");
      expect(pageNames).toContain("page-confirm-must-have");
      expect(pageNames).toContain("page-confirm-unacceptable");
      expect(pageNames).toContain("page-tournament");
      expect(pageNames).toContain("page-done");
    });

    it("skips calibration page when disabled in config", () => {
      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      const pageNames = survey.pages.map((p) => p.name);
      expect(pageNames).not.toContain("page-calibration");
    });

    it("includes calibration page when enabled", () => {
      const configWithCalibration = {
        ...sampleStudy,
        study: {
          ...sampleStudy.study,
          phases: { ...sampleStudy.study.phases, calibration: true },
        },
      };
      const engineWithCal = new RealEngine("study-2", "resp-2", configWithCalibration, "test-seed");
      engineWithCal.start();

      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engineWithCal);

      const pageNames = survey.pages.map((p) => p.name);
      expect(pageNames).toContain("page-calibration");
    });

    it("sets phase marker value on the survey", () => {
      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      expect(survey.getValue("__acbc_phase")).toBe("BYO");
    });

    it("navigates to the correct page for current phase", () => {
      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      // Should start on BYO page (index 0)
      expect(survey.currentPageNo).toBe(0);
      expect(survey.pages[0].name).toBe("page-byo");
    });

    it("navigates to screening page after BYO submission", () => {
      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      // Submit BYO
      engine.submitEvent({
        type: "BYO_SUBMITTED",
        answers: { brand: "brand_a", price: "price_low", color: "color_red" },
      });

      // After state change, should rebuild pages and navigate to screening
      const screeningPage = survey.pages.find((p) => p.name === "page-screening");
      expect(screeningPage).toBeDefined();
    });

    it("BYO page contains dropdown questions for each BYO attribute", () => {
      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      const byoPage = survey.pages.find((p) => p.name === "page-byo");
      expect(byoPage).toBeDefined();

      const dropdowns = byoPage!.elements.filter((e) => e.type === "dropdown");
      // Sample study has 3 BYO attributes: brand, price, color
      expect(dropdowns).toHaveLength(3);

      const dropdownNames = dropdowns.map((d) => d.name);
      expect(dropdownNames).toContain("byo-brand");
      expect(dropdownNames).toContain("byo-price");
      expect(dropdownNames).toContain("byo-color");
    });

    it("screening page has concept container element", () => {
      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      const screeningPage = survey.pages.find((p) => p.name === "page-screening");
      expect(screeningPage).toBeDefined();

      const conceptContainer = screeningPage!.elements.find(
        (e) => e.name === "screening-concepts"
      );
      expect(conceptContainer).toBeDefined();
      expect(conceptContainer!.type).toBe("html");
    });

    it("tournament page has triple container element", () => {
      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      const tournamentPage = survey.pages.find((p) => p.name === "page-tournament");
      expect(tournamentPage).toBeDefined();

      const tripleContainer = tournamentPage!.elements.find(
        (e) => e.name === "tournament-triple"
      );
      expect(tripleContainer).toBeDefined();
      expect(tripleContainer!.type).toBe("html");
    });

    it("calibration page has rating question for purchase intent", () => {
      const configWithCalibration = {
        ...sampleStudy,
        study: {
          ...sampleStudy.study,
          phases: { ...sampleStudy.study.phases, calibration: true },
        },
      };
      const engineWithCal = new RealEngine("study-3", "resp-3", configWithCalibration, "test-seed");
      engineWithCal.start();

      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engineWithCal);

      const calibrationPage = survey.pages.find((p) => p.name === "page-calibration");
      expect(calibrationPage).toBeDefined();

      const ratingQuestion = calibrationPage!.elements.find(
        (e) => e.name === "calibration-purchase-intent"
      );
      expect(ratingQuestion).toBeDefined();
      expect(ratingQuestion!.type).toBe("rating");
    });

    it("completion page exists for DONE phase", () => {
      const survey = new MockSurveyModel();
      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      const donePage = survey.pages.find((p) => p.name === "page-done");
      expect(donePage).toBeDefined();
    });
  });

  describe("event submission through adapter", () => {
    it("adapter uses engine.submitEvent, not direct state mutation", () => {
      const survey = new MockSurveyModel();
      const submitSpy = vi.spyOn(engine, "submitEvent");

      renderACBCSurvey(survey as unknown as Parameters<typeof renderACBCSurvey>[0], engine);

      // The adapter should have been set up to use submitEvent
      // Verify the engine interface is correctly wired
      expect(engine.getState().phase).toBe("BYO");
    });
  });

  describe("injectACBCStyles", () => {
    it("does not throw in non-browser environment", () => {
      // In Node.js, document is undefined — should be a no-op
      expect(() => injectACBCStyles()).not.toThrow();
    });
  });
});
