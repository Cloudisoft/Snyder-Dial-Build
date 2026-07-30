import { Router, type IRouter } from "express";
import { eq, count, and } from "drizzle-orm";
import { db, campaignsTable, leadsTable, callLogsTable, activityLogTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { initiateVapiCall, interpolatePrompt } from "../lib/vapi";
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

  const { name, objective, masterPrompt, twilioAccountSid, twilioAuthToken, twilioPhoneNumber, vapiApiKey } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (objective !== undefined) updates.objective = objective;
  if (masterPrompt !== undefined) updates.masterPrompt = masterPrompt;
  if (twilioAccountSid !== undefined) updates.twilioAccountSid = twilioAccountSid;
  if (twilioAuthToken !== undefined) updates.twilioAuthToken = twilioAuthToken;
  if (twilioPhoneNumber !== undefined) updates.twilioPhoneNumber = twilioPhoneNumber;
  if (vapiApiKey !== undefined) updates.vapiApiKey = vapiApiKey;

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

  // Respond immediately — call dialing runs in the background
  res.json(campaign);

  // Kick off VAPI calls for all pending leads (fire-and-forget after response)
  // Resolve credentials: campaign-level overrides user-level (global integrations)
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  const resolvedVapiKey = campaign.vapiApiKey || user?.vapiApiKey;
  const resolvedTwilioSid = campaign.twilioAccountSid || user?.twilioAccountSid;
  const resolvedTwilioToken = campaign.twilioAuthToken || user?.twilioAuthToken;
  const resolvedTwilioPhone = campaign.twilioPhoneNumber || user?.twilioPhoneNumber;

  if (resolvedVapiKey && resolvedTwilioSid && resolvedTwilioToken && resolvedTwilioPhone) {
    const pendingLeads = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.campaignId, id), eq(leadsTable.status, "pending")));

    // Build the webhook URL for VAPI to call back with call events
    const host = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : (process.env.API_BASE_URL ?? "");
    const webhookUrl = `${host}/api/webhooks/vapi`;

    for (const lead of pendingLeads) {
      try {
        // Mark lead as "calling" so it isn't re-dialed by a subsequent launch
        await db.update(leadsTable).set({ status: "calling" }).where(eq(leadsTable.id, lead.id));

        const systemPrompt = interpolatePrompt(campaign.masterPrompt, {
          name: lead.name,
          company: lead.company,
          phone: lead.phone,
          email: lead.email,
          notes: lead.notes,
        });

        const { callId } = await initiateVapiCall({
          vapiApiKey: resolvedVapiKey,
          twilioAccountSid: resolvedTwilioSid,
          twilioAuthToken: resolvedTwilioToken,
          twilioPhoneNumber: resolvedTwilioPhone,
          toNumber: lead.phone,
          customerName: lead.name,
          systemPrompt,
          webhookUrl,
        });

        // Create a call log entry linked to the VAPI call ID
        await db.insert(callLogsTable).values({
          campaignId: id,
          leadId: lead.id,
          vapiCallId: callId,
          status: "initiated",
          startedAt: new Date(),
        });

        logger.info({ campaignId: id, leadId: lead.id, vapiCallId: callId }, "VAPI call initiated");
      } catch (err) {
        logger.error({ campaignId: id, leadId: lead.id, err }, "Failed to initiate VAPI call");

        // Revert lead status so it can be retried on next launch
        await db.update(leadsTable).set({ status: "pending" }).where(eq(leadsTable.id, lead.id));
      }
    }
  } else {
    logger.warn(
      { campaignId: id },
      "Campaign launched without VAPI/Twilio credentials — no calls will be dialed"
    );
  }
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
