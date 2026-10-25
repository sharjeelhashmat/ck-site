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

// RFC 8058 one-click: the mail client POSTs "List-Unsubscribe=One-Click" to the URL (accepted on /unsubscribe and
// /api/newsletter/unsubscribe, which check the same signed token as the link).
export function listUnsubscribeHeaders(url: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

// Every provider call gives up after 8 s (PR 2c item 1d): the outbox row is then marked failed with code "timeout" and
// is not resent automatically (the provider may still have accepted it).
export const SEND_TIMEOUT_MS = 8000;

// Resend rejects any request without a User-Agent header (403, code 1010). Set it explicitly; never rely on runtime defaults.
export const RESEND_USER_AGENT = 'ck-lead-worker/1.0';

// Resend transactional API (default provider). Plain text only, exactly the approved template text. idempotencyKey is the
// outbox row id: Resend answers a repeat of the same key with the first result instead of sending twice.
export async function resendSend(
  apiKey: string,
  sender: EmailSender,
  replyTo: string,
  msg: OutboundMessage,
  idempotencyKey?: string,
): Promise<{ provider_id: string }> {
  const payload: Record<string, unknown> = {
    from: `${cleanName(sender.name)} <${sender.email}>`,
    to: [msg.to],
    subject: msg.subject,
    text: msg.text,
    reply_to: replyTo,
  };
  if (msg.listUnsubscribe) payload.headers = listUnsubscribeHeaders(msg.listUnsubscribe);

  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'user-agent': RESEND_USER_AGENT };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`email_provider_${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { id?: unknown };
  // No id = no receipt: a failure, never an "unknown" success.
  if (typeof json.id !== 'string' || !json.id) throw new Error('no_provider_id');
  return { provider_id: json.id };
}

// Brevo transactional API (kept as a switchable fallback). Verify free-plan branding at first send. Brevo's equivalent of
// the idempotency key is "idempotencyKey" (a UUID; the outbox id is one) inside the body's headers object; a repeat
// within its TTL is refused as duplicate_parameter, which the outbox records as a failure (never a second send).
export async function brevoSend(
  apiKey: string,
  sender: EmailSender,
  replyTo: string,
  msg: OutboundMessage,
  idempotencyKey?: string,
): Promise<{ provider_id: string }> {
  const payload: Record<string, unknown> = {
    sender,
    replyTo: { email: replyTo, name: sender.name },
    to: [{ email: msg.to, name: msg.toName }],
    subject: msg.subject,
    textContent: msg.text,
  };
  const headers: Record<string, string> = msg.listUnsubscribe ? listUnsubscribeHeaders(msg.listUnsubscribe) : {};
  if (idempotencyKey) headers.idempotencyKey = idempotencyKey;
  if (Object.keys(headers).length) payload.headers = headers;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`email_provider_${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { messageId?: unknown };
  if (typeof json.messageId !== 'string' || !json.messageId) throw new Error('no_provider_id');
  return { provider_id: json.messageId };
}

export function sendEmail(
  provider: EmailProvider,
  keys: EmailKeys,
  sender: EmailSender,
  replyTo: string,
  msg: OutboundMessage,
  idempotencyKey?: string,
): Promise<{ provider_id: string }> {
  if (provider === 'resend') {
    if (!keys.resend) return Promise.reject(new Error('no_email_key'));
    return resendSend(keys.resend, sender, replyTo, msg, idempotencyKey);
  }
  if (!keys.brevo) return Promise.reject(new Error('no_email_key'));
  return brevoSend(keys.brevo, sender, replyTo, msg, idempotencyKey);
}
