/**
 * VAPI webhook endpoint — receives call events and updates call_logs + lead status.
 *
 * VAPI sends POST requests to this endpoint with a JSON body containing a `message` field.
 * Relevant event types:
 *   - "call-started"   → update call log status to "in_progress", set startedAt
 *   - "call-ended"     → update call log status, duration, transcript, outcome; update lead status
 *   - "transcript"     → partial or final transcript chunks (we use the final on call-ended)
 *   - "hang"           → call was hung up
 */

import { Router, type IRouter } from "express";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db, callLogsTable, leadsTable, campaignsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Map VAPI end reasons to our call_logs status values
function vapiEndReasonToStatus(endedReason: string | undefined): string {
  if (!endedReason) return "completed";
  const r = endedReason.toLowerCase();
  if (r.includes("no-answer") || r.includes("no_answer") || r.includes("busy")) return "no_answer";
  if (r.includes("failed") || r.includes("error") || r.includes("machine")) return "failed";
  if (r.includes("voicemail")) return "voicemail";
  return "completed";
}

// Map call status to lead status
function callStatusToLeadStatus(callStatus: string): string {
  if (callStatus === "completed") return "completed";
  if (callStatus === "failed") return "failed";
  if (callStatus === "no_answer") return "failed";
  if (callStatus === "voicemail") return "completed";
  return "completed";
}

/**
 * POST /api/webhooks/vapi
 * Receives call lifecycle events from VAPI.
 */
router.post("/webhooks/vapi", async (req, res): Promise<void> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = req.body as any;
    const message = body?.message ?? body; // VAPI may wrap in { message: ... } or send flat
    const eventType: string = message?.type ?? "";
    const callId: string | undefined = message?.call?.id ?? message?.callId;

    if (!callId) {
      // Not a call event we can route — acknowledge and ignore
      res.sendStatus(200);
      return;
    }

    logger.info({ vapiCallId: callId, eventType }, "VAPI webhook received");

    if (eventType === "call-started") {
      await db
        .update(callLogsTable)
        .set({ status: "in_progress", startedAt: new Date() })
        .where(eq(callLogsTable.vapiCallId, callId));

    } else if (eventType === "call-ended" || eventType === "end-of-call-report") {
      const endedReason: string | undefined =
        message?.endedReason ?? message?.call?.endedReason;
      const callStatus = vapiEndReasonToStatus(endedReason);

      // Duration: VAPI provides startedAt / endedAt on the call object
      let duration: number | null = null;
      const vapiStartedAt: string | undefined = message?.call?.startedAt;
      const vapiEndedAt: string | undefined = message?.call?.endedAt;
      if (vapiStartedAt && vapiEndedAt) {
        duration = Math.round(
          (new Date(vapiEndedAt).getTime() - new Date(vapiStartedAt).getTime()) / 1000
        );
      } else if (typeof message?.durationSeconds === "number") {
        duration = message.durationSeconds;
      }

      // Transcript from end-of-call-report or messages array
      let transcript: string | null = null;
      if (typeof message?.transcript === "string") {
        transcript = message.transcript;
      } else if (Array.isArray(message?.messages)) {
        transcript = (message.messages as Array<{ role: string; message: string }>)
          .map((m) => `${m.role}: ${m.message}`)
          .join("\n");
      }

      // Summary / outcome
      const outcome: string | null =
        message?.summary ?? message?.analysis?.summary ?? null;

      // Terminal states — a second webhook for the same call must not re-increment counters
      const TERMINAL_STATUSES = ["completed", "failed", "no_answer", "voicemail"] as const;

      // Update call log only if it hasn't already reached a terminal state.
      // If the row is already terminal this returns no rows, making the handler idempotent.
      const [updatedCall] = await db
        .update(callLogsTable)
        .set({
          status: callStatus,
          duration: duration ?? undefined,
          transcript: transcript ?? undefined,
          outcome: outcome ?? undefined,
          endedAt: new Date(),
        })
        .where(
          and(
            eq(callLogsTable.vapiCallId, callId),
            notInArray(callLogsTable.status, [...TERMINAL_STATUSES]),
          )
        )
        .returning();

      // Update lead status and increment campaign calledLeads counter
      if (updatedCall?.leadId) {
        await db
          .update(leadsTable)
          .set({ status: callStatusToLeadStatus(callStatus) })
          .where(eq(leadsTable.id, updatedCall.leadId));
      }
      if (updatedCall?.campaignId) {
        await db
          .update(campaignsTable)
          .set({ calledLeads: sql`${campaignsTable.calledLeads} + 1` })
          .where(eq(campaignsTable.id, updatedCall.campaignId));
      }

    } else if (eventType === "hang") {
      // Call was hung up unexpectedly — same idempotency guard as call-ended
      const TERMINAL_STATUSES = ["completed", "failed", "no_answer", "voicemail"] as const;

      const [updatedCall] = await db
        .update(callLogsTable)
        .set({ status: "failed", endedAt: new Date() })
        .where(
          and(
            eq(callLogsTable.vapiCallId, callId),
            notInArray(callLogsTable.status, [...TERMINAL_STATUSES]),
          )
        )
        .returning();

      if (updatedCall?.leadId) {
        await db
          .update(leadsTable)
          .set({ status: "failed" })
          .where(eq(leadsTable.id, updatedCall.leadId));
      }
      if (updatedCall?.campaignId) {
        await db
          .update(campaignsTable)
          .set({ calledLeads: sql`${campaignsTable.calledLeads} + 1` })
          .where(eq(campaignsTable.id, updatedCall.campaignId));
      }
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, "Error processing VAPI webhook");
    res.sendStatus(500);
  }
});

export default router;
