import { DONE, DROPPED, findCard, PROPOSAL_GATE, PROPOSED, readCards, RefusalError, type Card } from './cards.js';
import { advanceCard, approveCard, createCard, type AdvanceResult, type CardFields, type Role } from './engine.js';
import { loadLane, substitute, type Lane, type Stage } from './lane.js';
import { newSpec } from './spec.js';

const usesSpec = (lane: Lane) => lane.stages.some(s => `${s.output ?? ''} ${s.done?.cmd ?? ''}`.includes('{spec}') || s.done?.cmd?.includes('codeloop spec check'));

/** Creates the card and, for a lane whose stages work in a spec folder, the folder too. */
export function startCard(projectDir: string, input: { lane: string; title: string; id?: string; role?: Role; fields?: CardFields }): Card {
  const card = createCard(projectDir, input);
  if (!usesSpec(loadLane(projectDir, card.lane))) return card;
  newSpec(projectDir, card.id, input.role);
  return findCard(readCards(projectDir).cards, card.id);
}

/**
 * Approves, then advances once when the stage's check had already passed before the gate. A public
 * step is approved before its work exists and a stuck card needs a fix first, so neither is advanced.
 */
export function approveFlow(projectDir: string, ref: string, role: Role, note?: string): { card: Card; gate: string; advanced?: AdvanceResult } {
  const before = findCard(readCards(projectDir).cards, ref);
  const gate = before.gate ?? '';
  const stage = currentStage(projectDir, before);
  const card = approveCard(projectDir, before.id, role, { note });
  // A promoted proposal enters its first stage with no work done yet, so its check is not run either.
  if (gate === 'stuck' || gate === PROPOSAL_GATE || stage?.gate?.outward) return { card, gate };
  // A stage that waits for an event reaches its gate only once that event has been reported, so
  // the advance after approval carries it. Without this the approval was recorded and the advance
  // then refused, asking for an event that had already arrived.
  const event = !stage?.done?.cmd ? stage?.done?.event : undefined;
  return { card, gate, advanced: advanceCard(projectDir, card.id, { event }) };
}

function currentStage(projectDir: string, card: Card): Stage | undefined {
  return card.stage === DONE || card.stage === PROPOSED || card.stage === DROPPED ? undefined : loadLane(projectDir, card.lane).stages.find(s => s.id === card.stage);
}

/** What whoever runs the current stage needs: the skill, where output goes, the check, and prior feedback. */
export interface StageFeedback {
  /** `rejected`: this stage's own gate, after its check passed. `returned`: the next stage's entry gate, before it ran. */
  kind: 'rejected' | 'returned';
  from?: string;
  note: string;
}

export function stageBrief(projectDir: string, card: Card) {
  const stage = currentStage(projectDir, card);
  if (!stage) return null;
  const feedback: StageFeedback[] = card.events
    .filter(e => (e.action === 'reject' || e.action === 'returned') && e.stage === stage.id)
    .map(e => (e.action === 'reject' ? { kind: 'rejected', note: e.note ?? '' } : { kind: 'returned', from: /^from (\S+): /.exec(e.note ?? '')?.[1], note: (e.note ?? '').replace(/^from \S+: /, '') }));
  return {
    skill: stage.skill,
    role: stage.role,
    output: stage.output && substitute(stage.output, card),
    done: stage.done?.cmd ? substitute(stage.done.cmd, card, { shell: true }) : stage.done?.event && `event ${stage.done.event}`,
    notes: stage.notes ?? [],
    // A rejection at this stage's own gate asks for a redo; a return is a rejection at the next
    // stage's entry gate, which judged this stage's work before that stage ran.
    rejections: feedback.map(f => f.note),
    feedback,
  };
}

// Where to look when the last agent started on this stage did not finish cleanly.
function agentTrouble(card: Card, stage: Stage): string {
  const last = card.events.filter(e => e.action === 'agent-run' && e.stage === stage.id).at(-1);
  return last && last.exit !== 0 ? ` Agent ${last.agent} ${last.note ?? `exited ${last.exit}`}; its output is in ${last.log}.` : '';
}

/** One line saying what to do with the card now. `failure` is the output of a check that just failed. */
export function nextHint(projectDir: string, card: Card, failure?: string): string {
  if (card.stage === PROPOSED) return `Next: \`codeloop approve ${card.id}\` puts it in the ${card.lane} lane, or \`codeloop reject ${card.id} "<why not>"\` drops it.`;
  const stage = currentStage(projectDir, card);
  if (!stage) return 'Next: nothing left on this card. `codeloop inbox` shows what else is waiting.';
  const output = stage.output ? substitute(stage.output, card) : undefined;
  const skill = stage.skill ? `the /${stage.skill} skill` : `the ${stage.id} stage`;

  if (card.gate === 'stuck') return `Next: fix what the check reports${output ? ` in ${output}` : ''}, then \`codeloop approve ${card.id}\` to allow another try.${agentTrouble(card, stage)}`;
  if (card.gate && stage.gate?.outward) {
    return `Next: ${stage.id} is a public step and has not run. \`codeloop approve ${card.id}\` to let it run, or \`codeloop reject ${card.id} "<what to change>"\`.`;
  }
  if (card.gate) return `Next: ${output ? `read ${output}, then ` : ''}\`codeloop approve ${card.id}\`, or \`codeloop reject ${card.id} "<what to change>"\`.`;
  if (!stage.done?.cmd && stage.done?.event) return `Next: ${stage.id} waits for the event "${stage.done.event}". When it has happened: \`codeloop next ${card.id} --event ${stage.done.event}\`.`;
  if (failure !== undefined) {
    const reason = failure.split('\n').map(l => l.trim()).filter(Boolean).at(-1) ?? 'the check failed';
    return `Next: ${reason}. ${skill[0].toUpperCase()}${skill.slice(1)} produces ${output ?? 'what the check needs'}. Then \`codeloop next ${card.id}\`.${agentTrouble(card, stage)}`;
  }
  return `Next: run ${skill}${output ? ` to write ${output}` : ''}, then \`codeloop next ${card.id}\`.${agentTrouble(card, stage)}`;
}

/** Text for an advance result, the Next line last. Exit 2 when the check failed. */
export function describeAdvance(projectDir: string, result: AdvanceResult): { lines: string[]; exitCode: number } {
  const { card } = result;
  const lines: string[] = [];
  switch (result.outcome) {
    case 'moved':
      lines.push(`${card.id} moved to ${card.stage}`);
      break;
    case 'done':
      lines.push(`${card.id} done`, ...result.started.map(s => `started ${s.id} in ${s.lane} because ${result.because[s.id]}`));
      // A card finishes once, so the last such event is this finish's.
      for (const e of card.events.filter(e => e.action === 'on_done-skipped').slice(-1)) lines.push(`on_done: ${e.note}; set lanes.auto_start: true in .codeloop/config.yaml to start it`);
      break;
    case 'parked':
      lines.push(`${card.id} is waiting for you at ${card.stage} (gate ${card.gate}, ${card.awaiting} approves)`);
      break;
    case 'unchanged':
      lines.push(`${card.id} unchanged, waiting for work at ${card.stage}`);
      break;
    case 'stuck':
      lines.push(result.output ?? '', `${card.id} is stuck at ${card.stage} after ${card.retries[card.stage]} failed checks`);
      break;
    case 'failed':
      lines.push(result.output ?? '', `${card.id} failed the ${card.stage} check (${card.retries[card.stage]} so far)`);
      break;
  }
  const failed = result.outcome === 'failed' || result.outcome === 'stuck' || result.outcome === 'unchanged';
  lines.push(nextHint(projectDir, card, result.outcome === 'failed' || result.outcome === 'unchanged' ? result.output ?? '' : undefined));
  return { lines: lines.filter(Boolean), exitCode: failed ? 2 : 0 };
}

/**
 * The approval a card holds for a named gate. `authenticated` is true only when the event carries
 * an `approvalId` from a store that knows who approved; a local approval is whatever role the
 * caller claimed, so CI must not treat it as proof that a person approved.
 */
export function gateApproval(projectDir: string, ref: string, gate: string): { actor: string; at: string; authenticated: boolean } {
  const card = findCard(readCards(projectDir).cards, ref);
  const stages = loadLane(projectDir, card.lane).stages.filter(s => s.gate?.name === gate).map(s => s.id);
  if (stages.length === 0) throw new RefusalError(`lane ${card.lane} has no gate named "${gate}"`);
  const event = card.events.find(e => (e.action === 'approve' || e.action === 'auto-approve') && stages.includes(e.stage ?? ''));
  if (!event) throw new RefusalError(`card ${card.id} has no approval for gate "${gate}"`);
  return { actor: event.actor, at: event.at, authenticated: !!event.approvalId };
}
