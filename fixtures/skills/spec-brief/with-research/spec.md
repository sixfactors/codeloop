# Spec: webhook signature verification

## Goal

Inbound webhooks are processed without checking their signature, so a forged request from
anyone who guesses the URL is indistinguishable from the real provider. Verify the signature
header before the handler runs; reject with 401 when it does not match.

## Scope

- Verify on the one webhook route that exists today.
- Reject before any side effect (no queueing, no writes) on a bad signature.
