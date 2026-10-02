// One of several processes writing cards at the same time. Each attempt is a plain read then
// compare-and-swap write; a conflict is a reported failure and is not retried. Prints the ids
// whose write was reported as a success.
const [cardsModule, projectDir, name, count] = process.argv.slice(2);
const { readCards, writeCards, ConflictError } = await import(cardsModule);

const ok = [];
for (let i = 0; i < Number(count); i++) {
  const id = `${name}-${i}`;
  const at = new Date().toISOString();
  const read = readCards(projectDir);
  try {
    writeCards(projectDir, read, [...read.cards, { id, title: id, lane: 't', laneVersion: 1, stage: 's', retries: {}, evidence: [], events: [], createdAt: at, updatedAt: at }]);
    ok.push(id);
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e;
  }
}
console.log(JSON.stringify(ok));
