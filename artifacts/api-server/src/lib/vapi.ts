/**
 * VAPI service — creates assistants, registers phone numbers, initiates calls.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VapiCallOptions {
  vapiApiKey: string;
  toNumber: string;
  customerName: string;
  systemPrompt: string;
  webhookUrl: string;
  // Preferred: use persistent VAPI objects
  assistantId?: string;
  phoneNumberId?: string;
  // Fallback: inline Twilio BYOT credentials
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
}

export interface VapiCallResult {
  callId: string;
}

export interface CreateAssistantOptions {
  vapiApiKey: string;
  name: string;
  systemPrompt: string;
  firstMessage?: string;
  webhookUrl: string;
}

export interface RegisterPhoneNumberOptions {
  vapiApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioApiKey: string;
  twilioApiSecret: string;
  twilioPhoneNumber: string;
  name?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function vapiRequest(path: string, vapiApiKey: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${vapiApiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VAPI ${method} ${path} failed ${res.status}: ${text}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

// ─── Prompt interpolation ────────────────────────────────────────────────────

/**
 * Replace {{variable}} placeholders in a prompt template with lead data.
 */
export function interpolatePrompt(template: string, variables: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value != null ? value : match;
  });
}

// ─── VAPI Assistant ──────────────────────────────────────────────────────────

/**
 * Create a new VAPI assistant for a campaign. Returns the assistant ID.
 */
export async function createVapiAssistant(opts: CreateAssistantOptions): Promise<string> {
  const data = await vapiRequest("/assistant", opts.vapiApiKey, "POST", {
    name: opts.name,
    firstMessage: opts.firstMessage ?? "Hi, I'm calling on behalf of our team. Is now a good time to chat?",
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: opts.systemPrompt }],
    },
    voice: {
      provider: "openai",
      voiceId: "nova",
    },
    server: {
      url: opts.webhookUrl,
    },
  });
  return data.id as string;
}

/**
 * Update an existing VAPI assistant's system prompt and webhook.
 */
export async function updateVapiAssistant(
  assistantId: string,
  opts: Pick<CreateAssistantOptions, "vapiApiKey" | "systemPrompt" | "webhookUrl" | "name">,
): Promise<void> {
  await vapiRequest(`/assistant/${assistantId}`, opts.vapiApiKey, "PATCH", {
    name: opts.name,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: opts.systemPrompt }],
    },
    server: {
      url: opts.webhookUrl,
    },
  });
}

// ─── VAPI Phone Number ───────────────────────────────────────────────────────

/**
 * Find an existing Twilio credential in VAPI by matching account SID,
 * or create a new one. Returns the credential UUID.
 */
async function ensureVapiTwilioCredential(
  vapiApiKey: string,
  twilioAccountSid: string,
  twilioAuthToken: string,
  twilioApiKey: string,
  twilioApiSecret: string,
): Promise<string> {
  // List existing credentials and reuse if already present for this account SID
  const res = await fetch("https://api.vapi.ai/credential", {
    headers: { Authorization: `Bearer ${vapiApiKey}` },
  });
  if (res.ok) {
    const creds = await res.json() as Array<{ id: string; provider: string; accountSid?: string }>;
    const existing = creds.find(
      (c) => c.provider === "twilio" && c.accountSid === twilioAccountSid,
    );
    if (existing) return existing.id;
  }

  // Create a new Twilio credential — VAPI uses accountSid/authToken/apiKey/apiSecret (no "twilio" prefix)
  const data = await vapiRequest("/credential", vapiApiKey, "POST", {
    provider: "twilio",
    accountSid: twilioAccountSid,
    authToken: twilioAuthToken,
    apiKey: twilioApiKey,
    apiSecret: twilioApiSecret,
  });
  return data.id as string;
}

/**
 * Register a Twilio BYOT phone number in VAPI.
 * First ensures a Twilio credential object exists in VAPI (reusing one if already
 * present for this account SID), then registers the phone number referencing that
 * credential by ID. This is the approach required by current VAPI API versions.
 * Returns the VAPI phone number ID.
 */
export async function registerVapiPhoneNumber(opts: RegisterPhoneNumberOptions): Promise<string> {
  // Check if this number is already registered and reuse it
  const existing = await listVapiPhoneNumbers(opts.vapiApiKey);
  const match = existing.find((p) => p.number === opts.twilioPhoneNumber);
  if (match) return match.id;

  // Ensure a Twilio credential object exists in VAPI, then register the phone
  // number referencing it by ID (avoids embedding raw credentials in the request).
  const credentialId = await ensureVapiTwilioCredential(
    opts.vapiApiKey,
    opts.twilioAccountSid,
    opts.twilioAuthToken,
    opts.twilioApiKey,
    opts.twilioApiSecret,
  );

  const data = await vapiRequest("/phone-number", opts.vapiApiKey, "POST", {
    provider: "twilio",
    number: opts.twilioPhoneNumber,
    credentialId,
    name: opts.name ?? "Snyder Dialer",
  });
  return data.id as string;
}

/**
 * List phone numbers registered in VAPI to check if one already exists.
 */
export async function listVapiPhoneNumbers(vapiApiKey: string): Promise<Array<{ id: string; number: string }>> {
  const res = await fetch("https://api.vapi.ai/phone-number", {
    headers: { Authorization: `Bearer ${vapiApiKey}` },
  });
  if (!res.ok) return [];
  return res.json() as Promise<Array<{ id: string; number: string }>>;
}

// ─── Initiate Call ───────────────────────────────────────────────────────────

/**
 * Initiate an outbound VAPI call.
 * Prefers assistantId + phoneNumberId (persistent VAPI objects).
 * Falls back to inline Twilio BYOT + inline assistant when IDs are not available.
 */
export async function initiateVapiCall(opts: VapiCallOptions): Promise<VapiCallResult> {
  const interpolatedPrompt = opts.systemPrompt;

  let body: Record<string, unknown>;

  if (opts.assistantId && opts.phoneNumberId) {
    // ── Preferred path: persistent VAPI assistant + registered phone number ──
    body = {
      type: "outboundPhoneCall",
      assistantId: opts.assistantId,
      // Override the system prompt per-call so lead variables are interpolated.
      // provider + model must be included because VAPI shallow-merges nested objects —
      // specifying only `messages` would cause provider/model-name to be lost.
      assistantOverrides: {
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: interpolatedPrompt }],
        },
      },
      phoneNumberId: opts.phoneNumberId,
      customer: {
        number: opts.toNumber,
        name: opts.customerName,
      },
    };
  } else {
    // ── Fallback path: inline Twilio BYOT + inline assistant config ──
    if (!opts.twilioAccountSid || !opts.twilioAuthToken || !opts.twilioPhoneNumber) {
      throw new Error("Either assistantId+phoneNumberId or Twilio credentials are required");
    }
    body = {
      type: "outboundPhoneCall",
      customer: {
        number: opts.toNumber,
        name: opts.customerName,
      },
      phoneNumber: {
        twilioAccountSid: opts.twilioAccountSid,
        twilioAuthToken: opts.twilioAuthToken,
        twilioPhoneNumber: opts.twilioPhoneNumber,
      },
      assistant: {
        firstMessage: `Hi, this is an automated call.${opts.customerName ? ` Is this ${opts.customerName}?` : ""}`,
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: interpolatedPrompt }],
        },
        voice: {
          provider: "openai",
          voiceId: "nova",
        },
        server: {
          url: opts.webhookUrl,
        },
      },
    };
  }

  const data = await vapiRequest("/call", opts.vapiApiKey, "POST", body);
  return { callId: data.id as string };
}
