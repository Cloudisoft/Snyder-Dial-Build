import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, callLogsTable, leadsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/campaigns/:id/calls", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const campaignId = parseInt(raw, 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const calls = await db
    .select({
      id: callLogsTable.id,
      campaignId: callLogsTable.campaignId,
      leadId: callLogsTable.leadId,
      leadName: leadsTable.name,
      leadPhone: leadsTable.phone,
      status: callLogsTable.status,
      duration: callLogsTable.duration,
      transcript: callLogsTable.transcript,
      recordingUrl: callLogsTable.recordingUrl,
      outcome: callLogsTable.outcome,
      startedAt: callLogsTable.startedAt,
      endedAt: callLogsTable.endedAt,
      createdAt: callLogsTable.createdAt,
    })
    .from(callLogsTable)
    .leftJoin(leadsTable, eq(callLogsTable.leadId, leadsTable.id))
    .where(eq(callLogsTable.campaignId, campaignId))
    .orderBy(callLogsTable.createdAt);

  res.json(calls);
});

router.get("/calls/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [call] = await db
    .select({
      id: callLogsTable.id,
      campaignId: callLogsTable.campaignId,
      leadId: callLogsTable.leadId,
      leadName: leadsTable.name,
      leadPhone: leadsTable.phone,
      status: callLogsTable.status,
      duration: callLogsTable.duration,
      transcript: callLogsTable.transcript,
      recordingUrl: callLogsTable.recordingUrl,
      outcome: callLogsTable.outcome,
      startedAt: callLogsTable.startedAt,
      endedAt: callLogsTable.endedAt,
      createdAt: callLogsTable.createdAt,
    })
    .from(callLogsTable)
    .leftJoin(leadsTable, eq(callLogsTable.leadId, leadsTable.id))
    .where(eq(callLogsTable.id, id));

  if (!call) { res.status(404).json({ error: "Call not found" }); return; }
  res.json(call);
});

export default router;
