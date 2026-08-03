import { Router, type IRouter } from "express";
import { eq, count, and } from "drizzle-orm";
import { db, campaignsTable, leadsTable, callLogsTable, activityLogTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { fillConcurrencySlots } from "../lib/dialer";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/campaigns", requireAuth, async (req, res): Promise<void> => {
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.userId, req.auth!.userId))
    .orderBy(campaignsTable.createdAt);
  res.json(campaigns);
});

router.post("/campaigns", requireAuth, async (req, res): Promise<void> => {
  const { name, objective, masterPrompt, twilioAccountSid, twilioAuthToken, twilioPhoneNumber, vapiApiKey } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      userId: req.auth!.userId,
      name,
      objective: objective ?? "",
      masterPrompt: masterPrompt ?? "",
      twilioAccountSid: twilioAccountSid ?? null,
      twilioAuthToken: twilioAuthToken ?? null,
      twilioPhoneNumber: twilioPhoneNumber ?? null,
      vapiApiKey: vapiApiKey ?? null,
    })
    .returning();
  res.status(201).json(campaign);
});

router.get("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.userId, req.auth!.userId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(campaign);
});

router.patch("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, objective, masterPrompt, twilioAccountSid, twilioAuthToken, twilioPhoneNumber, vapiApiKey, concurrency } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (objective !== undefined) updates.objective = objective;
  if (masterPrompt !== undefined) updates.masterPrompt = masterPrompt;
  if (twilioAccountSid !== undefined) updates.twilioAccountSid = twilioAccountSid;
  if (twilioAuthToken !== undefined) updates.twilioAuthToken = twilioAuthToken;
  if (twilioPhoneNumber !== undefined) updates.twilioPhoneNumber = twilioPhoneNumber;
  if (vapiApiKey !== undefined) updates.vapiApiKey = vapiApiKey;
  if (concurrency !== undefined) updates.concurrency = Math.max(1, Math.min(20, parseInt(concurrency, 10) || 1));

  const [campaign] = await db
    .update(campaignsTable)
    .set(updates)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.userId, req.auth!.userId)))
    .returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(campaign);
});

router.delete("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(campaignsTable).where(and(eq(campaignsTable.id, id), eq(campaignsTable.userId, req.auth!.userId)));
  res.sendStatus(204);
});

router.post("/campaigns/:id/launch", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [campaign] = await db
    .update(campaignsTable)
    .set({ status: "active" })
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.userId, req.auth!.userId)))
    .returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  await db.insert(activityLogTable).values({
    type: "campaign_launched",
    message: `Campaign "${campaign.name}" launched`,
    campaignId: campaign.id,
    campaignName: campaign.name,
  });

  // Respond immediately — dialing runs in the background
  res.json(campaign);

  // Fill concurrency slots — dials up to campaign.concurrency leads,
  // then each subsequent call is triggered by the webhook when a slot frees up.
  fillConcurrencySlots(id).catch((err) =>
    logger.error({ campaignId: id, err }, "fillConcurrencySlots failed on launch"),
  );
});

router.post("/campaigns/:id/pause", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [campaign] = await db
    .update(campaignsTable)
    .set({ status: "paused" })
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.userId, req.auth!.userId)))
    .returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  await db.insert(activityLogTable).values({
    type: "campaign_paused",
    message: `Campaign "${campaign.name}" paused`,
    campaignId: campaign.id,
    campaignName: campaign.name,
  });

  res.json(campaign);
});

router.get("/campaigns/:id/stats", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const allLeads = await db.select().from(leadsTable).where(eq(leadsTable.campaignId, id));
  const calls = await db.select().from(callLogsTable).where(eq(callLogsTable.campaignId, id));

  const totalLeads = allLeads.length;
  const calledLeads = allLeads.filter(l => l.status !== "pending").length;
  const pendingLeads = allLeads.filter(l => l.status === "pending").length;
  const successfulCalls = calls.filter(c => c.status === "completed").length;
  const failedCalls = calls.filter(c => c.status === "failed" || c.status === "no_answer").length;
  const completedCalls = calls.filter(c => c.duration != null);
  const avgCallDuration = completedCalls.length > 0
    ? completedCalls.reduce((sum, c) => sum + (c.duration ?? 0), 0) / completedCalls.length
    : 0;

  res.json({ campaignId: id, totalLeads, calledLeads, pendingLeads, successfulCalls, failedCalls, avgCallDuration });
});

export default router;
