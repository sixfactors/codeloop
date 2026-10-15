import type { Command } from 'commander';

/**
 * Top-level command name (or alias) -> the module that defines it and the export to add. A command
 * module pulls in its whole dependency tree (hub and serve reach the Next server), and every
 * invocation paid for all 47: ~100 MB and 140 ms for `--version`. Hooks run `guard` on every tool
 * call, so the CLI loads only the one command named on the command line. `--help`, no command, and
 * a name not listed here take the full program in program.ts.
 */
export const COMMANDS: Record<string, [load: () => Promise<Record<string, unknown>>, exportName: string]> = {
  init: [() => import('./commands/init.js'), 'initCommand'],
  update: [() => import('./commands/update.js'), 'updateCommand'],
  status: [() => import('./commands/status.js'), 'statusCommand'],
  off: [() => import('./commands/off.js'), 'offCommand'],
  on: [() => import('./commands/off.js'), 'onCommand'],
  serve: [() => import('./commands/serve.js'), 'serveCommand'],
  open: [() => import('./commands/open.js'), 'openCommand'],
  hub: [() => import('./commands/hub.js'), 'hubCommand'],
  projects: [() => import('./commands/projects.js'), 'projectsCommand'],
  store: [() => import('./commands/store.js'), 'storeCommand'],
  watch: [() => import('./commands/watch.js'), 'watchCommand'],
  lane: [() => import('./commands/lane.js'), 'laneCommand'],
  card: [() => import('./commands/card.js'), 'cardCommand'],
  cards: [() => import('./commands/card.js'), 'cardCommand'],
  start: [() => import('./commands/card.js'), 'startCommand'],
  next: [() => import('./commands/card.js'), 'nextCommand'],
  approve: [() => import('./commands/card.js'), 'approveCommand'],
  reject: [() => import('./commands/card.js'), 'rejectCommand'],
  shape: [() => import('./commands/shape.js'), 'shapeCommand'],
  inbox: [() => import('./commands/inbox.js'), 'inboxCommand'],
  feature: [() => import('./commands/feature.js'), 'featureCommand'],
  epic: [() => import('./commands/epic.js'), 'epicCommand'],
  initiative: [() => import('./commands/initiative.js'), 'initiativeCommand'],
  ask: [() => import('./commands/ask.js'), 'askCommand'],
  answer: [() => import('./commands/ask.js'), 'answerCommand'],
  run: [() => import('./commands/run.js'), 'runCommand'],
  doctor: [() => import('./commands/run.js'), 'doctorCommand'],
  orch: [() => import('./commands/orch.js'), 'orchCommand'],
  ps: [() => import('./commands/ps.js'), 'psCommand'],
  worktree: [() => import('./commands/worktree.js'), 'worktreeCommand'],
  agent: [() => import('./commands/ps.js'), 'agentCommand'],
  brief: [() => import('./commands/brief.js'), 'briefCommand'],
  schedule: [() => import('./commands/schedule.js'), 'scheduleCommand'],
  adopt: [() => import('./commands/adopt.js'), 'adoptCommand'],
  check: [() => import('./commands/check.js'), 'checkCommand'],
  rubric: [() => import('./commands/rubric.js'), 'rubricCommand'],
  pack: [() => import('./commands/pack.js'), 'packCommand'],
  spec: [() => import('./commands/spec.js'), 'specCommand'],
  task: [() => import('./commands/spec.js'), 'taskCommand'],
  mock: [() => import('./commands/mock.js'), 'mockCommand'],
  mocks: [() => import('./commands/mock.js'), 'mocksCommand'],
  artifact: [() => import('./commands/artifact.js'), 'artifactCommand'],
  artifacts: [() => import('./commands/artifact.js'), 'artifactsCommand'],
  scan: [() => import('./commands/scan.js'), 'scanCommand'],
  import: [() => import('./commands/import.js'), 'importCommand'],
  verify: [() => import('./commands/verify.js'), 'verifyCommand'],
  health: [() => import('./commands/verify.js'), 'healthCommand'],
  stats: [() => import('./commands/verify.js'), 'statsCommand'],
  wiki: [() => import('./commands/wiki.js'), 'wikiCommand'],
  learn: [() => import('./commands/wiki.js'), 'learnCommand'],
  render: [() => import('./commands/render.js'), 'renderCommand'],
  mcp: [() => import('./commands/render.js'), 'mcpCommand'],
  gate: [() => import('./commands/render.js'), 'gateCommand'],
  config: [() => import('./commands/render.js'), 'configCommand'],
  cloud: [() => import('./commands/cloud.js'), 'cloudCommand'],
  hookd: [() => import('./commands/hookd.js'), 'hookdCommand'],
  guard: [() => import('./commands/guard-hooks.js'), 'guardCommand'],
  monitor: [() => import('./commands/guard-hooks.js'), 'monitorCommand'],
  presence: [() => import('./commands/guard-hooks.js'), 'presenceCommand'],
  whoami: [() => import('./commands/guard-hooks.js'), 'whoamiCommand'],
  install: [() => import('./commands/install.js'), 'installCommand'],
  search: [() => import('./commands/search.js'), 'searchCommand'],
  list: [() => import('./commands/list.js'), 'listCommand'],
  remove: [() => import('./commands/remove.js'), 'removeCommand'],
  publish: [() => import('./commands/publish.js'), 'publishCommand'],
  login: [() => import('./commands/login.js'), 'loginCommand'],
  skill: [() => import('./commands/skill.js'), 'skillCommand'],
};

/** The program with only the named command loaded, or undefined when the full program is needed. */
export async function lazyProgram(argv: string[]): Promise<Command | undefined> {
  const baseProgram = async () => (await import('./program-base.js')).baseProgram();
  const name = argv[2];
  if (name === '--version' || name === '-V') return baseProgram();
  const entry = name ? COMMANDS[name] : undefined;
  if (!entry) return undefined;
  const program = await baseProgram();
  const mod = (await entry[0]()) as Record<string, Command>;
  if (name === 'card' || name === 'cards') {
    // `card diff|health|selfcheck` live in verify.ts and `card activate` in guard-hooks.ts, which attach to this shared command.
    const verify = (await import('./commands/verify.js')) as unknown as Record<string, Command>;
    for (const sub of [verify.cardDiffCommand, verify.cardHealthCommand, verify.cardSelfcheckCommand]) {
      if (!mod.cardCommand.commands.some(c => c.name() === sub.name())) mod.cardCommand.addCommand(sub);
    }
    (await import('./commands/guard-hooks.js')).attachCardActivate(mod.cardCommand);
  }
  program.addCommand(mod[entry[1]]);
  return program;
}
