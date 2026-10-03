const lanes = [
  {
    id: 'triage',
    trigger: 'Every day at 20:00',
    stages: 'capture → classify → dedupe → file',
    gates: 'proposals',
  },
  {
    id: 'plan',
    trigger: 'Monday 09:00, or a finished analyze card',
    stages: 'gather → research → rank → story',
    gates: 'backlog',
  },
  {
    id: 'build',
    trigger: 'codeloop start "…"',
    stages: 'research → mock → spec → build → verify → review → staging → live',
    gates: 'spec · local · pr (reviewer) · prod (public)',
  },
  {
    id: 'market',
    trigger: 'A build card finishes',
    stages: 'brief → draft → publish → measure',
    gates: 'copy · publish (public)',
  },
  {
    id: 'deploy',
    trigger: 'A git tag',
    stages: 'staging → verify → prod → smoke',
    gates: 'prod (public)',
  },
  {
    id: 'analyze',
    trigger: 'Friday 09:00',
    stages: 'pull → compare → judge → findings',
    gates: 'verdicts',
  },
  {
    id: 'learn',
    trigger: 'codeloop start "…" --lane learn',
    stages: 'capture → bump → promote',
    gates: 'rule',
  },
  {
    id: 'scan',
    trigger: 'Monday 07:00',
    stages: 'one stage: codeloop scan competitors',
    gates: 'each proposed card waits in the inbox',
  },
];

const buildLane = `id: build
version: 1
metric: { name: cycle_time_days, source: cards, target: "<5" }
trigger: { manual: true }
wip: 2
retries: 3
stages:
  - id: research
    skill: design
    output: "{spec}/research.md"
    done: { cmd: "codeloop check research {id} --min-sources 3" }
  # Optional per card: a card with nothing to draw writes \`screens: none\` in its spec and passes without a mock.
  - id: mock
    skill: design
    done: { cmd: "codeloop check mock {id}" }
    notes:
      - "Name each screen under \`screens:\` in the card's spec.md, run \`codeloop mock new <card> --topic <topic>\`, and draw one <section data-screen> per screen in the file it creates."
  - id: spec
    skill: plan
    output: "{spec}/tasks.md"
    done: { cmd: "codeloop spec check {id}" }
    gate: { name: spec, approver: owner }
  - id: build
    skill: test
    done: { cmd: "codeloop task check {id} --all-done && npm test" }
  - id: verify
    skill: qa
    output: evidence/{nnn}/verify.md
    done: { cmd: "codeloop verify {id}" }
    gate: { name: local, approver: owner }
  - id: review
    skill: commit
    output: evidence/{nnn}/review.md
    done: { cmd: "codeloop check file evidence/{nnn}/review.md --has 'verdict: approve'" }
    gate: { name: pr, approver: reviewer }
  - id: staging
    skill: deploy
    output: evidence/{nnn}/staging.md
    done: { cmd: "codeloop check file evidence/{nnn}/staging.md --has 'result: pass'" }
  - id: live
    skill: ship
    output: evidence/{nnn}/prod.md
    done: { cmd: "codeloop check file evidence/{nnn}/prod.md --has 'result: pass'" }
    gate: { name: prod, approver: owner, outward: true }
on_done: { start: market }`;

export function Loop() {
  return (
    <section id="loop" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Seven lanes and a weekly scan</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Each lane is one YAML file in <code className="font-mono text-sm">.codeloop/lanes/</code>.
            A card enters on its trigger, an agent writes each stage&apos;s output, the check
            command decides whether the stage is done, and the card waits for you at each gate.
            Public steps wait before they act. An agent can never approve.
          </p>
        </div>

        {/* Lane table */}
        <div className="mt-12 overflow-hidden rounded-xl border border-border/50 bg-surface-1">
          <div className="hidden grid-cols-[7rem_1fr_1.6fr_1fr] gap-4 border-b border-border/50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Lane</span>
            <span>Starts when</span>
            <span>Stages</span>
            <span>Where you approve</span>
          </div>
          {lanes.map((lane) => (
            <div
              key={lane.id}
              className="grid gap-2 border-b border-border/40 px-5 py-4 last:border-b-0 md:grid-cols-[7rem_1fr_1.6fr_1fr] md:gap-4"
            >
              <code className="font-mono text-sm font-medium text-accent">{lane.id}</code>
              <span className="text-sm text-muted-foreground">
                <span className="mr-2 text-xs uppercase tracking-wider text-muted-foreground/70 md:hidden">starts</span>
                {lane.trigger}
              </span>
              <span className="font-mono text-xs leading-relaxed text-foreground/90">
                {lane.stages}
              </span>
              <span className="text-sm text-muted-foreground">
                <span className="mr-2 text-xs uppercase tracking-wider text-muted-foreground/70 md:hidden">gates</span>
                {lane.gates}
              </span>
            </div>
          ))}
        </div>

        {/* The build lane file */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">The build lane, as the file it is</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Eight stages. Research needs three cited sources before the card moves. The spec
              gate shows you a mock and a task list together. Verify runs the card&apos;s use
              cases and writes evidence. Review waits for a reviewer&apos;s approval; the owner cannot pass that gate. The live
              stage is marked <code className="font-mono text-xs">outward</code>, so the card
              stops when it enters that stage, before anything is released.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A check that fails leaves the card where it is. After three failures the card is
              marked stuck, with the command output attached, and waits for you. When the card
              finishes, a market card starts on its own.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Lanes change through proposals: <code className="font-mono text-xs">codeloop lane propose</code>,
              then <code className="font-mono text-xs">eval</code>, then{' '}
              <code className="font-mono text-xs">promote</code>, which only the owner can run.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/50 bg-surface-1">
            <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
              <span className="font-mono text-xs text-muted-foreground">.codeloop/lanes/build.yaml</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[11px] leading-5 text-foreground/90 sm:text-xs">
              <code>{buildLane}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
