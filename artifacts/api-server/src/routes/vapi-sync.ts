/**
 * VAPI sync routes — create/update VAPI assistants per campaign,
 * and register Twilio phone numbers in VAPI.
 */
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, campaignsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  createVapiAssistant,
  updateVapiAssistant,
  registerVapiPhoneNumber,
  listVapiPhoneNumbers,
} from "../lib/vapi";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function buildWebhookUrl(): string {
  // In dev: use the Replit dev domain. In production: use REPLIT_DOMAINS (set by Replit).
  const replitDomains = process.env.REPLIT_DOMAINS; // "snyderdialer.replit.app,..." in production
  const devDomain = process.env.REPLIT_DEV_DOMAIN;  // set in dev workspace
  const apiBase = process.env.API_BASE_URL;

  if (replitDomains) {
    const primary = replitDomains.split(",")[0].trim();
    return `https://${primary}/api/webhooks/vapi`;
  }
  if (devDomain) return `https://${devDomain}/api/webhooks/vapi`;
  if (apiBase) return `${apiBase}/api/webhooks/vapi`;
  return "/api/webhooks/vapi"; // last resort
}

// ─── Sync campaign assistant ─────────────────────────────────────────────────

router.post("/campaigns/:id/sync-vapi", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, id));
  if (!campaign || campaign.userId !== req.auth!.userId) {
    res.status(404).json({ error: "Campaign not found" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  const vapiKey = campaign.vapiApiKey || user?.vapiApiKey;
  if (!vapiKey) {
    res.status(400).json({ error: "VAPI API key not set. Add it in Integrations." }); return;
  }

  const webhookUrl = buildWebhookUrl();
  const assistantName = `${campaign.name} Agent`;

  try {
    let assistantId = campaign.vapiAssistantId;

    if (assistantId) {
      // Update existing assistant with latest prompt
      await updateVapiAssistant(assistantId, {
        vapiApiKey: vapiKey,
        name: assistantName,
        systemPrompt: campaign.masterPrompt || "You are a helpful outbound calling agent.",
        webhookUrl,
      });
      logger.info({ campaignId: id, assistantId }, "VAPI assistant updated");
    } else {
      // Create new assistant
      assistantId = await createVapiAssistant({
        vapiApiKey: vapiKey,
        name: assistantName,
        systemPrompt: campaign.masterPrompt || "You are a helpful outbound calling agent.",
        webhookUrl,
      });
      logger.info({ campaignId: id, assistantId }, "VAPI assistant created");
    }

    // Save assistant ID back to campaign
    const [updated] = await db
      .update(campaignsTable)
      .set({ vapiAssistantId: assistantId })
      .where(eq(campaignsTable.id, id))
      .returning();

    res.json({ assistantId, campaign: updated });
  } catch (err) {
    logger.error({ campaignId: id, err }, "Failed to sync VAPI assistant");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── Register phone number ───────────────────────────────────────────────────

router.post("/settings/integrations/register-phone", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const vapiKey = user.vapiApiKey;
  const twilioSid = user.twilioAccountSid;
  const twilioToken = user.twilioAuthToken;
  const twilioPhone = user.twilioPhoneNumber;

  if (!vapiKey || !twilioSid || !twilioToken || !twilioPhone) {
    res.status(400).json({ error: "Save your VAPI key and all Twilio credentials first." }); return;
  }

  try {
    // Check if this number is already registered
    const existing = await listVapiPhoneNumbers(vapiKey);
    const match = existing.find((n) => n.number === twilioPhone || n.number === twilioPhone.replace(/\D/g, ""));

    let phoneNumberId: string;
    if (match) {
      phoneNumberId = match.id;
      logger.info({ phoneNumberId, number: twilioPhone }, "VAPI phone number already registered — reusing");
    } else {
      phoneNumberId = await registerVapiPhoneNumber({
        vapiApiKey: vapiKey,
        twilioAccountSid: twilioSid,
        twilioAuthToken: twilioToken,
        twilioPhoneNumber: twilioPhone,
        name: "Snyder Dialer",
      });
      logger.info({ phoneNumberId, number: twilioPhone }, "VAPI phone number registered");
    }

    await db
      .update(usersTable)
      .set({ vapiPhoneNumberId: phoneNumberId })
      .where(eq(usersTable.id, req.auth!.userId));

    res.json({ phoneNumberId, number: twilioPhone, reused: !!match });
  } catch (err) {
    logger.error({ err }, "Failed to register VAPI phone number");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
