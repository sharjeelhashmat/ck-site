import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutboundMessage } from '../src/pipeline';
import { RESEND_USER_AGENT, brevoSend, resendSend, sendEmail } from '../src/send';

const msg: OutboundMessage = { stream: 'leads', to: 'amira@example.com', toName: 'Amira Khan', subject: 'Received', text: 'Body text', listUnsubscribe: 'https://api.example.com/unsubscribe?e=a&t=b' };
const sender = { email: 'hello@mail.sharjeelhashmat.com', name: 'Sharjeel Hashmat' };

interface Call { url: string; init: RequestInit }
const calls: Call[] = [];
function stub(status = 200, body: unknown = { id: 'r-1', messageId: 'b-1' }) {
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('resendSend', () => {
  it('posts plain text with from, to, reply_to and List-Unsubscribe', async () => {
    stub();
    const r = await resendSend('re_test', sender, 'hello@sharjeelhashmat.com', msg);
    expect(r.provider_id).toBe('r-1');
    const c = calls[0]!;
    expect(c.url).toBe('https://api.resend.com/emails');
    expect((c.init.headers as Record<string, string>).authorization).toBe('Bearer re_test');
    expect((c.init.headers as Record<string, string>)['user-agent']).toBe(RESEND_USER_AGENT);
    const p = JSON.parse(c.init.body as string);
    expect(p).toMatchObject({ from: 'Sharjeel Hashmat <hello@mail.sharjeelhashmat.com>', to: ['amira@example.com'], subject: 'Received', text: 'Body text', reply_to: 'hello@sharjeelhashmat.com' });
    expect(p.headers['List-Unsubscribe']).toBe('<https://api.example.com/unsubscribe?e=a&t=b>');
    expect(p.html).toBeUndefined();
  });
  it('omits the unsubscribe header when the message has none', async () => {
    stub();
    await resendSend('k', sender, 'r@x.com', { ...msg, listUnsubscribe: undefined });
    expect(JSON.parse(calls[0]!.init.body as string).headers).toBeUndefined();
  });
  it('strips characters that could break the From header', async () => {
    stub();
    await resendSend('k', { email: sender.email, name: 'Evil"\r\nBcc: x <y>' }, 'r@x.com', msg);
    const from = JSON.parse(calls[0]!.init.body as string).from as string;
    expect(from).not.toMatch(/[\r\n"]/);
    expect(from.endsWith(' <hello@mail.sharjeelhashmat.com>')).toBe(true);
  });
  it('throws on a provider error without leaking the body', async () => {
    stub(422, { message: 'domain not verified' });
    await expect(resendSend('k', sender, 'r@x.com', msg)).rejects.toThrow('email_provider_422');
  });
});

describe('brevoSend and dispatch', () => {
  it('brevo payload shape is unchanged', async () => {
    stub();
    await brevoSend('bk', sender, 'r@x.com', msg);
    const p = JSON.parse(calls[0]!.init.body as string);
    expect(calls[0]!.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(p).toMatchObject({ sender, to: [{ email: 'amira@example.com', name: 'Amira Khan' }], textContent: 'Body text' });
  });
  it('sendEmail routes by provider and needs that provider\'s key', async () => {
    stub();
    await sendEmail('resend', { resend: 'a', brevo: 'b' }, sender, 'r@x.com', msg);
    await sendEmail('brevo', { resend: 'a', brevo: 'b' }, sender, 'r@x.com', msg);
    expect(calls.map((c) => c.url)).toEqual(['https://api.resend.com/emails', 'https://api.brevo.com/v3/smtp/email']);
    await expect(sendEmail('resend', { brevo: 'b' }, sender, 'r@x.com', msg)).rejects.toThrow('no_email_key');
    await expect(sendEmail('brevo', { resend: 'a' }, sender, 'r@x.com', msg)).rejects.toThrow('no_email_key');
    expect(calls).toHaveLength(2);
  });
});
