// ACBC Engine — Manual QA CLI: robotic respondent cohort + diagnostics
//
// Usage:
//   npx tsx scripts/robotic-run.ts [--respondents N] [--seed VALUE]
//
// Loads the sample study fixture, simulates a cohort of robotic respondents
// through the full ACBC pipeline, and prints design-quality diagnostics for
// the first respondent's final state plus aggregate cohort metrics.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { StudyConfig } from "../src/core/types.js";
import { buildDesignMatrix } from "../src/estimation/matrix.js";
import { StreamingMNL } from "../src/estimation/mnl.js";
import { simulateCohort } from "../test/harness.js";
import {
  computeDEfficiency,
  duplicateRate,
  levelBalance,
  resumeSafetyCheck,
} from "../test/diagnostics.js";

interface CliArgs {
  respondents: number;
  seed: string;
}

function parseArgs(argv: string[]): CliArgs {
  let respondents = 50;
  let seed = "default-seed";
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--respondents") {
      const next = argv[i + 1];
      if (next != null) {
        respondents = Number(next);
        i++;
      }
    } else if (arg === "--seed") {
      const next = argv[i + 1];
      if (next != null) {
        seed = next;
        i++;
      }
    }
  }
  return { respondents, seed };
}

const { respondents, seed } = parseArgs(process.argv);

if (!Number.isFinite(respondents) || respondents < 1) {
  console.error(`Invalid --respondents value: ${respondents}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, "../test/fixtures/sample-study.json");
const config = JSON.parse(readFileSync(fixturePath, "utf-8")) as StudyConfig;

const report = simulateCohort(config, respondents, { seed });

if (report.runs.length === 0) {
  console.error("No respondent runs produced.");
  process.exit(1);
}

const first = report.runs[0];
const matrix = buildDesignMatrix(first.finalState, config);

const estimator = new StreamingMNL({ columns: matrix.header });
for (const row of matrix.rows) {
  estimator.update(row);
}
const mnl = estimator.estimate();

const dEfficiency = computeDEfficiency(matrix);
const dupRate = duplicateRate(first.finalState.conceptPool);
const balance = levelBalance(first.finalState.conceptPool, config);
const resumeSafe = resumeSafetyCheck(config, seed);

console.log(`Cohort: ${respondents} respondents`);
console.log(`Avg screening responses: ${report.summary.avgScreeningResponses.toFixed(2)}`);
console.log(`Avg tournament tasks: ${report.summary.avgTournamentTasks.toFixed(2)}`);
console.log(`D-efficiency: ${dEfficiency.toFixed(6)}`);
console.log(`Duplicate rate: ${dupRate.toFixed(4)}`);
console.log(`Level balance: ${JSON.stringify(balance)}`);
console.log(`Resume safety: ${resumeSafe}`);
console.log(`MNL utilities: ${JSON.stringify(mnl.utilities)}`);
