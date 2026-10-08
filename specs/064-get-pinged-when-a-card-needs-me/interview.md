## Q1 Scope: Slack only, or a generic webhook with a Slack-shaped payload? Is replying from Slack in?
recommended: Generic webhook POST with a Slack-shaped payload; `notify.webhook` URL from env. No reply-from-Slack; approving stays on the board or CLI.
answer: Generic webhook POST with a Slack-shaped payload; `notify.webhook` URL from env. No reply-from-Slack; approving stays on the board or CLI.

## Q2 What fires a ping: every gate park only, or also interview questions (c-063) and a card exhausting its retries?
recommended: Gate park, interview question posted, and retries exhausted. Nothing else; `run` summaries stay in the inbox.
answer: Gate park, interview question posted, and retries exhausted. Nothing else; `run` summaries stay in the inbox.

## Q3 Acceptance: what proves it?
recommended: Given `notify.webhook` set, when a card parks at the spec gate, then one message lands in #all-6fs in the same `run` with card id, gate name and evidence link, and a second `run` sends nothing for the same park event.
answer: Given `notify.webhook` set, when a card parks at the spec gate, then one message lands in #all-6fs in the same `run` with card id, gate name and evidence link, and a second `run` sends nothing for the same park event.

## Q4 Riskiest assumption: the evidence link is useless from a phone when `serve` is local. What is the link?
recommended: The hosted card page when cloud sync is on; otherwise the `serve --bg` localhost URL plus a three-line evidence summary pasted into the message so it reads without the link.
answer: The hosted card page when cloud sync is on; otherwise the `serve --bg` localhost URL plus a three-line evidence summary pasted into the message so it reads without the link.

## Q5 Webhook down: retry, note on the card, or fail the run?
recommended: One retry, then an event `notify: failed` on the card; the run continues.
answer: One retry, then an event `notify: failed` on the card; the run continues.
