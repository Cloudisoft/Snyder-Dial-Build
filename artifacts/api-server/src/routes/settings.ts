import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/settings/integrations", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json({
    vapiApiKey: user.vapiApiKey ? "••••••••" + user.vapiApiKey.slice(-4) : null,
    vapiApiKeySet: !!user.vapiApiKey,
    twilioAccountSid: user.twilioAccountSid ?? null,
    twilioAuthToken: user.twilioAuthToken ? "••••••••" + user.twilioAuthToken.slice(-4) : null,
    twilioAuthTokenSet: !!user.twilioAuthToken,
    twilioPhoneNumber: user.twilioPhoneNumber ?? null,
    twilioApiKey: user.twilioApiKey ?? null,
    twilioApiKeySet: !!user.twilioApiKey,
    twilioApiSecret: user.twilioApiSecret ? "••••••••" + user.twilioApiSecret.slice(-4) : null,
    twilioApiSecretSet: !!user.twilioApiSecret,
    vapiPhoneNumberId: user.vapiPhoneNumberId ?? null,
  });
});

router.patch("/settings/integrations", requireAuth, async (req, res): Promise<void> => {
  const { vapiApiKey, twilioAccountSid, twilioAuthToken, twilioPhoneNumber, twilioApiKey, twilioApiSecret } = req.body;
  const updates: Record<string, unknown> = {};

  // Only update fields that were explicitly sent (non-undefined)
  if (vapiApiKey !== undefined) updates.vapiApiKey = vapiApiKey || null;
  if (twilioAccountSid !== undefined) updates.twilioAccountSid = twilioAccountSid || null;
  if (twilioAuthToken !== undefined) updates.twilioAuthToken = twilioAuthToken || null;
  if (twilioApiKey !== undefined) updates.twilioApiKey = twilioApiKey || null;
  if (twilioApiSecret !== undefined) updates.twilioApiSecret = twilioApiSecret || null;
  if (twilioPhoneNumber !== undefined) {
    updates.twilioPhoneNumber = twilioPhoneNumber || null;
    // Clear the cached VAPI phone number ID when the Twilio number changes
    const [current] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
    if (twilioPhoneNumber !== current?.twilioPhoneNumber) {
      updates.vapiPhoneNumberId = null;
    }
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.auth!.userId))
    .returning();

  res.json({
    vapiApiKey: user.vapiApiKey ? "••••••••" + user.vapiApiKey.slice(-4) : null,
    vapiApiKeySet: !!user.vapiApiKey,
    twilioAccountSid: user.twilioAccountSid ?? null,
    twilioAuthToken: user.twilioAuthToken ? "••••••••" + user.twilioAuthToken.slice(-4) : null,
    twilioAuthTokenSet: !!user.twilioAuthToken,
    twilioPhoneNumber: user.twilioPhoneNumber ?? null,
    twilioApiKey: user.twilioApiKey ?? null,
    twilioApiKeySet: !!user.twilioApiKey,
    twilioApiSecret: user.twilioApiSecret ? "••••••••" + user.twilioApiSecret.slice(-4) : null,
    twilioApiSecretSet: !!user.twilioApiSecret,
    vapiPhoneNumberId: user.vapiPhoneNumberId ?? null,
  });
});

export default router;
