/**
 * One budget per run. `orchRun`, `run --due`, the doctor tick and `cards.run` each make a `Budget`
 * from `orch.budget` in config (defaults: 12 turns, 6 agent starts, 90 minutes, 3 failures on one
 * stage) and ask it before every step. The first limit reached stops the loop, and its reason is
 * written where the run is recorded.
 */
import { loadConfig } from './config.js';

export interface BudgetLimits {
  turns: number;
  agentStarts: number;
  wallMinutes: number;
  perStageFails: number;
}

export const DEFAULT_BUDGET: BudgetLimits = { turns: 12, agentStarts: 6, wallMinutes: 90, perStageFails: 3 };

export function budgetLimits(projectDir: string): BudgetLimits {
  const orch = (loadConfig(projectDir) as { orch?: { budget?: Partial<Record<keyof BudgetLimits, unknown>> } }).orch;
  const given = orch && typeof orch === 'object' ? (orch.budget ?? {}) : {};
  const pick = (k: keyof BudgetLimits) => (typeof given[k] === 'number' && (given[k] as number) >= 0 ? (given[k] as number) : DEFAULT_BUDGET[k]);
  return { turns: pick('turns'), agentStarts: pick('agentStarts'), wallMinutes: pick('wallMinutes'), perStageFails: pick('perStageFails') };
}

export class Budget {
  readonly limits: BudgetLimits;
  private readonly startedAt: number;
  private turns = 0;
  private agentStarts = 0;
  private readonly fails = new Map<string, number>();

  constructor(limits: BudgetLimits, now: number = Date.now()) {
    this.limits = limits;
    this.startedAt = now;
  }

  static for(projectDir: string, now?: number): Budget {
    return new Budget(budgetLimits(projectDir), now);
  }

  /** Why the next step must not run, or undefined. `stage` is the `<card>:<stage>` the step is for. */
  stop(stage?: string, now: number = Date.now()): string | undefined {
    const l = this.limits;
    if (this.turns >= l.turns) return `budget: ${this.turns} turns used (orch.budget.turns is ${l.turns})`;
    if (this.agentStarts >= l.agentStarts) return `budget: ${this.agentStarts} agent starts used (orch.budget.agentStarts is ${l.agentStarts})`;
    const minutes = (now - this.startedAt) / 60_000;
    if (minutes >= l.wallMinutes) return `budget: ${Math.floor(minutes)} minutes elapsed (orch.budget.wallMinutes is ${l.wallMinutes})`;
    const fails = stage ? (this.fails.get(stage) ?? 0) : 0;
    if (stage && fails >= l.perStageFails) return `budget: ${fails} failures on ${stage} this run (orch.budget.perStageFails is ${l.perStageFails})`;
    return undefined;
  }

  turn(): void {
    this.turns++;
  }

  agentStart(): void {
    this.agentStarts++;
  }

  fail(stage: string): void {
    this.fails.set(stage, (this.fails.get(stage) ?? 0) + 1);
  }

  get used(): { turns: number; agentStarts: number } {
    return { turns: this.turns, agentStarts: this.agentStarts };
  }
}
