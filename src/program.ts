import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { statusCommand } from './commands/status.js';
import { serveCommand } from './commands/serve.js';
import { openCommand } from './commands/open.js';
import { hubCommand } from './commands/hub.js';
import { projectsCommand } from './commands/projects.js';
import { storeCommand } from './commands/store.js';
import { agentCommand, psCommand } from './commands/ps.js';
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
import { orchCommand } from './commands/orch.js';
import { doctorCommand, runCommand } from './commands/run.js';
import { briefCommand } from './commands/brief.js';
import { scheduleCommand } from './commands/schedule.js';
import { adoptCommand } from './commands/adopt.js';
import { checkCommand } from './commands/check.js';
import { rubricCommand } from './commands/rubric.js';
import { packCommand } from './commands/pack.js';
import { specCommand, taskCommand } from './commands/spec.js';
import { importCommand } from './commands/import.js';
import { cardSelfcheckCommand, cardDiffCommand, cardHealthCommand, healthCommand, statsCommand, verifyCommand } from './commands/verify.js';
import { learnCommand, wikiCommand } from './commands/wiki.js';
import { configCommand, gateCommand, mcpCommand, renderCommand } from './commands/render.js';
import { cloudCommand } from './commands/cloud.js';
import { mockCommand, mocksCommand } from './commands/mock.js';
import { artifactCommand, artifactsCommand } from './commands/artifact.js';
import { attachCardActivate, guardCommand, monitorCommand, presenceCommand, whoamiCommand } from './commands/guard-hooks.js';
import { scanCommand } from './commands/scan.js';
// After the command modules: program-base reaches the card store first otherwise, and the wiki and
// features modules then meet in the opposite order (WIKI_DIR read before it is defined).
import { baseProgram } from './program-base.js';

/** Every command, eagerly loaded: for `--help`, an unknown command, and tests that walk the whole tree. */
export function buildProgram(): Command {
  const program = baseProgram();

  // Project management
  program.addCommand(initCommand);
  program.addCommand(updateCommand);
  program.addCommand(statusCommand);
  program.addCommand(serveCommand);
  program.addCommand(openCommand);
  program.addCommand(hubCommand);
  program.addCommand(projectsCommand);
  program.addCommand(storeCommand);
  program.addCommand(watchCommand);

  // Lane engine
  program.addCommand(laneCommand);
  // cardCommand is a module singleton and buildProgram runs more than once in tests, so add each once.
  for (const sub of [cardDiffCommand, cardHealthCommand, cardSelfcheckCommand]) {
    if (!cardCommand.commands.some(c => c.name() === sub.name())) cardCommand.addCommand(sub);
  }
  attachCardActivate(cardCommand);
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
  program.addCommand(doctorCommand);
  program.addCommand(orchCommand);
  program.addCommand(psCommand);
  program.addCommand(agentCommand);
  program.addCommand(briefCommand);
  program.addCommand(scheduleCommand);
  program.addCommand(adoptCommand);
  program.addCommand(checkCommand);
  program.addCommand(rubricCommand);
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
  program.addCommand(healthCommand);
  program.addCommand(statsCommand);
  program.addCommand(wikiCommand);
  program.addCommand(learnCommand);
  program.addCommand(renderCommand);
  program.addCommand(mcpCommand);
  program.addCommand(gateCommand);
  program.addCommand(configCommand);
  program.addCommand(cloudCommand);
  program.addCommand(guardCommand);
  program.addCommand(monitorCommand);
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
