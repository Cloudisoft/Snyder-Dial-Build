---
name: Snyder Dialer concurrency dialer
description: How call concurrency is enforced — shared utility, where it's called, and the slot-counting rule.
---

# Concurrency dialer pattern

## The rule
All three dialing entry points (launch, webhook end-of-call, upload) call `fillConcurrencySlots(campaignId)` — never initiate calls directly. This single function owns slot counting and prevents over-dialing.

## Where it lives
`artifacts/api-server/src/lib/dialer.ts`
- `getActiveCallCount(campaignId)` — counts leads with `status = 'calling'`
- `dialNextPendingLead(campaign, user, webhookUrl)` — two-step optimistic claim (select + update where status still 'pending'), then initiates VAPI call
- `fillConcurrencySlots(campaignId)` — fetches campaign + user, compares active count to `campaign.concurrency`, loops calling `dialNextPendingLead` until slots full or no more pending leads

## DB column
`campaigns.concurrency` (integer, NOT NULL, DEFAULT 1). Added via startup migration. UI: number input in campaign Settings tab, range 1–20.

## Entry points
| Where | How |
|---|---|
| `campaigns.ts` POST `/launch` | `fillConcurrencySlots(id)` fire-and-forget after response |
| `webhooks.ts` `call-ended` / `end-of-call-report` | `fillConcurrencySlots(updatedCall.campaignId)` after updating lead + counter |
| `leads.ts` single add + CSV upload | `dialIfSlotAvailable(campaignId)` (wrapper around `fillConcurrencySlots`) |

**Why:** Original code fired ALL pending leads at launch simultaneously regardless of any limit — with 500 leads that meant 500 simultaneous VAPI calls. Now launch fills N slots; each webhook completion triggers the next one, creating a self-sustaining queue.

**How to apply:** Any future dialing trigger must go through `fillConcurrencySlots`, never call `initiateVapiCall` directly in a route handler.
