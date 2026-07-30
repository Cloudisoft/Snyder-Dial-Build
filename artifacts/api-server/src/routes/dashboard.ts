import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, campaignsTable, callLogsTable, activityLogTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;

  const campaigns = await db
    .select({
      id: campaignsTable.id,
      status: campaignsTable.status,
      totalLeads: campaignsTable.totalLeads,
      calledLeads: campaignsTable.calledLeads,
    })
    .from(campaignsTable)
    .where(eq(campaignsTable.userId, userId));

  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const totalLeads = campaigns.reduce((sum, c) => sum + c.totalLeads, 0);

  if (campaigns.length === 0) {
    res.json({ totalCampaigns, activeCampaigns, totalLeads: 0, totalCalls: 0, successfulCalls: 0, avgCallDuration: 0 });
    return;
  }

  const campaignIds = campaigns.map(c => c.id);

  // Aggregate call stats in a single DB query
  const [callStats] = await db
    .select({
      totalCalls: sql<number>`count(*)::int`,
      successfulCalls: sql<number>`count(*) filter (where ${callLogsTable.status} = 'completed')::int`,
      avgDuration: sql<number>`coalesce(avg(${callLogsTable.duration}) filter (where ${callLogsTable.status} = 'completed' and ${callLogsTable.duration} is not null), 0)::float`,
    })
    .from(callLogsTable)
    .where(inArray(callLogsTable.campaignId, campaignIds));

  res.json({
    totalCampaigns,
    activeCampaigns,
    totalLeads,
    totalCalls: callStats?.totalCalls ?? 0,
    successfulCalls: callStats?.successfulCalls ?? 0,
    avgCallDuration: Math.round(callStats?.avgDuration ?? 0),
  });
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
