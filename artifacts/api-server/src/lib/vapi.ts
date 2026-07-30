/**
 * VAPI call service — initiates outbound calls via VAPI with Twilio BYOT credentials.
 */

export interface VapiCallOptions {
  vapiApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  toNumber: string;
  customerName: string;
  systemPrompt: string;
  webhookUrl: string;
}

export interface VapiCallResult {
  callId: string;
}

/**
 * Replace {{variable}} placeholders in a prompt template with lead data.
 */
export function interpolatePrompt(template: string, variables: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value != null ? value : match;
  });
}

/**
 * Initiate an outbound VAPI call using the campaign's Twilio credentials (BYOT).
 */
export async function initiateVapiCall(opts: VapiCallOptions): Promise<VapiCallResult> {
  const body = {
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
      firstMessage: `Hi, this is an automated call. ${opts.customerName ? `Is this ${opts.customerName}?` : ""}`.trim(),
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: opts.systemPrompt,
          },
        ],
      },
      voice: {
        provider: "playht",
        voiceId: "jennifer",
      },
    },
    serverUrl: opts.webhookUrl,
  };

  const response = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.vapiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VAPI API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { id: string };
  return { callId: data.id };
}
