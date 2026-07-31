import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { db, leadsTable, activityLogTable, campaignsTable, usersTable, callLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { initiateVapiCall, interpolatePrompt } from "../lib/vapi";
import { logger } from "../lib/logger";

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX for US).
 * Handles: +13244585679, 13244585679, 3244585679, 324-458-5679, (324) 458-5679, etc.
 */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (hasPlus) {
    // Already had a + prefix — trust the country code as-is
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    // 1XXXXXXXXXX → +1XXXXXXXXXX
    return `+${digits}`;
  }
  if (digits.length === 10) {
    // XXXXXXXXXX → +1XXXXXXXXXX (assume US)
    return `+1${digits}`;
  }
  // Shorter/longer numbers: prepend + and let VAPI validate
  return `+${digits}`;
}

/** Fire-and-forget: dial a lead immediately if the campaign is active and credentials are available. */
async function dialLeadIfActive(campaignId: number, leadId: number, userId: number): Promise<void> {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign || campaign.status !== "active") return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const vapiKey = campaign.vapiApiKey || user?.vapiApiKey;
  const twilioSid = campaign.twilioAccountSid || user?.twilioAccountSid;
  const twilioToken = campaign.twilioAuthToken || user?.twilioAuthToken;
  const twilioPhone = campaign.twilioPhoneNumber || user?.twilioPhoneNumber;
  if (!vapiKey || !twilioSid || !twilioToken || !twilioPhone) return;

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead || lead.status !== "pending") return;

  const replitDomains = process.env.REPLIT_DOMAINS;
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  const webhookHost = replitDomains
    ? `https://${replitDomains.split(",")[0].trim()}`
    : devDomain ? `https://${devDomain}` : (process.env.API_BASE_URL ?? "");
  const webhookUrl = `${webhookHost}/api/webhooks/vapi`;

  try {
    await db.update(leadsTable).set({ status: "calling" }).where(eq(leadsTable.id, leadId));
    const nameParts = (lead.name ?? "").trim().split(/\s+/);
    const systemPrompt = interpolatePrompt(campaign.masterPrompt, {
      name: lead.name,
      first_name: nameParts[0] ?? "",
      last_name: nameParts.slice(1).join(" ") || "",
      company: lead.company,
      phone: lead.phone,
      email: lead.email,
      notes: lead.notes,
    });
    const { callId } = await initiateVapiCall({
      vapiApiKey: vapiKey,
      toNumber: lead.phone,
      customerName: lead.name,
      systemPrompt,
      webhookUrl,
      assistantId: campaign.vapiAssistantId ?? undefined,
      phoneNumberId: user?.vapiPhoneNumberId ?? undefined,
      twilioAccountSid: twilioSid ?? undefined,
      twilioAuthToken: twilioToken ?? undefined,
      twilioPhoneNumber: twilioPhone ?? undefined,
    });
    await db.insert(callLogsTable).values({
      campaignId, leadId, vapiCallId: callId, status: "initiated", startedAt: new Date(),
    });
    logger.info({ campaignId, leadId, callId }, "Auto-dialed lead added to active campaign");
  } catch (err) {
    logger.error({ campaignId, leadId, err }, "Failed to auto-dial lead");
    await db.update(leadsTable).set({ status: "pending" }).where(eq(leadsTable.id, leadId));
  }
}

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/campaigns/:id/leads", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const campaignId = parseInt(raw, 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const leads = await db.select().from(leadsTable).where(eq(leadsTable.campaignId, campaignId));
  res.json(leads);
});

router.post("/campaigns/:id/leads", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const campaignId = parseInt(raw, 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, phone, email, company, notes } = req.body;
  if (!name || !phone) { res.status(400).json({ error: "name and phone are required" }); return; }

  const [lead] = await db.insert(leadsTable).values({
    campaignId, name, phone: normalizePhone(phone),
    email: email || null,
    company: company || null,
    notes: notes || null,
    status: "pending",
  }).returning();

  await db.update(campaignsTable)
    .set({ totalLeads: sql`${campaignsTable.totalLeads} + 1` })
    .where(eq(campaignsTable.id, campaignId));

  res.status(201).json(lead);

  // Fire-and-forget: dial immediately if campaign is already active
  dialLeadIfActive(campaignId, lead.id, req.auth!.userId).catch(() => {});
});

router.post("/campaigns/:id/leads/upload", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const campaignId = parseInt(raw, 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }

  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  let records: Record<string, string>[];
  try {
    records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  } catch {
    res.status(400).json({ error: "Invalid CSV format" });
    return;
  }

  let imported = 0;
  let skipped = 0;
  const insertedIds: number[] = [];

  for (const row of records) {
    // Support multiple column name variants
    const name = row["name"] || row["Name"] || row["full_name"] || row["Full Name"] || "";
    const rawPhone = row["phone"] || row["Phone"] || row["phone_number"] || row["Phone Number"] || "";
    if (!name || !rawPhone) { skipped++; continue; }
    const phone = normalizePhone(rawPhone);

    const [lead] = await db.insert(leadsTable).values({
      campaignId,
      name,
      phone,
      email: row["email"] || row["Email"] || null,
      company: row["company"] || row["Company"] || null,
      notes: row["notes"] || row["Notes"] || null,
      status: "pending",
    }).returning();
    insertedIds.push(lead.id);
    imported++;
  }

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (campaign) {
    await db.insert(activityLogTable).values({
      type: "leads_uploaded",
      message: `${imported} leads uploaded to "${campaign.name}"`,
      campaignId,
      campaignName: campaign.name,
    });
    if (imported > 0) {
      await db
        .update(campaignsTable)
        .set({ totalLeads: sql`${campaignsTable.totalLeads} + ${imported}` })
        .where(eq(campaignsTable.id, campaignId));
    }
  }

  res.json({ imported, skipped, total: records.length });

  // Fire-and-forget: dial all newly imported leads if campaign is already active
  for (const leadId of insertedIds) {
    dialLeadIfActive(campaignId, leadId, req.auth!.userId).catch(() => {});
  }
});

router.delete("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Fetch before deleting so we can keep totalLeads accurate
  const [lead] = await db.select({ campaignId: leadsTable.campaignId }).from(leadsTable).where(eq(leadsTable.id, id));
  await db.delete(leadsTable).where(eq(leadsTable.id, id));
  if (lead?.campaignId) {
    await db
      .update(campaignsTable)
      .set({ totalLeads: sql`greatest(${campaignsTable.totalLeads} - 1, 0)` })
      .where(eq(campaignsTable.id, lead.campaignId));
  }
  res.sendStatus(204);
});

export default router;
