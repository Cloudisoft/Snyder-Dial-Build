import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, promptTemplatesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/prompt-templates", requireAuth, async (_req, res): Promise<void> => {
  const templates = await db.select().from(promptTemplatesTable).orderBy(promptTemplatesTable.createdAt);
  res.json(templates);
});

router.post("/prompt-templates", requireAuth, async (req, res): Promise<void> => {
  const { name, content, variables } = req.body;
  if (!name || content == null) {
    res.status(400).json({ error: "name and content are required" });
    return;
  }

  const [template] = await db.insert(promptTemplatesTable).values({
    name,
    content,
    variables: Array.isArray(variables) ? variables : [],
  }).returning();

  res.status(201).json(template);
});

router.patch("/prompt-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, content, variables } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (content !== undefined) updates.content = content;
  if (variables !== undefined) updates.variables = Array.isArray(variables) ? variables : [];

  const [template] = await db.update(promptTemplatesTable).set(updates).where(eq(promptTemplatesTable.id, id)).returning();
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(template);
});

router.delete("/prompt-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(promptTemplatesTable).where(eq(promptTemplatesTable.id, id));
  res.sendStatus(204);
});

export default router;
