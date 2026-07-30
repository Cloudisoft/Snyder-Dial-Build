import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { db, leadsTable, activityLogTable, campaignsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/campaigns/:id/leads", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const campaignId = parseInt(raw, 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const leads = await db.select().from(leadsTable).where(eq(leadsTable.campaignId, campaignId));
  res.json(leads);
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

  for (const row of records) {
    // Support multiple column name variants
    const name = row["name"] || row["Name"] || row["full_name"] || row["Full Name"] || "";
    const phone = row["phone"] || row["Phone"] || row["phone_number"] || row["Phone Number"] || "";
    if (!name || !phone) { skipped++; continue; }

    await db.insert(leadsTable).values({
      campaignId,
      name,
      phone,
      email: row["email"] || row["Email"] || null,
      company: row["company"] || row["Company"] || null,
      notes: row["notes"] || row["Notes"] || null,
      status: "pending",
    });
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
  }

  res.json({ imported, skipped, total: records.length });
});

router.delete("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(leadsTable).where(eq(leadsTable.id, id));
  res.sendStatus(204);
});

export default router;
