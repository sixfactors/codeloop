# Research: webhook signature verification

verdict: verify with a timing-safe HMAC compare, same approach as the Postmark inbound hook

- source: https://postmarkapp.com/support/article/800 — Postmark signs with HMAC-SHA256 over the raw body; compare with a constant-time function, not `===`
- source: https://stripe.com/docs/webhooks/signatures — Stripe's library rejects a signature older than 5 minutes to block replay; worth the same rule here
- source: internal decision docs/wiki/decisions/webhook-replay-window.md — this repo already fixed a 5-minute replay window for the one webhook it has; reuse it, don't re-derive it
