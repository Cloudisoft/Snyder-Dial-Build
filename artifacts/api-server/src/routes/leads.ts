import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { db, leadsTable, activityLogTable, campaignsTable, usersTable, callLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { fillConcurrencySlots } from "../lib/dialer";
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

/** Fire-and-forget: fill available concurrency slots when a lead is added to an active campaign. */
function dialIfSlotAvailable(campaignId: number): void {
  fillConcurrencySlots(campaignId).catch((err) =>
    logger.error({ campaignId, err }, "fillConcurrencySlots failed after lead added"),
  );
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
  dialIfSlotAvailable(campaignId);
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

  /** Case-insensitive, whitespace-tolerant column lookup. Returns first non-empty match or "". */
  const col = (row: Record<string, string>, ...keys: string[]): string => {
    const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v?.trim() ?? ""]));
    for (const key of keys) {
      const v = lower[key.toLowerCase().trim()];
      if (v) return v;
    }
    return "";
  };

  for (const row of records) {
    // Try a combined name column first, then fall back to first + last
    let name = col(row,
      "name", "full name", "full_name", "contact name", "contact_name",
      "lead name", "lead_name", "client name", "client_name"
    );
    if (!name) {
      const first = col(row, "first name", "first_name", "firstname");
      const last  = col(row, "last name",  "last_name",  "lastname");
      if (first || last) name = [first, last].filter(Boolean).join(" ");
    }

    const rawPhone = col(row,
      "phone", "phone number", "phone_number",
      "mobile", "mobile number", "mobile_number", "mobile phone", "mobile_phone",
      "cell", "cell number", "cell_number", "cell phone", "cell_phone",
      "telephone", "tel", "work phone", "work_phone", "direct phone", "direct_phone",
      "contact phone", "contact_phone", "number"
    );

    if (!name || !rawPhone) { skipped++; continue; }
    const phone = normalizePhone(rawPhone);

    const [lead] = await db.insert(leadsTable).values({
      campaignId,
      name,
      phone,
      email:   col(row, "email", "email address", "email_address", "e-mail") || null,
      company: col(row, "company", "company name", "company_name", "organization", "employer", "business") || null,
      notes:   col(row, "notes", "note", "comments", "comment", "description") || null,
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
    dialIfSlotAvailable(campaignId);
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
