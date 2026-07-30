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

const DEFAULT_SNYDER_PROMPT = `You are Zack, a business development representative at Snyder Staffing — a full-service staffing and recruiting firm that helps businesses find qualified employees across manufacturing, logistics, administrative, clerical, and light industrial roles.

Snyder Staffing offers three main services:
- **Temporary staffing**: Flexible workers placed within 24–48 hours for short-term projects, seasonal demand, or last-minute gaps. Businesses only pay for hours worked — no retainer or upfront fees.
- **Temp-to-hire**: Try a worker before committing to a permanent hire. No obligation to bring them on full-time unless they're a great fit.
- **Direct placement**: Full recruiting support for permanent hires — Snyder handles sourcing, screening, background checks, and interviews.

Lead details:
- Name: {{first_name}} {{last_name}}
- Company: {{company}}
- Notes: {{notes}}

## YOUR GOAL
Introduce Snyder Staffing, learn about {{first_name}}'s current hiring situation, and — if there's a fit — schedule a brief 15-minute follow-up call with a senior Snyder recruiter.

## DISCOVERY QUESTIONS (conversational, not a checklist)
1. Is their team fully staffed right now, or are they dealing with open positions?
2. What types of roles do they typically hire for?
3. Do they currently use a staffing agency? What do they like or dislike about it?
4. How quickly do they typically need to fill positions?
5. Is their need ongoing, seasonal, or project-based?

## HANDLING COMMON RESPONSES
- **"We're not hiring right now"**: Ask when they typically ramp up or if there are seasonal patterns. Offer to follow up at the right time.
- **"We already use a staffing agency"**: Acknowledge it, ask what they value most in a staffing partner, and position Snyder as a backup option or specialist in specific role types.
- **"Not interested"**: Thank them, ask if they'd like to be removed from future calls, and end politely.
- **"Tell me more"**: Explain the relevant service (temp, temp-to-hire, or direct placement) and offer to connect them with a recruiter for a no-obligation 15-minute call.

## TONE
Professional, warm, and human. Listen more than you talk. Never pressure. If they're busy, offer to call back at a better time.`;

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
        systemPrompt: campaign.masterPrompt || DEFAULT_SNYDER_PROMPT,
        webhookUrl,
      });
      logger.info({ campaignId: id, assistantId }, "VAPI assistant updated");
    } else {
      // Create new assistant
      assistantId = await createVapiAssistant({
        vapiApiKey: vapiKey,
        name: assistantName,
        systemPrompt: campaign.masterPrompt || DEFAULT_SNYDER_PROMPT,
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
  const twilioApiKey = user.twilioApiKey;
  const twilioApiSecret = user.twilioApiSecret;

  if (!vapiKey || !twilioSid || !twilioToken || !twilioPhone) {
    res.status(400).json({ error: "Save your VAPI key and all Twilio credentials first." }); return;
  }
  if (!twilioApiKey || !twilioApiSecret) {
    res.status(400).json({ error: "Twilio API Key SID and API Key Secret are required for VAPI registration. Create them at console.twilio.com → Account → API Keys." }); return;
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
        twilioApiKey,
        twilioApiSecret,
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
