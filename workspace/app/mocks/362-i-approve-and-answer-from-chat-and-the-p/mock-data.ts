// Mock data for c-362 I approve and answer from chat, and the page loads fast and lists every artifact.
// A story at a gate with open questions and review findings, and the Artifacts list with nested pages.

export type Open = { n: number; text: string; kind: 'interview' | 'review'; recommended?: string };
export type Waived = { n: number; text: string; by: string; at: string };
export type Page = { id: string; title: string; kind: 'system-design' | 'plan' | 'workflow' | 'mock'; topic: string; cardId: string; updated: string };

export const story = { id: 'c-412', title: 'I export every invoice in a date range as a spreadsheet', gate: 'pr', step: 'review' };

export const open: Open[] = [
  { n: 4, kind: 'interview', text: 'Should the export include voided invoices?', recommended: 'No: voided invoices stay out, and the totals row says so.' },
  { n: 5, kind: 'interview', text: 'Which date decides the range, issued or paid?', recommended: 'Issued date, the one the invoices page sorts by.' },
  { n: 6, kind: 'review', text: 'Review: the totals row rounds each line before summing, so a 1,000-line export can be off by a few cents.', recommended: 'Sum first, then round once.' },
];

export const noRecommendation: Open = { n: 7, kind: 'interview', text: 'Who receives the export when it is scheduled?' };

export const waived: Waived[] = [
  { n: 6, text: 'The totals row rounds each line before summing, so a 1,000-line export can be off by a few cents.', by: 'owner', at: '18 Oct, 09:42' },
];

export const pages: Page[] = [
  { id: 'docs/artifacts/codeloop/cloud/c-321-system-design.html', title: 'Codeloop Cloud architecture', kind: 'system-design', topic: 'cloud', cardId: 'c-321', updated: '18 Oct' },
  { id: 'docs/artifacts/codeloop/cloud/c-321-implementation-plan.html', title: 'Codeloop v2 implementation plan', kind: 'plan', topic: 'cloud', cardId: 'c-321', updated: '18 Oct' },
  { id: 'docs/artifacts/codeloop/board/c-320-system-design.html', title: 'One store behind every board read and write', kind: 'system-design', topic: 'board', cardId: 'c-320', updated: '16 Oct' },
  { id: 'docs/artifacts/codeloop/loop/c-058-workflow.html', title: 'The founder loop, stage by stage', kind: 'workflow', topic: 'loop', cardId: 'c-058', updated: '9 Oct' },
  { id: 'workspace/app/mocks/311-every-story-opens-with-what-is-needed-wh/page.tsx', title: 'Every story opens with what is needed, what is done and what I must do', kind: 'mock', topic: 'board', cardId: 'c-311', updated: '15 Oct' },
  { id: 'workspace/app/mocks/308-a-stuck-story-says-why-in-plain-words-an/page.tsx', title: 'A stuck story says why in plain words', kind: 'mock', topic: 'board', cardId: 'c-308', updated: '14 Oct' },
];
