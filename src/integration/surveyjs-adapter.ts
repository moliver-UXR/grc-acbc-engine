// ACBC Engine — SurveyJS Rendering Adapter
//
// Consumes EngineState snapshots and emits EngineEvent payloads.
// SurveyJS is an optional peer dependency (loaded via CDN or dev dep).
// The adapter never mutates EngineState directly — all changes flow through engine.submitEvent().

import type {
  EngineState,
  StudyConfig,
  Concept,
  CutoffRule,
  ScreeningResponse,
  TournamentTask,
  CalibrationAnswer,
  Phase,
  Attribute,
} from "../core/types.js";
import type {
  EngineEvent,
  BYOSubmittedEvent,
  ScreenSubmittedEvent,
  TournamentTaskSubmittedEvent,
  CalibrationSubmittedEvent,
} from "../core/events.js";

// ---------------------------------------------------------------------------
// SurveyJS type declarations (optional peer — loaded via CDN or dev dep)
// ---------------------------------------------------------------------------

/** Minimal SurveyJS types the adapter needs. In practice these come from the `survey-core` package. */
declare namespace SurveyJS {
  interface Model {
    pages: Page[];
    addPage(page: Page): Page;
    getPageByName(name: string): Page | undefined;
    currentPage: Page;
    currentPageNo: number;
    visiblePages: Page[];
    getQuestionByName(name: string): Question | undefined;
    getAllQuestions(): Question[];
    setValue(name: string, value: unknown): void;
    getValue(name: string): unknown;
    data: Record<string, unknown>;
    onComplete: Event<() => void>;
    onCurrentPageChanged: Event<(sender: Model, options: { oldCurrentPage: Page; newCurrentPage: Page; isNewPage: boolean; isGoingForward: boolean; allow: boolean }) => void>;
    onValueChanged: Event<(sender: Model, options: { name: string; value: unknown; oldValue: unknown }) => void>;
    dispose(): void;
    fromJSON(json: Record<string, unknown>): void;
    toJSON(): Record<string, unknown>;
    runTriggers(): void;
    mergeData(values: Record<string, unknown>): void;
  }

  interface Page {
    name: string;
    title: string;
    visible: boolean;
    visibleIf: string;
    elements: Question[];
    addElement(element: Question): void;
    getQuestionByName(name: string): Question | undefined;
  }

  interface Question {
    name: string;
    type: string;
    title: string;
    visible: boolean;
    visibleIf?: string;
    isRequired?: boolean;
    choices?: Choice[];
    columns?: Column[];
    rows?: Row[];
    rateMin?: number;
    rateMax?: number;
    rateStep?: number;
    minRateDescription?: string;
    maxRateDescription?: string;
    html?: string;
    templateElements?: Question[];
    panelCount?: number;
    templateTitle?: string;
    cellType?: string;
    columns_layout?: string[];
  }

  interface Choice {
    value: string;
    text: string;
  }

  interface Column {
    name: string;
    title: string;
  }

  interface Row {
    value: string;
    text: string;
  }

  interface Event<T> {
    add(func: T): void;
    remove(func: T): void;
    fire(sender: unknown, options: unknown): void;
  }

  // Custom widget registration
  interface CustomWidget {
    name: string;
    title: string;
    widgetIsFit: (question: Question) => boolean;
    isFit: (question: Question) => boolean;
    activatedByChanged: (activatedBy: string) => void;
    render: (question: Question, el: HTMLElement) => void;
    afterRender: (question: Question, el: HTMLElement) => void;
    willUnmount?: (question: Question, el: HTMLElement) => void;
  }

  interface CustomWidgetCollection {
    add(widget: CustomWidget): void;
    getCustomWidgetByName(name: string): CustomWidget | undefined;
    clear(): void;
  }

  // Component registration (SurveyJS v1.9+)
  interface ComponentCollection {
    add(options: {
      name: string;
      title?: string;
      elementsJSON?: Record<string, unknown>[];
      createElements?: (panel: unknown) => void;
      onInit?(): void;
      onCreated?(question: Question): void;
      onLoaded?(question: Question): void;
      onAfterRender?(question: Question, htmlElement: HTMLElement): void;
      onPropertyChanged?(question: Question, propertyName: string, newValue: unknown, oldValue: unknown): void;
      onValueChanged?(question: Question, name: string, value: unknown): void;
      getPropertyValue?(question: Question, name: string): unknown;
      setPropertyValue?(question: Question, name: string, value: unknown): void;
    }): void;
  }

  interface SurveyStatic {
    Model: new (json?: Record<string, unknown>) => Model;
    ComponentCollection: ComponentCollection;
    CustomWidgetCollection: CustomWidgetCollection;
    Serializer: {
      addProperty(className: string, propertyInfo: { name: string; type?: string; default?: unknown }): void;
    };
  }
}

// ---------------------------------------------------------------------------
// Engine interface — what the adapter expects from the ACBC engine
// ---------------------------------------------------------------------------

/**
 * The engine interface the adapter depends on.
 * Implement this on your engine instance or wrap your engine to match.
 */
export interface ACBCEngine {
  /** Get the current engine state snapshot */
  getState(): EngineState;
  /** Submit an event and receive the new state */
  submitEvent(event: EngineEvent): EngineState;
  /** Get the study configuration */
  getConfig(): StudyConfig;
}

// ---------------------------------------------------------------------------
// Adapter options
// ---------------------------------------------------------------------------

export interface AdapterOptions {
  /** SurveyJS Survey static (from `survey-core` or global `Survey`). If omitted, uses global `window.Survey`. */
  Survey?: SurveyJS.SurveyStatic;
  /** Custom CSS class prefix for ACBC-rendered elements */
  cssPrefix?: string;
  /** Likert scale range for calibration (default: 1-7) */
  likertMin?: number;
  likertMax?: number;
  /** Number of screening concepts per screen (default: from config or 4) */
  conceptsPerScreen?: number;
  /** Likert labels (default: ["Definitely would not buy", ..., "Definitely would buy"]) */
  likertLabels?: string[];
}

// ---------------------------------------------------------------------------
// Internal adapter state
// ---------------------------------------------------------------------------

interface AdapterState {
  survey: SurveyJS.Model;
  engine: ACBCEngine;
  options: Required<AdapterOptions>;
  onStateChange: ((state: EngineState) => void) | null;
}

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

const DEFAULT_LIKERT_LABELS = [
  "Definitely would not buy",
  "Probably would not buy",
  "Might or might not buy",
  "Probably would buy",
  "Definitely would buy",
];

const DEFAULT_CSS_PREFIX = "acbc";

const DEFAULT_CONCEPTS_PER_SCREEN = 4;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create and render a complete ACBC survey in a SurveyJS model.
 *
 * @param survey - A SurveyJS Model instance (new or existing)
 * @param engine - An ACBCEngine implementation
 * @param options - Optional configuration
 * @returns The configured SurveyJS Model, ready to display
 */
export function renderACBCSurvey(
  survey: SurveyJS.Model,
  engine: ACBCEngine,
  options: AdapterOptions = {}
): SurveyJS.Model {
  const resolvedOptions: Required<AdapterOptions> = {
    Survey: options.Survey ?? (typeof window !== "undefined" ? (window as unknown as { Survey: SurveyJS.SurveyStatic }).Survey : undefined as unknown as SurveyJS.SurveyStatic),
    cssPrefix: options.cssPrefix ?? DEFAULT_CSS_PREFIX,
    likertMin: options.likertMin ?? 1,
    likertMax: options.likertMax ?? 7,
    conceptsPerScreen: options.conceptsPerScreen ?? DEFAULT_CONCEPTS_PER_SCREEN,
    likertLabels: options.likertLabels ?? DEFAULT_LIKERT_LABELS,
  };

  const adapter: AdapterState = {
    survey,
    engine,
    options: resolvedOptions,
    onStateChange: null,
  };

  // Build survey pages based on current engine state
  buildSurveyPages(adapter);

  // Register state change listener for reactive updates
  setupStateChangeListener(adapter);

  return survey;
}

/**
 * Register a callback that fires whenever the engine state changes.
 * Useful for updating UI outside of SurveyJS (progress bars, custom headers, etc.)
 */
export function onStateChange(
  survey: SurveyJS.Model,
  callback: (state: EngineState) => void
): void {
  // Store callback on the survey's custom properties
  (survey as unknown as Record<string, unknown>).__acbc_onStateChange = callback;
}

// ---------------------------------------------------------------------------
// Page building
// ---------------------------------------------------------------------------

function buildSurveyPages(adapter: AdapterState): void {
  const { survey, engine, options } = adapter;
  const state = engine.getState();
  const config = engine.getConfig();
  const { cssPrefix } = options;

  // Clear existing pages
  while (survey.pages.length > 0) {
    survey.pages.pop();
  }

  // Build pages based on which phases are enabled
  if (config.study.phases.byo) {
    buildBYOPage(adapter);
  }

  if (config.study.phases.screening) {
    buildScreeningPage(adapter);
  }

  // Confirmation pages (must-have / unacceptable)
  if (config.study.phases.must_have) {
    buildConfirmationPage(adapter, "mustHave");
  }
  if (config.study.phases.unacceptable) {
    buildConfirmationPage(adapter, "unacceptable");
  }

  if (config.study.phases.tournament) {
    buildTournamentPage(adapter);
  }

  if (config.study.phases.calibration) {
    buildCalibrationPage(adapter);
  }

  // Completion page
  buildCompletionPage(adapter);

  // Set visibility based on current phase
  updatePageVisibility(adapter, state);

  // Navigate to the correct page for the current phase
  navigateToCurrentPhase(adapter, state);
}

// ---------------------------------------------------------------------------
// BYO Page — attribute selectors for the ideal concept
// ---------------------------------------------------------------------------

function buildBYOPage(adapter: AdapterState): void {
  const { survey, engine, options } = adapter;
  const config = engine.getConfig();
  const { cssPrefix } = options;

  const byoAttributes = config.study.attributes.filter((a) => a.in_byo);

  const page = survey.addPage({
    name: "page-byo",
    title: "Build Your Ideal Product",
    elements: [
      {
        type: "html",
        name: "byo-instructions",
        html: `<div class="${cssPrefix}-instructions">
          <p>Select your preferred option for each attribute below to create your ideal product configuration.</p>
        </div>`,
      },
      ...byoAttributes.map((attr) => ({
        type: "dropdown",
        name: `byo-${attr.id}`,
        title: attr.label,
        isRequired: true,
        choices: attr.levels.map((level) => ({
          value: level.id,
          text: level.label,
        })),
      })),
      {
        type: "html",
        name: "byo-price-preview",
        html: `<div class="${cssPrefix}-price-preview" id="${cssPrefix}-price-preview"></div>`,
      },
    ],
  } as unknown as SurveyJS.Page) as unknown as SurveyJS.Page;

  // Set visibility condition
  (page as unknown as Record<string, string>).visibleIf = "{__acbc_phase} = 'BYO'";
}

// ---------------------------------------------------------------------------
// Screening Page — concept cards with Possible / Not Possible
// ---------------------------------------------------------------------------

function buildScreeningPage(adapter: AdapterState): void {
  const { survey, engine, options } = adapter;
  const config = engine.getConfig();
  const { cssPrefix } = options;

  const page = survey.addPage({
    name: "page-screening",
    title: "Which of these products could you see yourself buying?",
    elements: [
      {
        type: "html",
        name: "screening-instructions",
        html: `<div class="${cssPrefix}-instructions">
          <p>Review each product concept below. For each one, indicate whether it is something you could possibly purchase.</p>
        </div>`,
      },
      {
        type: "html",
        name: "screening-concepts",
        html: `<div class="${cssPrefix}-screening-container" id="${cssPrefix}-screening-container"></div>`,
      },
      {
        type: "html",
        name: "screening-progress",
        html: `<div class="${cssPrefix}-progress" id="${cssPrefix}-screening-progress"></div>`,
      },
    ],
  } as unknown as SurveyJS.Page) as unknown as SurveyJS.Page;

  (page as unknown as Record<string, string>).visibleIf = "{__acbc_phase} = 'SCREENING'";
}

// ---------------------------------------------------------------------------
// Confirmation Page — must-have / unacceptable rule confirmation
// ---------------------------------------------------------------------------

function buildConfirmationPage(
  adapter: AdapterState,
  kind: "mustHave" | "unacceptable"
): void {
  const { survey, options } = adapter;
  const { cssPrefix } = options;

  const pageName = kind === "mustHave" ? "page-confirm-must-have" : "page-confirm-unacceptable";
  const title = kind === "mustHave"
    ? "Confirm Required Attribute"
    : "Confirm Unacceptable Attribute";

  const page = survey.addPage({
    name: pageName,
    title,
    elements: [
      {
        type: "html",
        name: `${pageName}-message`,
        html: `<div class="${cssPrefix}-confirmation" id="${cssPrefix}-confirmation-${kind}"></div>`,
      },
      {
        type: "radiogroup",
        name: `${pageName}-decision`,
        title: "Does this accurately reflect your preferences?",
        isRequired: true,
        choices: [
          { value: "confirm", text: "Yes, this is correct" },
          { value: "reject", text: "No, let me reconsider" },
        ],
      },
    ],
  } as unknown as SurveyJS.Page) as unknown as SurveyJS.Page;

  const phaseValue = kind === "mustHave" ? "CONFIRM_MUST_HAVE" : "CONFIRM_UNACCEPTABLE";
  (page as unknown as Record<string, string>).visibleIf = `{__acbc_phase} = '${phaseValue}'`;
}

// ---------------------------------------------------------------------------
// Tournament Page — triple elimination with grayed shared attributes
// ---------------------------------------------------------------------------

function buildTournamentPage(adapter: AdapterState): void {
  const { survey, options } = adapter;
  const { cssPrefix } = options;

  const page = survey.addPage({
    name: "page-tournament",
    title: "Choose Your Preferred Product",
    elements: [
      {
        type: "html",
        name: "tournament-instructions",
        html: `<div class="${cssPrefix}-instructions">
          <p>Compare the product concepts below. Attributes shown in gray are the same across all options — focus on the differences.</p>
        </div>`,
      },
      {
        type: "html",
        name: "tournament-triple",
        html: `<div class="${cssPrefix}-tournament-container" id="${cssPrefix}-tournament-container"></div>`,
      },
      {
        type: "html",
        name: "tournament-progress",
        html: `<div class="${cssPrefix}-progress" id="${cssPrefix}-tournament-progress"></div>`,
      },
    ],
  } as unknown as SurveyJS.Page) as unknown as SurveyJS.Page;

  (page as unknown as Record<string, string>).visibleIf = "{__acbc_phase} = 'TOURNAMENT'";
}

// ---------------------------------------------------------------------------
// Calibration Page — Likert scale purchase intent
// ---------------------------------------------------------------------------

function buildCalibrationPage(adapter: AdapterState): void {
  const { survey, engine, options } = adapter;
  const { cssPrefix, likertMin, likertMax, likertLabels } = options;
  const state = engine.getState();

  // Get the tournament winner concept for calibration
  const winnerConcept = getTournamentWinnerConcept(state);

  const page = survey.addPage({
    name: "page-calibration",
    title: "Final Question",
    elements: [
      {
        type: "html",
        name: "calibration-instructions",
        html: `<div class="${cssPrefix}-instructions">
          <p>Based on your previous choices, here is the product that best matches your preferences.</p>
          <div class="${cssPrefix}-calibration-concept" id="${cssPrefix}-calibration-concept"></div>
          <p>How likely are you to purchase this product at the price shown?</p>
        </div>`,
      },
      {
        type: "rating",
        name: "calibration-purchase-intent",
        title: "Purchase likelihood",
        isRequired: true,
        rateMin: likertMin,
        rateMax: likertMax,
        rateStep: 1,
        minRateDescription: likertLabels[0] ?? "Very unlikely",
        maxRateDescription: likertLabels[likertLabels.length - 1] ?? "Very likely",
      },
    ],
  } as unknown as SurveyJS.Page) as unknown as SurveyJS.Page;

  (page as unknown as Record<string, string>).visibleIf = "{__acbc_phase} = 'CALIBRATION'";
}

// ---------------------------------------------------------------------------
// Completion Page
// ---------------------------------------------------------------------------

function buildCompletionPage(adapter: AdapterState): void {
  const { survey, options } = adapter;
  const { cssPrefix } = options;

  const page = survey.addPage({
    name: "page-done",
    title: "Survey Complete",
    elements: [
      {
        type: "html",
        name: "completion-message",
        html: `<div class="${cssPrefix}-completion">
          <p>Thank you for completing this survey. Your responses have been recorded.</p>
        </div>`,
      },
    ],
  } as unknown as SurveyJS.Page) as unknown as SurveyJS.Page;

  (page as unknown as Record<string, string>).visibleIf = "{__acbc_phase} = 'DONE'";
}

// ---------------------------------------------------------------------------
// Phase navigation and visibility
// ---------------------------------------------------------------------------

function updatePageVisibility(adapter: AdapterState, state: EngineState): void {
  const { survey } = adapter;
  const phaseMarker = mapPhaseToMarker(state.phase);

  // Set the internal phase marker value
  survey.setValue("__acbc_phase", phaseMarker);
}

function navigateToCurrentPhase(adapter: AdapterState, state: EngineState): void {
  const { survey } = adapter;
  const pages = survey.visiblePages;

  const targetPageName = mapPhaseToPageName(state.phase);
  const targetIndex = pages.findIndex((p) => p.name === targetPageName);

  if (targetIndex >= 0) {
    survey.currentPageNo = targetIndex;
  }
}

function mapPhaseToMarker(phase: Phase): string {
  return phase;
}

function mapPhaseToPageName(phase: Phase): string {
  switch (phase) {
    case "BYO":
      return "page-byo";
    case "SCREENING":
      return "page-screening";
    case "CONFIRM_MUST_HAVE":
      return "page-confirm-must-have";
    case "CONFIRM_UNACCEPTABLE":
      return "page-confirm-unacceptable";
    case "REGENERATE":
      return "page-screening"; // Re-show screening after regeneration
    case "TOURNAMENT":
      return "page-tournament";
    case "CALIBRATION":
      return "page-calibration";
    case "DONE":
      return "page-done";
    default:
      return "page-done";
  }
}

// ---------------------------------------------------------------------------
// State change listener — reactive rendering
// ---------------------------------------------------------------------------

function setupStateChangeListener(adapter: AdapterState): void {
  const { survey, engine } = adapter;

  // Listen for page changes to trigger event submission
  survey.onCurrentPageChanged.add((_, options) => {
    handlePageChange(adapter, options);
  });

  // Listen for value changes (BYO selections, calibration, confirmation decisions)
  survey.onValueChanged.add((_, options) => {
    handleValueChange(adapter, options);
  });

  // Initial render of dynamic content
  renderDynamicContent(adapter);
}

function handlePageChange(
  adapter: AdapterState,
  options: { oldCurrentPage: SurveyJS.Page; newCurrentPage: SurveyJS.Page; isNewPage: boolean; isGoingForward: boolean; allow: boolean }
): void {
  const { survey, engine } = adapter;
  const state = engine.getState();
  const newPage = options.newCurrentPage;

  // When navigating to BYO page and user clicks "Next", submit BYO event
  if (newPage.name === "page-screening" && state.phase === "BYO") {
    submitBYOEvent(adapter);
  }

  // When navigating away from screening, submit screening responses
  if (
    (newPage.name === "page-confirm-must-have" ||
      newPage.name === "page-confirm-unacceptable" ||
      newPage.name === "page-tournament" ||
      newPage.name === "page-done") &&
    state.phase === "SCREENING"
  ) {
    submitScreeningEvent(adapter);
  }

  // When navigating away from confirmation, submit rule decision
  if (
    (newPage.name === "page-screening" || newPage.name === "page-tournament") &&
    (state.phase === "CONFIRM_MUST_HAVE" || state.phase === "CONFIRM_UNACCEPTABLE")
  ) {
    submitRuleDecisionEvent(adapter);
  }

  // When navigating away from tournament, submit tournament choice
  if (
    newPage.name === "page-calibration" || newPage.name === "page-done" &&
    state.phase === "TOURNAMENT"
  ) {
    submitTournamentEvent(adapter);
  }

  // When navigating away from calibration, submit calibration
  if (newPage.name === "page-done" && state.phase === "CALIBRATION") {
    submitCalibrationEvent(adapter);
  }

  // Re-render dynamic content for the new page
  renderDynamicContent(adapter);
}

function handleValueChange(
  adapter: AdapterState,
  options: { name: string; value: unknown; oldValue: unknown }
): void {
  const { survey, engine } = adapter;
  const state = engine.getState();

  // Handle confirmation decision immediately
  if (options.name === "page-confirm-must-have-decision" || options.name === "page-confirm-unacceptable-decision") {
    // Decision will be submitted on page navigation
  }

  // Handle calibration immediately
  if (options.name === "calibration-purchase-intent" && state.phase === "CALIBRATION") {
    // Will be submitted on page navigation to DONE
  }
}

// ---------------------------------------------------------------------------
// Event submission helpers
// ---------------------------------------------------------------------------

function submitBYOEvent(adapter: AdapterState): void {
  const { survey, engine } = adapter;
  const config = engine.getConfig();
  const byoAttributes = config.study.attributes.filter((a) => a.in_byo);

  const answers: Record<string, string> = {};
  for (const attr of byoAttributes) {
    const value = survey.getValue(`byo-${attr.id}`);
    if (typeof value === "string") {
      answers[attr.id] = value;
    }
  }

  // Validate all attributes selected
  if (Object.keys(answers).length < byoAttributes.length) {
    return; // Incomplete — don't submit
  }

  const event: BYOSubmittedEvent = {
    type: "BYO_SUBMITTED",
    answers,
  };

  const newState = engine.submitEvent(event);
  afterStateChange(adapter, newState);
}

function submitScreeningEvent(adapter: AdapterState): void {
  const { survey, engine } = adapter;
  const state = engine.getState();

  // Collect screening responses from the DOM or survey data
  const responses: ScreeningResponse[] = [];
  const currentBatch = getCurrentScreeningBatch(state);

  for (const concept of currentBatch) {
    const value = survey.getValue(`screen-${concept.id}`);
    if (value !== undefined && value !== null) {
      responses.push({
        conceptId: concept.id,
        possible: value === "possible",
        screenIndex: state.screened.length + responses.length,
      });
    }
  }

  if (responses.length === 0) return;

  const event: ScreenSubmittedEvent = {
    type: "SCREEN_SUBMITTED",
    responses,
  };

  const newState = engine.submitEvent(event);
  afterStateChange(adapter, newState);
}

function submitRuleDecisionEvent(adapter: AdapterState): void {
  const { survey, engine } = adapter;
  const state = engine.getState();

  const decisionKey =
    state.phase === "CONFIRM_MUST_HAVE"
      ? "page-confirm-must-have-decision"
      : "page-confirm-unacceptable-decision";

  const decision = survey.getValue(decisionKey);

  if (decision === "confirm") {
    const newState = engine.submitEvent({ type: "RULE_CONFIRMED" });
    afterStateChange(adapter, newState);
  } else if (decision === "reject") {
    const newState = engine.submitEvent({ type: "RULE_REJECTED" });
    afterStateChange(adapter, newState);
  }
}

function submitTournamentEvent(adapter: AdapterState): void {
  const { survey, engine } = adapter;
  const state = engine.getState();

  const currentRound = state.tournamentRounds[state.currentTournamentRound];
  if (!currentRound) return;

  const currentTask = currentRound.tasks[state.currentTournamentTask];
  if (!currentTask) return;

  const selectedConceptId = survey.getValue("tournament-selection") as string | null;

  const event: TournamentTaskSubmittedEvent = {
    type: "TOURNAMENT_TASK_SUBMITTED",
    matchupId: `r${state.currentTournamentRound}-t${state.currentTournamentTask}`,
    chosenConceptId: selectedConceptId ?? null,
  };

  const newState = engine.submitEvent(event);
  afterStateChange(adapter, newState);
}

function submitCalibrationEvent(adapter: AdapterState): void {
  const { survey, engine } = adapter;
  const state = engine.getState();

  const purchaseIntent = survey.getValue("calibration-purchase-intent") as number;
  if (purchaseIntent === undefined || purchaseIntent === null) return;

  const winnerConcept = getTournamentWinnerConcept(state);
  if (!winnerConcept) return;

  const answer: CalibrationAnswer = {
    conceptId: winnerConcept.id,
    purchaseIntent,
  };

  const event: CalibrationSubmittedEvent = {
    type: "CALIBRATION_SUBMITTED",
    answer,
  };

  const newState = engine.submitEvent(event);
  afterStateChange(adapter, newState);
}

// ---------------------------------------------------------------------------
// Post-state-change handling
// ---------------------------------------------------------------------------

function afterStateChange(adapter: AdapterState, newState: EngineState): void {
  const { survey, engine } = adapter;

  // Update the phase marker
  survey.setValue("__acbc_phase", mapPhaseToMarker(newState.phase));

  // Rebuild pages if phase changed
  const oldPhase = (survey as unknown as Record<string, string>).__acbc_lastPhase;
  if (oldPhase !== newState.phase) {
    buildSurveyPages(adapter);
  }
  (survey as unknown as Record<string, string>).__acbc_lastPhase = newState.phase;

  // Re-render dynamic content
  renderDynamicContent(adapter);

  // Notify external listeners
  const callback = (survey as unknown as Record<string, (s: EngineState) => void>).__acbc_onStateChange;
  if (callback) {
    callback(newState);
  }
}

// ---------------------------------------------------------------------------
// Dynamic content rendering
// ---------------------------------------------------------------------------

function renderDynamicContent(adapter: AdapterState): void {
  const { engine, options } = adapter;
  const state = engine.getState();
  const { cssPrefix } = options;

  // Use requestAnimationFrame to ensure DOM is ready
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(() => {
      renderPhaseContent(adapter, state);
    });
  } else {
    setTimeout(() => renderPhaseContent(adapter, state), 0);
  }
}

function renderPhaseContent(adapter: AdapterState, state: EngineState): void {
  const { engine, options } = adapter;
  const config = engine.getConfig();
  const { cssPrefix } = options;

  switch (state.phase) {
    case "SCREENING":
      renderScreeningConcepts(adapter, state, config);
      break;
    case "CONFIRM_MUST_HAVE":
    case "CONFIRM_UNACCEPTABLE":
      renderConfirmationMessage(adapter, state);
      break;
    case "TOURNAMENT":
      renderTournamentTriple(adapter, state, config);
      break;
    case "CALIBRATION":
      renderCalibrationConcept(adapter, state, config);
      break;
  }
}

// ---------------------------------------------------------------------------
// Screening concept cards
// ---------------------------------------------------------------------------

function renderScreeningConcepts(
  adapter: AdapterState,
  state: EngineState,
  config: StudyConfig
): void {
  const { options } = adapter;
  const { cssPrefix } = options;

  const container = document.getElementById(`${cssPrefix}-screening-container`);
  if (!container) return;

  const currentBatch = getCurrentScreeningBatch(state);
  const attributes = config.study.attributes;

  container.innerHTML = currentBatch
    .map((concept) => renderConceptCard(concept, attributes, state, cssPrefix))
    .join("");

  // Update progress
  const progressEl = document.getElementById(`${cssPrefix}-screening-progress`);
  if (progressEl) {
    const total = config.study.design.total_screening_screens * config.study.design.screens_per_concept_batch;
    const completed = state.screened.length;
    progressEl.innerHTML = `<p>Screen ${completed + 1} of ${total}</p>`;
  }
}

function renderConceptCard(
  concept: Concept,
  attributes: Attribute[],
  state: EngineState,
  cssPrefix: string
): string {
  const attributeRows = attributes
    .map((attr) => {
      const levelId = concept.levels[attr.id];
      const level = attr.levels.find((l) => l.id === levelId);
      const label = level?.label ?? "—";
      return `
        <div class="${cssPrefix}-concept-attr">
          <span class="${cssPrefix}-attr-label">${attr.label}</span>
          <span class="${cssPrefix}-attr-value">${label}</span>
        </div>
      `;
    })
    .join("");

  const priceRow = concept.price !== undefined
    ? `<div class="${cssPrefix}-concept-price"><strong>Price:</strong> $${concept.price.toFixed(2)}</div>`
    : "";

  return `
    <div class="${cssPrefix}-concept-card" data-concept-id="${concept.id}">
      <div class="${cssPrefix}-concept-header">
        <h3>Product Concept</h3>
      </div>
      <div class="${cssPrefix}-concept-body">
        ${attributeRows}
        ${priceRow}
      </div>
      <div class="${cssPrefix}-concept-actions">
        <label class="${cssPrefix}-radio-option">
          <input type="radio" name="screen-${concept.id}" value="possible" />
          <span>Possible</span>
        </label>
        <label class="${cssPrefix}-radio-option">
          <input type="radio" name="screen-${concept.id}" value="not-possible" />
          <span>Not Possible</span>
        </label>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Confirmation message
// ---------------------------------------------------------------------------

function renderConfirmationMessage(adapter: AdapterState, state: EngineState): void {
  const { engine, options } = adapter;
  const config = engine.getConfig();
  const { cssPrefix } = options;

  const rule = state.candidateRule;
  if (!rule) return;

  const attr = config.study.attributes.find((a) => a.id === rule.attributeId);
  const level = attr?.levels.find((l) => l.id === rule.levelId);

  const containerId = `${cssPrefix}-confirmation-${rule.kind}`;
  const container = document.getElementById(containerId);
  if (!container) return;

  const message =
    rule.kind === "mustHave"
      ? `Our analysis suggests that <strong>${attr?.label}</strong> must be <strong>"${level?.label}"</strong> for you. Is this correct?`
      : `Our analysis suggests that you would <strong>never</strong> accept a product where <strong>${attr?.label}</strong> is <strong>"${level?.label}"</strong>. Is this correct?`;

  container.innerHTML = `<p>${message}</p>`;
}

// ---------------------------------------------------------------------------
// Tournament triple rendering
// ---------------------------------------------------------------------------

function renderTournamentTriple(
  adapter: AdapterState,
  state: EngineState,
  config: StudyConfig
): void {
  const { options } = adapter;
  const { cssPrefix } = options;

  const container = document.getElementById(`${cssPrefix}-tournament-container`);
  if (!container) return;

  const currentRound = state.tournamentRounds[state.currentTournamentRound];
  if (!currentRound) return;

  const currentTask = currentRound.tasks[state.currentTournamentTask];
  if (!currentTask) return;

  const { concepts, grayedAttributes } = currentTask;
  const attributes = config.study.attributes;

  // Build the triple comparison table
  const headerCells = concepts
    .map(
      (_, i) =>
        `<th class="${cssPrefix}-tournament-header">Option ${i + 1}</th>`
    )
    .join("");

  const attributeRows = attributes
    .map((attr) => {
      const isGrayed = grayedAttributes.includes(attr.id);
      const cells = concepts
        .map((concept) => {
          const levelId = concept.levels[attr.id];
          const level = attr.levels.find((l) => l.id === levelId);
          const label = level?.label ?? "—";
          const className = isGrayed ? `${cssPrefix}-grayed` : "";
          return `<td class="${className}">${label}</td>`;
        })
        .join("");

      return `
        <tr>
          <th class="${cssPrefix}-attr-label">${attr.label}</th>
          ${cells}
        </tr>
      `;
    })
    .join("");

  const priceRow = concepts.some((c) => c.price !== undefined)
    ? `<tr>
        <th class="${cssPrefix}-attr-label">Price</th>
        ${concepts
          .map((c) => {
            const isGrayed = grayedAttributes.includes("price");
            const price = c.price !== undefined ? `$${c.price.toFixed(2)}` : "—";
            return `<td class="${isGrayed ? `${cssPrefix}-grayed` : ""}">${price}</td>`;
          })
          .join("")}
      </tr>`
    : "";

  const radioButtons = concepts
    .map(
      (concept, i) => `
        <label class="${cssPrefix}-tournament-option">
          <input type="radio" name="tournament-selection" value="${concept.id}" />
          <span>Choose Option ${i + 1}</span>
        </label>
      `
    )
    .join("");

  // Add "None" option
  const noneOption = `
    <label class="${cssPrefix}-tournament-option">
      <input type="radio" name="tournament-selection" value="none" />
      <span>None of these</span>
    </label>
  `;

  container.innerHTML = `
    <table class="${cssPrefix}-tournament-table">
      <thead>
        <tr>
          <th>Attribute</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>
        ${attributeRows}
        ${priceRow}
      </tbody>
    </table>
    <div class="${cssPrefix}-tournament-actions">
      ${radioButtons}
      ${noneOption}
    </div>
  `;

  // Update progress
  const progressEl = document.getElementById(`${cssPrefix}-tournament-progress`);
  if (progressEl) {
    const totalTasks = currentRound.tasks.length;
    progressEl.innerHTML = `<p>Round ${state.currentTournamentRound + 1} — Match ${state.currentTournamentTask + 1} of ${totalTasks}</p>`;
  }
}

// ---------------------------------------------------------------------------
// Calibration concept rendering
// ---------------------------------------------------------------------------

function renderCalibrationConcept(
  adapter: AdapterState,
  state: EngineState,
  config: StudyConfig
): void {
  const { options } = adapter;
  const { cssPrefix } = options;

  const container = document.getElementById(`${cssPrefix}-calibration-concept`);
  if (!container) return;

  const winnerConcept = getTournamentWinnerConcept(state);
  if (!winnerConcept) return;

  const attributes = config.study.attributes;

  const attributeRows = attributes
    .map((attr) => {
      const levelId = winnerConcept.levels[attr.id];
      const level = attr.levels.find((l) => l.id === levelId);
      const label = level?.label ?? "—";
      return `
        <div class="${cssPrefix}-concept-attr">
          <span class="${cssPrefix}-attr-label">${attr.label}</span>
          <span class="${cssPrefix}-attr-value">${label}</span>
        </div>
      `;
    })
    .join("");

  const priceRow = winnerConcept.price !== undefined
    ? `<div class="${cssPrefix}-concept-price"><strong>Price:</strong> $${winnerConcept.price.toFixed(2)}</div>`
    : "";

  container.innerHTML = `
    <div class="${cssPrefix}-concept-card">
      <div class="${cssPrefix}-concept-header">
        <h3>Your Matched Product</h3>
      </div>
      <div class="${cssPrefix}-concept-body">
        ${attributeRows}
        ${priceRow}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function getCurrentScreeningBatch(state: EngineState): Concept[] {
  // Return concepts that haven't been screened yet
  const screenedIds = new Set(state.screened.map((s) => s.conceptId));
  return state.conceptPool.filter((c) => !screenedIds.has(c.id));
}

function getTournamentWinnerConcept(state: EngineState): Concept | null {
  if (state.tournamentRounds.length === 0) return null;

  const lastRound = state.tournamentRounds[state.tournamentRounds.length - 1];
  if (lastRound.tasks.length === 0) return null;

  const lastTask = lastRound.tasks[lastRound.tasks.length - 1];
  if (!lastTask.winnerConceptId) return null;

  return state.conceptPool.find((c) => c.id === lastTask.winnerConceptId) ?? null;
}

// ---------------------------------------------------------------------------
// CSS injection helper
// ---------------------------------------------------------------------------

/**
 * Inject default ACBC styles into the document.
 * Call once when initializing the survey.
 */
export function injectACBCStyles(cssPrefix: string = DEFAULT_CSS_PREFIX): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(`${cssPrefix}-styles`)) return;

  const style = document.createElement("style");
  style.id = `${cssPrefix}-styles`;
  style.textContent = `
    .${cssPrefix}-instructions {
      padding: 1rem;
      margin-bottom: 1.5rem;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #4a90d9;
    }

    .${cssPrefix}-screening-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin: 1.5rem 0;
    }

    .${cssPrefix}-concept-card {
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: box-shadow 0.2s ease;
    }

    .${cssPrefix}-concept-card:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }

    .${cssPrefix}-concept-header {
      padding: 1rem;
      background: #4a90d9;
      color: #fff;
    }

    .${cssPrefix}-concept-header h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .${cssPrefix}-concept-body {
      padding: 1rem;
    }

    .${cssPrefix}-concept-attr {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .${cssPrefix}-concept-attr:last-child {
      border-bottom: none;
    }

    .${cssPrefix}-attr-label {
      font-weight: 500;
      color: #666;
    }

    .${cssPrefix}-attr-value {
      font-weight: 600;
      color: #333;
    }

    .${cssPrefix}-concept-price {
      padding: 0.75rem 0;
      margin-top: 0.5rem;
      border-top: 2px solid #4a90d9;
      font-size: 1.1rem;
    }

    .${cssPrefix}-concept-actions {
      padding: 1rem;
      display: flex;
      gap: 1rem;
      background: #f8f9fa;
    }

    .${cssPrefix}-radio-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: 2px solid #e0e0e0;
      transition: all 0.15s ease;
      flex: 1;
      justify-content: center;
    }

    .${cssPrefix}-radio-option:hover {
      border-color: #4a90d9;
    }

    .${cssPrefix}-radio-option input:checked + span {
      color: #4a90d9;
      font-weight: 600;
    }

    .${cssPrefix}-radio-option:has(input:checked) {
      border-color: #4a90d9;
      background: #e8f0fe;
    }

    .${cssPrefix}-tournament-table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
    }

    .${cssPrefix}-tournament-table th,
    .${cssPrefix}-tournament-table td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }

    .${cssPrefix}-tournament-table th {
      background: #f8f9fa;
      font-weight: 600;
    }

    .${cssPrefix}-tournament-table thead th {
      background: #4a90d9;
      color: #fff;
    }

    .${cssPrefix}-grayed {
      color: #999;
      font-style: italic;
    }

    .${cssPrefix}-tournament-actions {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin: 1.5rem 0;
    }

    .${cssPrefix}-tournament-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      border: 2px solid #e0e0e0;
      transition: all 0.15s ease;
    }

    .${cssPrefix}-tournament-option:hover {
      border-color: #4a90d9;
    }

    .${cssPrefix}-tournament-option:has(input:checked) {
      border-color: #4a90d9;
      background: #e8f0fe;
    }

    .${cssPrefix}-progress {
      text-align: center;
      color: #666;
      font-size: 0.9rem;
      margin-top: 1rem;
    }

    .${cssPrefix}-confirmation {
      padding: 1.5rem;
      background: #fff3cd;
      border-radius: 8px;
      border-left: 4px solid #ffc107;
      margin-bottom: 1.5rem;
    }

    .${cssPrefix}-completion {
      padding: 2rem;
      text-align: center;
      background: #d4edda;
      border-radius: 8px;
      border-left: 4px solid #28a745;
    }

    .${cssPrefix}-price-preview {
      padding: 1rem;
      margin-top: 1rem;
      background: #f0f7ff;
      border-radius: 8px;
      text-align: center;
    }
  `;

  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Re-export core types for convenience
// ---------------------------------------------------------------------------

export type {
  EngineState,
  StudyConfig,
  Concept,
  CutoffRule,
  ScreeningResponse,
  TournamentTask,
  CalibrationAnswer,
  Phase,
  Attribute,
  Level,
  DesignParams,
  EstimationConfig,
  PhaseFlags,
} from "../core/types.js";

export type {
  EngineEvent,
  BYOSubmittedEvent,
  ScreenSubmittedEvent,
  RuleConfirmedEvent,
  RuleRejectedEvent,
  TournamentTaskSubmittedEvent,
  CalibrationSubmittedEvent,
} from "../core/events.js";

export {
  createInitialState,
  reduce,
} from "../core/reducer.js";

export {
  parseConfig,
  safeParseConfig,
  ConfigError,
} from "../core/config.js";

export {
  createEventLog,
  saveEvent,
  replay,
  MemoryStorage,
  SessionStorageAdapter,
} from "../core/state.js";

export {
  createRNG,
  SeededRNG,
} from "../core/prng.js";
