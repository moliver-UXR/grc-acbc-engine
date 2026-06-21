import { ScreeningResponse, Concept, CutoffRule, CutoffKind } from "../core/types.js";

export interface ExposureEntry {
  exposure: number;
  accepts: number;
  rejects: number;
}

export type ExposureTable = Record<string, Record<string, ExposureEntry>>;

export interface DetectCandidateRuleOptions {
  screened: ScreeningResponse[];
  pool: Concept[];
  confirmedRules: CutoffRule[];
  minExposure?: number;
}

export function buildExposureTable(
  screened: ScreeningResponse[],
  pool: Concept[],
): ExposureTable {
  const map = new Map(pool.map((c) => [c.id, c]));
  const ev: ExposureTable = {};

  for (const resp of screened) {
    const concept = map.get(resp.conceptId);
    if (!concept) continue;
    for (const [attrId, levelId] of Object.entries(concept.levels)) {
      if (!ev[attrId]) ev[attrId] = {};
      if (!ev[attrId][levelId]) {
        ev[attrId][levelId] = { exposure: 0, accepts: 0, rejects: 0 };
      }
      ev[attrId][levelId].exposure++;
      if (resp.possible) {
        ev[attrId][levelId].accepts++;
      } else {
        ev[attrId][levelId].rejects++;
      }
    }
  }

  return ev;
}

export function isRuleViolated(concept: Concept, rule: CutoffRule): boolean {
  if (rule.kind === "unacceptable") {
    return concept.levels[rule.attributeId] === rule.levelId;
  }
  return concept.levels[rule.attributeId] !== rule.levelId;
}

export function detectCandidateRule(
  screened: ScreeningResponse[],
  pool: Concept[],
  confirmedRules: CutoffRule[],
  minExposure = 3,
): CutoffRule | null {
  if (screened.length < minExposure) return null;

  const ev = buildExposureTable(screened, pool);

  // Prefer unacceptable detection before must-have
  for (const [attrId, levels] of Object.entries(ev)) {
    for (const [levelId, e] of Object.entries(levels)) {
      if (isAlreadyConfirmed(attrId, levelId, confirmedRules)) continue;
      if (e.exposure >= minExposure && e.rejects === e.exposure) {
        return makeRule("unacceptable", attrId, levelId, screened.length);
      }
    }
  }

  for (const [attrId, levels] of Object.entries(ev)) {
    for (const [levelId, e] of Object.entries(levels)) {
      if (isAlreadyConfirmed(attrId, levelId, confirmedRules)) continue;
      if (e.exposure >= minExposure && e.accepts === e.exposure) {
        const others = Object.entries(levels).filter(([lid]) => lid !== levelId);
        if (!others.some(([, oe]) => oe.accepts > 0)) {
          return makeRule("mustHave", attrId, levelId, screened.length);
        }
      }
    }
  }

  return null;
}

function isAlreadyConfirmed(
  attrId: string,
  levelId: string,
  confirmedRules: CutoffRule[],
): boolean {
  return confirmedRules.some(
    (r) => r.attributeId === attrId && r.levelId === levelId,
  );
}

function makeRule(
  kind: CutoffKind,
  attributeId: string,
  levelId: string,
  screenedLength: number,
): CutoffRule {
  return {
    kind,
    attributeId,
    levelId,
    confirmedAtScreen: screenedLength,
  };
}
