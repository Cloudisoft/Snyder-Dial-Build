import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, campaignsTable, leadsTable, callLogsTable, activityLogTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;

  const campaigns = await db.select().from(campaignsTable).where(eq(campaignsTable.userId, userId));
  const campaignIds = campaigns.map(c => c.id);

  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter(c => c.status === "active").length;

  if (campaignIds.length === 0) {
    res.json({ totalCampaigns, activeCampaigns, totalLeads: 0, totalCalls: 0, successfulCalls: 0, avgCallDuration: 0 });
    return;
  }

  const leads = await db.select({ id: leadsTable.id }).from(leadsTable)
    .where(sql`${leadsTable.campaignId} = ANY(ARRAY[${sql.join(campaignIds.map(id => sql`${id}`), sql`, `)}]::int[])`);

  const calls = await db.select({
    id: callLogsTable.id,
    status: callLogsTable.status,
    duration: callLogsTable.duration,
  }).from(callLogsTable)
    .where(sql`${callLogsTable.campaignId} = ANY(ARRAY[${sql.join(campaignIds.map(id => sql`${id}`), sql`, `)}]::int[])`);

  const totalLeads = leads.length;
  const totalCalls = calls.length;
  const successfulCalls = calls.filter(c => c.status === "completed").length;
  const completedWithDuration = calls.filter(c => c.duration != null && c.status === "completed");
  const avgCallDuration = completedWithDuration.length > 0
    ? completedWithDuration.reduce((sum, c) => sum + (c.duration ?? 0), 0) / completedWithDuration.length
    : 0;

  res.json({ totalCampaigns, activeCampaigns, totalLeads, totalCalls, successfulCalls, avgCallDuration });
});

router.get("/dashboard/activity", requireAuth, async (req, res): Promise<void> => {
  const activity = await db
    .select()
    .from(activityLogTable)
    .orderBy(activityLogTable.createdAt)
    .limit(20);

  // Return most recent first
  res.json(activity.reverse());
});

export default router;
