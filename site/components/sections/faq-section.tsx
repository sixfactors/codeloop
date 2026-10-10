import { ChevronDown } from 'lucide-react';

// Copied from chanl-site/src/components/sections/faq-section.tsx. The Radix Accordion is a native
// details/summary list; next-intl, the FAQ schema and the tracked CTA are dropped.
// Answers are from docs/concepts/cloud-and-hosting, cards-and-gates, hosts and compare.
const FAQS = [
  {
    question: 'Does it replace my tickets?',
    answer:
      'No. A story is an entry in .codeloop/cards.json in your repo, and the board reads that file. import speckit and import bmad read another tool’s folders.',
  },
  {
    question: 'Does it need the cloud?',
    answer:
      'No. Everything runs from files in your repo. The local board server, a cron entry and a cloud copy on Protobox are each optional.',
  },
  {
    question: 'What does an agent run cost me?',
    answer:
      'Nothing from codeloop. A run starts your own agent command, so the cost is what that host bills. max_runs_per_day caps starts. Cost per story is not reported yet.',
  },
  {
    question: 'What if the agent is wrong?',
    answer:
      'A stage is done only when its check exits 0. A failed check keeps the story at that stage with the failure logged. An agent process cannot approve a step that needs a person.',
  },
  {
    question: 'Can I remove it?',
    answer:
      'Yes. Delete .codeloop/, specs/, usecases/ and evidence/, and the command and skill files init wrote under .claude/ (or .cursor/, .agents/). Nothing leaves your machine unless you set up the Protobox sync.',
  },
  {
    question: 'Which hosts?',
    answer: 'Claude Code, Cursor and Codex, and any MCP client through codeloop mcp.',
  },
];

export function FaqSection() {
  return (
    <section className="section-padding container">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-8 text-center text-3xl font-medium tracking-tight md:text-4xl">Questions</h2>
        <div className="divide-y divide-border border-y border-border">
          {FAQS.map((faq) => (
            <details key={faq.question} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base font-medium [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-4 leading-relaxed text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
