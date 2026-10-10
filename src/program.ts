import { Command } from 'commander';
import { createRequire } from 'node:module';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { statusCommand } from './commands/status.js';
import { serveCommand } from './commands/serve.js';
import { storeCommand } from './commands/store.js';
import { watchCommand } from './commands/watch.js';
import { installCommand } from './commands/install.js';
import { searchCommand } from './commands/search.js';
import { listCommand } from './commands/list.js';
import { removeCommand } from './commands/remove.js';
import { publishCommand } from './commands/publish.js';
import { loginCommand } from './commands/login.js';
import { laneCommand } from './commands/lane.js';
import { approveCommand, cardCommand, nextCommand, rejectCommand, startCommand } from './commands/card.js';
import { shapeCommand } from './commands/shape.js';
import { inboxCommand } from './commands/inbox.js';
import { featureCommand } from './commands/feature.js';
import { epicCommand } from './commands/epic.js';
import { initiativeCommand } from './commands/initiative.js';
import { answerCommand, askCommand } from './commands/ask.js';
import { runCommand } from './commands/run.js';
import { briefCommand } from './commands/brief.js';
import { scheduleCommand } from './commands/schedule.js';
import { adoptCommand } from './commands/adopt.js';
import { checkCommand } from './commands/check.js';
import { packCommand } from './commands/pack.js';
import { specCommand, taskCommand } from './commands/spec.js';
import { importCommand } from './commands/import.js';
import { statsCommand, verifyCommand } from './commands/verify.js';
import { learnCommand, wikiCommand } from './commands/wiki.js';
import { configCommand, gateCommand, mcpCommand, renderCommand } from './commands/render.js';
import { cloudCommand, syncBeforeCommand } from './commands/cloud.js';
import { mockCommand, mocksCommand } from './commands/mock.js';
import { artifactCommand, artifactsCommand } from './commands/artifact.js';
import { guardCommand, presenceCommand, whoamiCommand } from './commands/guard-hooks.js';
import { scanCommand } from './commands/scan.js';

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('codeloop')
    .description('Self-improving development workflow for AI coding agents')
    .version((createRequire(import.meta.url)('../package.json') as { version: string }).version);

  // With the cloud connected, every command first pushes pending writes and takes what changed there.
  program.hook('preAction', (_program, action) => {
    let top = action;
    while (top.parent && top.parent !== program) top = top.parent;
    syncBeforeCommand(top.name());
  });

  // Project management
  program.addCommand(initCommand);
  program.addCommand(updateCommand);
  program.addCommand(statusCommand);
  program.addCommand(serveCommand);
  program.addCommand(storeCommand);
  program.addCommand(watchCommand);

  // Lane engine
  program.addCommand(laneCommand);
  program.addCommand(cardCommand);
  program.addCommand(startCommand);
  program.addCommand(shapeCommand);
  program.addCommand(nextCommand);
  program.addCommand(approveCommand);
  program.addCommand(rejectCommand);
  program.addCommand(inboxCommand);
  program.addCommand(featureCommand);
  program.addCommand(epicCommand);
  program.addCommand(initiativeCommand);
  program.addCommand(askCommand);
  program.addCommand(answerCommand);
  program.addCommand(runCommand);
  program.addCommand(briefCommand);
  program.addCommand(scheduleCommand);
  program.addCommand(adoptCommand);
  program.addCommand(checkCommand);
  program.addCommand(packCommand);
  program.addCommand(specCommand);
  program.addCommand(mockCommand);
  program.addCommand(mocksCommand);
  program.addCommand(artifactCommand);
  program.addCommand(artifactsCommand);
  program.addCommand(scanCommand);
  program.addCommand(taskCommand);
  program.addCommand(importCommand);
  program.addCommand(verifyCommand);
  program.addCommand(statsCommand);
  program.addCommand(wikiCommand);
  program.addCommand(learnCommand);
  program.addCommand(renderCommand);
  program.addCommand(mcpCommand);
  program.addCommand(gateCommand);
  program.addCommand(configCommand);
  program.addCommand(cloudCommand);
  program.addCommand(guardCommand);
  program.addCommand(presenceCommand);
  program.addCommand(whoamiCommand);

  // Skill registry
  program.addCommand(installCommand);
  program.addCommand(searchCommand);
  program.addCommand(listCommand);
  program.addCommand(removeCommand);
  program.addCommand(publishCommand);
  program.addCommand(loginCommand);

  return program;
}
