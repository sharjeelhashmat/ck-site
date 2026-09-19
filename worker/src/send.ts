import type { OutboundMessage } from './pipeline';

// Brevo transactional API. Verify free-plan branding and triggered-send behavior at wiring time.
// Alternative provider with the same shape: Resend (3,000/month, 100/day on the free tier).
export async function brevoSend(
  apiKey: string,
  sender: { email: string; name: string },
  replyTo: string,
  msg: OutboundMessage,
): Promise<{ provider_id: string }> {
  const payload: Record<string, unknown> = {
    sender,
    replyTo: { email: replyTo, name: sender.name },
    to: [{ email: msg.to, name: msg.toName }],
    subject: msg.subject,
    textContent: msg.text,
  };
  if (msg.listUnsubscribe) payload.headers = { 'List-Unsubscribe': `<${msg.listUnsubscribe}>` };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`email_provider_${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { provider_id: json.messageId ?? 'unknown' };
}
