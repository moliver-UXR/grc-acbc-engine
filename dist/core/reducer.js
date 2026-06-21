import { SeededRNG } from "./prng.js";
export function createInitialState(studyId, respondentId, _config, seed) {
    return {
        respondentId,
        studyId,
        phase: "BYO",
        rngSeed: seed,
        byoConcept: null,
        conceptPool: [],
        screened: [],
        candidateRule: null,
        confirmedRules: [],
        survivingConceptIds: [],
        tournamentRounds: [],
        currentTournamentRound: 0,
        currentTournamentTask: 0,
        calibration: null,
        eventVersion: 1,
    };
}
function buildByoConcept(answers) {
    return { id: "byo-concept", levels: { ...answers }, source: "BYO" };
}
function generateNearNeighborPool(c0, rules, config, seed) {
    const rng = new SeededRNG(seed);
    const { T, Amin, Amax } = config.study.design;
    const concepts = [];
    const counts = {};
    for (const attr of config.study.attributes) {
        counts[attr.id] = {};
        for (const level of attr.levels)
            counts[attr.id][level.id] = 0;
    }
    let attempts = 0;
    const maxAttempts = T * 10;
    while (concepts.length < T && attempts < maxAttempts) {
        attempts++;
        const ai = rng.randInt(Amin, Amax);
        const byoAttrs = config.study.attributes.filter(a => a.in_byo);
        const shuffled = rng.shuffle(byoAttrs);
        const attrsToVary = shuffled.slice(0, Math.min(ai, shuffled.length));
        const candidate = {
            id: `concept-${concepts.length + 1}`,
            levels: { ...c0.levels },
            source: "SCREENING",
        };
        for (const attr of attrsToVary) {
            const allowed = attr.levels.filter(l => !rules.some(r => r.kind === "unacceptable" && r.attributeId === attr.id && r.levelId === l.id));
            if (allowed.length === 0)
                continue;
            const weighted = allowed.map(l => ({ level: l, weight: 1 / (counts[attr.id][l.id] + 1) }));
            const total = weighted.reduce((s, w) => s + w.weight, 0);
            let r = rng.next() * total;
            let selected = weighted[0].level;
            for (const w of weighted) {
                r -= w.weight;
                if (r <= 0) {
                    selected = w.level;
                    break;
                }
            }
            candidate.levels[attr.id] = selected.id;
        }
        const isDup = concepts.some(c => Object.keys(c.levels).every(k => c.levels[k] === candidate.levels[k]));
        if (isDup)
            continue;
        const violates = rules.some(rule => {
            if (rule.kind === "mustHave")
                return candidate.levels[rule.attributeId] !== rule.levelId;
            if (rule.kind === "unacceptable")
                return candidate.levels[rule.attributeId] === rule.levelId;
            return false;
        });
        if (violates)
            continue;
        for (const attr of config.study.attributes) {
            const lid = candidate.levels[attr.id];
            if (lid && counts[attr.id][lid] !== undefined)
                counts[attr.id][lid]++;
        }
        concepts.push(candidate);
    }
    return concepts;
}
function detectCandidateRule(screened, pool, confirmed) {
    if (screened.length < 3)
        return null;
    const map = new Map(pool.map(c => [c.id, c]));
    const ev = {};
    for (const resp of screened) {
        const concept = map.get(resp.conceptId);
        if (!concept)
            continue;
        for (const [attrId, levelId] of Object.entries(concept.levels)) {
            if (!ev[attrId])
                ev[attrId] = {};
            if (!ev[attrId][levelId])
                ev[attrId][levelId] = { exposure: 0, accepts: 0, rejects: 0 };
            ev[attrId][levelId].exposure++;
            if (resp.possible)
                ev[attrId][levelId].accepts++;
            else
                ev[attrId][levelId].rejects++;
        }
    }
    for (const [attrId, levels] of Object.entries(ev)) {
        for (const [levelId, e] of Object.entries(levels)) {
            if (confirmed.some(r => r.attributeId === attrId && r.levelId === levelId))
                continue;
            if (e.exposure >= 3 && e.rejects === e.exposure) {
                return { kind: "unacceptable", attributeId: attrId, levelId, confirmedAtScreen: Math.floor(screened.length / 4) };
            }
        }
    }
    for (const [attrId, levels] of Object.entries(ev)) {
        for (const [levelId, e] of Object.entries(levels)) {
            if (confirmed.some(r => r.attributeId === attrId && r.levelId === levelId))
                continue;
            if (e.exposure >= 3 && e.accepts === e.exposure) {
                const others = Object.entries(levels).filter(([lid]) => lid !== levelId);
                if (!others.some(([, oe]) => oe.accepts > 0)) {
                    return { kind: "mustHave", attributeId: attrId, levelId, confirmedAtScreen: Math.floor(screened.length / 4) };
                }
            }
        }
    }
    return null;
}
function screeningComplete(screened, config) {
    return screened.length >= config.study.design.total_screening_screens * config.study.design.screens_per_concept_batch;
}
function collectSurvivors(screened) {
    return screened.filter(s => s.possible).map(s => s.conceptId);
}
function makeTriples(items) {
    const triples = [];
    for (let i = 0; i < items.length; i += 3)
        triples.push(items.slice(i, i + 3));
    return triples;
}
function sharedAttributes(concepts) {
    if (concepts.length === 0)
        return [];
    const keys = Object.keys(concepts[0].levels);
    return keys.filter(k => concepts.every(c => c.levels[k] === concepts[0].levels[k]));
}
function buildTournament(survivorIds, pool, seed) {
    const rng = new SeededRNG(seed + "-tournament");
    const concepts = survivorIds.map(id => pool.find(c => c.id === id)).filter((c) => c !== null);
    const shuffled = rng.shuffle(concepts);
    const rounds = [];
    let current = makeTriples(shuffled);
    let round = 1;
    while (current.length > 0) {
        rounds.push({
            round,
            tasks: current.map(triple => ({
                concepts: triple,
                grayedAttributes: sharedAttributes(triple),
                winnerConceptId: null,
            })),
        });
        if (current.length <= 1)
            break;
        const placeholders = current.map((_, i) => ({ id: `winner-r${round}-${i}`, levels: {}, source: "TOURNAMENT" }));
        current = makeTriples(placeholders);
        round++;
    }
    return rounds;
}
function mapRuleToPhase(rule) {
    return rule.kind === "mustHave" ? "CONFIRM_MUST_HAVE" : "CONFIRM_UNACCEPTABLE";
}
export function reduce(state, event, config) {
    switch (state.phase) {
        case "BYO":
            if (event.type === "BYO_SUBMITTED" && config) {
                const byo = buildByoConcept(event.answers);
                const pool = generateNearNeighborPool(byo, state.confirmedRules, config, state.rngSeed);
                return { ...state, byoConcept: byo, conceptPool: pool, phase: "SCREENING" };
            }
            return state;
        case "SCREENING":
            if (event.type === "SCREEN_SUBMITTED") {
                const screened = [...state.screened, ...event.responses];
                const candidate = detectCandidateRule(screened, state.conceptPool, state.confirmedRules);
                if (candidate)
                    return { ...state, screened, candidateRule: candidate, phase: mapRuleToPhase(candidate) };
                if (config && screeningComplete(screened, config)) {
                    const survivors = collectSurvivors(screened);
                    const rounds = buildTournament(survivors, state.conceptPool, state.rngSeed);
                    return { ...state, screened, survivingConceptIds: survivors, tournamentRounds: rounds, phase: config.study.phases.tournament ? "TOURNAMENT" : "DONE" };
                }
                return { ...state, screened };
            }
            return state;
        case "CONFIRM_MUST_HAVE":
        case "CONFIRM_UNACCEPTABLE":
            if (event.type === "RULE_CONFIRMED") {
                if (!state.candidateRule)
                    return state;
                return { ...state, confirmedRules: [...state.confirmedRules, state.candidateRule], candidateRule: null, phase: "REGENERATE" };
            }
            if (event.type === "RULE_REJECTED")
                return { ...state, candidateRule: null, phase: "SCREENING" };
            return state;
        case "REGENERATE":
            if (config && state.byoConcept) {
                const pool = generateNearNeighborPool(state.byoConcept, state.confirmedRules, config, state.rngSeed);
                return { ...state, conceptPool: pool, phase: "SCREENING" };
            }
            return { ...state, phase: "SCREENING" };
        case "TOURNAMENT":
            if (event.type === "TOURNAMENT_TASK_SUBMITTED") {
                const rounds = state.tournamentRounds.map((r, idx) => idx !== state.currentTournamentRound ? r : {
                    ...r, tasks: r.tasks.map((t, ti) => ti !== state.currentTournamentTask ? t : { ...t, winnerConceptId: event.chosenConceptId })
                });
                const nextTask = state.currentTournamentTask + 1;
                const cur = rounds[state.currentTournamentRound];
                if (nextTask >= cur.tasks.length) {
                    const nextRound = state.currentTournamentRound + 1;
                    if (nextRound >= rounds.length) {
                        return { ...state, tournamentRounds: rounds, currentTournamentRound: nextRound, phase: config?.study.phases.calibration ? "CALIBRATION" : "DONE" };
                    }
                    return { ...state, tournamentRounds: rounds, currentTournamentRound: nextRound, currentTournamentTask: 0 };
                }
                return { ...state, tournamentRounds: rounds, currentTournamentTask: nextTask };
            }
            return state;
        case "CALIBRATION":
            if (event.type === "CALIBRATION_SUBMITTED")
                return { ...state, calibration: event.answer, phase: "DONE" };
            return state;
        case "DONE":
            return state;
        default:
            return state;
    }
}
//# sourceMappingURL=reducer.js.map