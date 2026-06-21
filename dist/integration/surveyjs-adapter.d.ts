import type { EngineState, StudyConfig } from "../core/types.js";
import type { EngineEvent } from "../core/events.js";
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
        onCurrentPageChanged: Event<(sender: Model, options: {
            oldCurrentPage: Page;
            newCurrentPage: Page;
            isNewPage: boolean;
            isGoingForward: boolean;
            allow: boolean;
        }) => void>;
        onValueChanged: Event<(sender: Model, options: {
            name: string;
            value: unknown;
            oldValue: unknown;
        }) => void>;
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
            addProperty(className: string, propertyInfo: {
                name: string;
                type?: string;
                default?: unknown;
            }): void;
        };
    }
}
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
/**
 * Create and render a complete ACBC survey in a SurveyJS model.
 *
 * @param survey - A SurveyJS Model instance (new or existing)
 * @param engine - An ACBCEngine implementation
 * @param options - Optional configuration
 * @returns The configured SurveyJS Model, ready to display
 */
export declare function renderACBCSurvey(survey: SurveyJS.Model, engine: ACBCEngine, options?: AdapterOptions): SurveyJS.Model;
/**
 * Register a callback that fires whenever the engine state changes.
 * Useful for updating UI outside of SurveyJS (progress bars, custom headers, etc.)
 */
export declare function onStateChange(survey: SurveyJS.Model, callback: (state: EngineState) => void): void;
/**
 * Inject default ACBC styles into the document.
 * Call once when initializing the survey.
 */
export declare function injectACBCStyles(cssPrefix?: string): void;
export type { EngineState, StudyConfig, Concept, CutoffRule, ScreeningResponse, TournamentTask, CalibrationAnswer, Phase, Attribute, Level, DesignParams, EstimationConfig, PhaseFlags, } from "../core/types.js";
export type { EngineEvent, BYOSubmittedEvent, ScreenSubmittedEvent, RuleConfirmedEvent, RuleRejectedEvent, TournamentTaskSubmittedEvent, CalibrationSubmittedEvent, } from "../core/events.js";
export { createInitialState, reduce, } from "../core/reducer.js";
export { parseConfig, safeParseConfig, ConfigError, } from "../core/config.js";
export { createEventLog, saveEvent, replay, MemoryStorage, SessionStorageAdapter, } from "../core/state.js";
export { createRNG, SeededRNG, } from "../core/prng.js";
