/**
 * Integration tests: VAPI webhook → call transcript persistence
 *
 * These tests exercise the full request path:
 *   POST /api/webhooks/vapi  (no auth required)
 *   GET  /api/campaigns/:id/calls  (auth required)
 *
 * They run against the real DATABASE_URL database. Each test creates
 * its own isolated rows (unique vapiCallId) and deletes them on teardown,
 * so they are safe to run alongside a live dev environment.
 */

import { describe, it, beforeEach, afterEach, expect } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";

import app from "../app.js";
import { db, callLogsTable, leadsTable, campaignsTable, usersTable } from "@workspace/db";
import { signToken } from "../middlewares/auth.js";

// ── helpers ────────────────────────────────────────────────────────────────

/** Build a unique vapi call ID so parallel runs never collide. */
function uniqueVapiCallId() {
  return `test-vapi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── shared fixtures ────────────────────────────────────────────────────────

interface Fixtures {
  userId: number;
  campaignId: number;
  leadId: number;
  callLogId: number;
  vapiCallId: string;
  authToken: string;
}

async function createFixtures(): Promise<Fixtures> {
  const vapiCallId = uniqueVapiCallId();

  const [user] = await db
    .insert(usersTable)
    .values({
      email: `test-webhook-${vapiCallId}@example.com`,
      passwordHash: "dummy-hash",
      name: "Webhook Test User",
    })
    .returning();

  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      userId: user.id,
      name: "Webhook Test Campaign",
      objective: "test",
      masterPrompt: "test prompt",
    })
    .returning();

  const [lead] = await db
    .insert(leadsTable)
    .values({
      campaignId: campaign.id,
      name: "Test Lead",
      phone: "+15550000001",
    })
    .returning();

  const [callLog] = await db
    .insert(callLogsTable)
    .values({
      campaignId: campaign.id,
      leadId: lead.id,
      vapiCallId,
      status: "initiated",
    })
    .returning();

  const authToken = signToken({ userId: user.id, email: user.email });

  return {
    userId: user.id,
    campaignId: campaign.id,
    leadId: lead.id,
    callLogId: callLog.id,
    vapiCallId,
    authToken,
  };
}

async function cleanupFixtures(f: Fixtures) {
  await db.delete(callLogsTable).where(eq(callLogsTable.id, f.callLogId));
  await db.delete(leadsTable).where(eq(leadsTable.id, f.leadId));
  await db.delete(campaignsTable).where(eq(campaignsTable.id, f.campaignId));
  await db.delete(usersTable).where(eq(usersTable.id, f.userId));
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/vapi — call-ended event", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await createFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures(f);
  });

  it("responds 200 OK", async () => {
    await request(app)
      .post("/api/webhooks/vapi")
      .send({
        message: {
          type: "call-ended",
          call: { id: f.vapiCallId },
          endedReason: "customer-ended-call",
          transcript: "AI: Hello!\nCustomer: Hi!",
          summary: "Customer interested.",
        },
      })
      .expect(200);
  });

  it("writes transcript to call_logs", async () => {
    const transcript = "AI: Hello!\nCustomer: Yes, tell me more.\nAI: Sure!";

    await request(app)
      .post("/api/webhooks/vapi")
      .send({
        message: {
          type: "call-ended",
          call: { id: f.vapiCallId },
          endedReason: "customer-ended-call",
          transcript,
          summary: "Lead expressed strong interest.",
        },
      });

    const [row] = await db
      .select()
      .from(callLogsTable)
      .where(eq(callLogsTable.id, f.callLogId));

    expect(row.transcript).toBe(transcript);
  });

  it("writes outcome (summary) to call_logs", async () => {
    const summary = "Lead expressed strong interest in the product.";

    await request(app)
      .post("/api/webhooks/vapi")
      .send({
        message: {
          type: "call-ended",
          call: { id: f.vapiCallId },
          endedReason: "customer-ended-call",
          transcript: "AI: Hi!\nCustomer: Great, sign me up.",
          summary,
        },
      });

    const [row] = await db
      .select()
      .from(callLogsTable)
      .where(eq(callLogsTable.id, f.callLogId));

    expect(row.outcome).toBe(summary);
  });

  it("sets status to 'completed' for a normal end reason", async () => {
    await request(app)
      .post("/api/webhooks/vapi")
      .send({
        message: {
          type: "call-ended",
          call: { id: f.vapiCallId },
          endedReason: "customer-ended-call",
          transcript: "short call",
        },
      });

    const [row] = await db
      .select()
      .from(callLogsTable)
      .where(eq(callLogsTable.id, f.callLogId));

    expect(row.status).toBe("completed");
  });

  it("sets status to 'no_answer' for a no-answer end reason", async () => {
    await request(app)
      .post("/api/webhooks/vapi")
      .send({
        message: {
          type: "call-ended",
          call: { id: f.vapiCallId },
          endedReason: "no-answer",
        },
      });

    const [row] = await db
      .select()
      .from(callLogsTable)
      .where(eq(callLogsTable.id, f.callLogId));

    expect(row.status).toBe("no_answer");
  });

  it("calculates duration from call.startedAt / call.endedAt", async () => {
    await request(app)
      .post("/api/webhooks/vapi")
      .send({
        message: {
          type: "call-ended",
          call: {
            id: f.vapiCallId,
            startedAt: "2026-07-30T10:00:00.000Z",
            endedAt: "2026-07-30T10:05:30.000Z",
          },
          endedReason: "customer-ended-call",
          transcript: "some transcript",
        },
      });

    const [row] = await db
      .select()
      .from(callLogsTable)
      .where(eq(callLogsTable.id, f.callLogId));

    expect(row.duration).toBe(330); // 5 min 30 sec
  });

  it("reconstructs transcript from messages array when transcript string absent", async () => {
    await request(app)
      .post("/api/webhooks/vapi")
      .send({
        message: {
          type: "call-ended",
          call: { id: f.vapiCallId },
          endedReason: "customer-ended-call",
          messages: [
            { role: "assistant", message: "Hello, how can I help?" },
            { role: "user", message: "Tell me more." },
          ],
        },
      });

    const [row] = await db
      .select()
      .from(callLogsTable)
      .where(eq(callLogsTable.id, f.callLogId));

    expect(row.transcript).toBe(
      "assistant: Hello, how can I help?\nuser: Tell me more."
    );
  });

  it("end-of-call-report event also writes transcript and outcome", async () => {
    const transcript = "AI: Good morning!\nCustomer: Not interested.";
    const summary = "Customer declined.";

    await request(app)
      .post("/api/webhooks/vapi")
      .send({
        message: {
          type: "end-of-call-report",
          call: { id: f.vapiCallId },
          endedReason: "customer-ended-call",
          transcript,
          summary,
        },
      });

    const [row] = await db
      .select()
      .from(callLogsTable)
      .where(eq(callLogsTable.id, f.callLogId));

    expect(row.transcript).toBe(transcript);
    expect(row.outcome).toBe(summary);
  });

  it("ignores events with no callId without error", async () => {
    // Should return 200 even when the event has no call ID
    await request(app)
      .post("/api/webhooks/vapi")
      .send({ message: { type: "call-ended" } })
      .expect(200);
  });
});

describe("GET /api/campaigns/:id/calls — includes transcript and outcome", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await createFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures(f);
  });

  it("returns transcript and outcome after webhook fires", async () => {
    const transcript = "AI: Hi!\nCustomer: Sounds good, let's proceed.";
    const outcome = "Customer agreed to a follow-up meeting.";

    // Fire the webhook first
    await request(app)
      .post("/api/webhooks/vapi")
      .send({
        message: {
          type: "call-ended",
          call: { id: f.vapiCallId },
          endedReason: "customer-ended-call",
          transcript,
          summary: outcome,
        },
      })
      .expect(200);

    // Fetch calls via authenticated API
    const res = await request(app)
      .get(`/api/campaigns/${f.campaignId}/calls`)
      .set("Authorization", `Bearer ${f.authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);

    const call = (res.body as Array<{ id: number; transcript: string | null; outcome: string | null }>).find(
      (c) => c.id === f.callLogId
    );

    expect(call).toBeDefined();
    expect(call!.transcript).toBe(transcript);
    expect(call!.outcome).toBe(outcome);
  });

  it("returns null transcript and outcome when no webhook has fired", async () => {
    // No webhook — call log remains in 'initiated' state
    const res = await request(app)
      .get(`/api/campaigns/${f.campaignId}/calls`)
      .set("Authorization", `Bearer ${f.authToken}`)
      .expect(200);

    const call = (res.body as Array<{ id: number; transcript: string | null; outcome: string | null }>).find(
      (c) => c.id === f.callLogId
    );

    expect(call).toBeDefined();
    expect(call!.transcript).toBeNull();
    expect(call!.outcome).toBeNull();
  });

  it("requires authentication — returns 401 without token", async () => {
    await request(app)
      .get(`/api/campaigns/${f.campaignId}/calls`)
      .expect(401);
  });
});
