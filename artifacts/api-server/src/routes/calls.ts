import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, callLogsTable, leadsTable, campaignsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { fetchVapiCall, transcriptFromVapiCall } from "../lib/vapi";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Shared field list for call queries — keeps all three endpoints consistent. */
const callFields = {
  id:           callLogsTable.id,
  campaignId:   callLogsTable.campaignId,
  leadId:       callLogsTable.leadId,
  vapiCallId:   callLogsTable.vapiCallId,
  status:       callLogsTable.status,
  duration:     callLogsTable.duration,
  transcript:   callLogsTable.transcript,
  recordingUrl: callLogsTable.recordingUrl,
  outcome:      callLogsTable.outcome,
  startedAt:    callLogsTable.startedAt,
  endedAt:      callLogsTable.endedAt,
  createdAt:    callLogsTable.createdAt,
};

/** GET /api/calls/all — all calls across every campaign owned by this user, newest first */
router.get("/calls/all", requireAuth, async (req, res): Promise<void> => {
  const calls = await db
    .select({
      ...callFields,
      campaignName: campaignsTable.name,
      leadName:     leadsTable.name,
      leadPhone:    leadsTable.phone,
    })
    .from(callLogsTable)
    .innerJoin(campaignsTable, eq(callLogsTable.campaignId, campaignsTable.id))
    .leftJoin(leadsTable, eq(callLogsTable.leadId, leadsTable.id))
    .where(eq(campaignsTable.userId, req.auth!.userId))
    .orderBy(desc(callLogsTable.createdAt));

  res.json(calls);
});

router.get("/campaigns/:id/calls", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const campaignId = parseInt(raw, 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const calls = await db
    .select({
      ...callFields,
      leadName:  leadsTable.name,
      leadPhone: leadsTable.phone,
    })
    .from(callLogsTable)
    .leftJoin(leadsTable, eq(callLogsTable.leadId, leadsTable.id))
    .where(eq(callLogsTable.campaignId, campaignId))
    .orderBy(callLogsTable.createdAt);

  res.json(calls);
});

router.get("/calls/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [call] = await db
    .select({ ...callFields, leadName: leadsTable.name, leadPhone: leadsTable.phone })
    .from(callLogsTable)
    .leftJoin(leadsTable, eq(callLogsTable.leadId, leadsTable.id))
    .where(eq(callLogsTable.id, id));

  if (!call) { res.status(404).json({ error: "Call not found" }); return; }
  res.json(call);
});

/**
 * POST /api/calls/:id/sync
 * Fetch the latest transcript and recording URL from the VAPI REST API and
 * patch the call_logs row.  Useful when the webhook payload was incomplete
 * (recording not yet ready) or during a live call to get the latest turns.
 */
router.post("/calls/:id/sync", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Fetch call + verify ownership via campaign join
  const [row] = await db
    .select({
      callId:       callLogsTable.id,
      vapiCallId:   callLogsTable.vapiCallId,
      campaignVapi: campaignsTable.vapiApiKey,
      campaignUser: campaignsTable.userId,
    })
    .from(callLogsTable)
    .innerJoin(campaignsTable, eq(callLogsTable.campaignId, campaignsTable.id))
    .where(and(eq(callLogsTable.id, id), eq(campaignsTable.userId, req.auth!.userId)));

  if (!row) { res.status(404).json({ error: "Call not found" }); return; }
  if (!row.vapiCallId) { res.status(400).json({ error: "No VAPI call ID on this record" }); return; }

  // Resolve VAPI API key (campaign-level → user-level fallback)
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  const vapiKey = row.campaignVapi || user?.vapiApiKey;
  if (!vapiKey) { res.status(400).json({ error: "No VAPI API key configured" }); return; }

  let vapiCall;
  try {
    vapiCall = await fetchVapiCall(vapiKey, row.vapiCallId);
  } catch (err) {
    logger.error({ callId: id, vapiCallId: row.vapiCallId, err }, "VAPI fetch failed during sync");
    res.status(502).json({ error: "Failed to fetch call from VAPI" });
    return;
  }

  // Build update — only write fields that VAPI returned a value for
  const updates: Record<string, unknown> = {};

  const transcript = transcriptFromVapiCall(vapiCall);
  if (transcript) updates.transcript = transcript;

  const recordingUrl =
    vapiCall.recordingUrl ??
    vapiCall.artifact?.recordingUrl ??
    null;
  if (recordingUrl) updates.recordingUrl = recordingUrl;

  const outcome = vapiCall.analysis?.summary ?? null;
  if (outcome) updates.outcome = outcome;

  if (Object.keys(updates).length > 0) {
    await db.update(callLogsTable).set(updates).where(eq(callLogsTable.id, id));
  }

  // Return the refreshed row
  const [updated] = await db
    .select({ ...callFields, leadName: leadsTable.name, leadPhone: leadsTable.phone })
    .from(callLogsTable)
    .leftJoin(leadsTable, eq(callLogsTable.leadId, leadsTable.id))
    .where(eq(callLogsTable.id, id));

  logger.info({ callId: id, updatedFields: Object.keys(updates) }, "Call synced from VAPI");
  res.json(updated);
});

export default router;
