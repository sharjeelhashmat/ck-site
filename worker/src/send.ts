import type { OutboundMessage } from './pipeline';

export type EmailProvider = 'resend' | 'brevo';
export interface EmailSender {
  email: string;
  name: string;
}
export interface EmailKeys {
  resend?: string;
  brevo?: string;
}

const cleanName = (n: string) => n.replace(/[\r\n"<>]/g, ' ').replace(/\s+/g, ' ').trim();

// Resend rejects any request without a User-Agent header (403, code 1010). Set it explicitly; never rely on runtime defaults.
export const RESEND_USER_AGENT = 'ck-lead-worker/1.0';

// Resend transactional API (default provider). Plain text only, exactly the approved template text.
export async function resendSend(
  apiKey: string,
  sender: EmailSender,
  replyTo: string,
  msg: OutboundMessage,
): Promise<{ provider_id: string }> {
  const payload: Record<string, unknown> = {
    from: `${cleanName(sender.name)} <${sender.email}>`,
    to: [msg.to],
    subject: msg.subject,
    text: msg.text,
    reply_to: replyTo,
  };
  if (msg.listUnsubscribe) payload.headers = { 'List-Unsubscribe': `<${msg.listUnsubscribe}>` };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'user-agent': RESEND_USER_AGENT },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`email_provider_${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { provider_id: json.id ?? 'unknown' };
}

// Brevo transactional API (kept as a switchable fallback). Verify free-plan branding at first send.
export async function brevoSend(
  apiKey: string,
  sender: EmailSender,
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

export function sendEmail(
  provider: EmailProvider,
  keys: EmailKeys,
  sender: EmailSender,
  replyTo: string,
  msg: OutboundMessage,
): Promise<{ provider_id: string }> {
  if (provider === 'resend') {
    if (!keys.resend) return Promise.reject(new Error('no_email_key'));
    return resendSend(keys.resend, sender, replyTo, msg);
  }
  if (!keys.brevo) return Promise.reject(new Error('no_email_key'));
  return brevoSend(keys.brevo, sender, replyTo, msg);
}
