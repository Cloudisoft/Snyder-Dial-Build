import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, knowledgeBaseFilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const uploadDir = "/tmp/snyder-kb-uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".txt", ".csv", ".doc"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) { cb(null, true); }
    else { cb(new Error("Unsupported file type")); }
  },
});

router.get("/campaigns/:id/knowledge-base", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const campaignId = parseInt(raw, 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const files = await db.select().from(knowledgeBaseFilesTable).where(eq(knowledgeBaseFilesTable.campaignId, campaignId));
  res.json(files);
});

router.post("/campaigns/:id/knowledge-base/upload", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const campaignId = parseInt(raw, 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }

  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const ext = path.extname(req.file.originalname).toLowerCase().replace(".", "");

  const [file] = await db.insert(knowledgeBaseFilesTable).values({
    campaignId,
    fileName: req.file.originalname,
    fileType: ext,
    filePath: req.file.path,
    status: "ready",
  }).returning();

  res.status(201).json(file);
});

router.delete("/knowledge-base/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [file] = await db.select().from(knowledgeBaseFilesTable).where(eq(knowledgeBaseFilesTable.id, id));
  if (file?.filePath && fs.existsSync(file.filePath)) {
    try { fs.unlinkSync(file.filePath); } catch { /* ignore */ }
  }

  await db.delete(knowledgeBaseFilesTable).where(eq(knowledgeBaseFilesTable.id, id));
  res.sendStatus(204);
});

export default router;
