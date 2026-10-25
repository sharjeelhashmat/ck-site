// PR 2c item 4a (gap G05): every POST body is read as a byte stream and cut off at the route's limit (8192 bytes, /profile
// 4096) with 413 before anything is parsed; a Content-Length above the limit is refused before reading; a 413 carries the
// same CORS header as the route's normal answers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { baseEnv, clearDb, ORIGIN, rows, stubFetch, type Call } from './helpers';

let calls: Call[] = [];
beforeEach(async () => { calls = []; await clearDb(); stubFetch(calls); });
afterEach(() => vi.unstubAllGlobals());

const MAX = 8192;
// "é" is 2 bytes in UTF-8: a JSON body of n of them is about 2n bytes but only n characters long.
const jsonOfBytes = (bytes: number) => {
  const shell = JSON.stringify({ pad: '' });
  const n = bytes - new TextEncoder().encode(shell).length;
  const body = JSON.stringify({ pad: 'é'.repeat(Math.floor(n / 2)) + 'x'.repeat(n % 2) });
  expect(new TextEncoder().encode(body).length).toBe(bytes);
  return body;
};
const formOfBytes = (bytes: number) => {
  const prefix = 'detail=';
  const n = bytes - prefix.length;
  const body = prefix + '%C3%A9'.repeat(Math.floor(n / 6)) + 'x'.repeat(n % 6);
  expect(new TextEncoder().encode(body).length).toBe(bytes);
  return body;
};
const stream = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  return new ReadableStream<Uint8Array>({
    start(c) { for (let i = 0; i < bytes.length; i += 1000) c.enqueue(bytes.slice(i, i + 1000)); c.close(); },
  });
};

const JSON_ROUTES = [
  { path: '/lead', max: MAX, cors: true },
  { path: '/api/newsletter/subscribe', max: MAX, cors: true },
  { path: '/profile', max: 4096, cors: true },
] as const;
const FORM_ROUTES = ['/unsubscribe', '/api/newsletter/unsubscribe', '/api/newsletter/unsubscribe/feedback'] as const;

const send = (path: string, body: BodyInit, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`https://api.test${path}`, { method: 'POST', headers: { origin: ORIGIN, ...headers }, body }), baseEnv());

describe('body limit counts bytes, not characters', () => {
  for (const r of JSON_ROUTES) {
    it(`${r.path}: multibyte body one byte over the limit is 413 with CORS; exactly at the limit is not 413`, async () => {
      const over = await send(r.path, jsonOfBytes(r.max + 1), { 'content-type': 'application/json' });
      expect(over.status).toBe(413);
      expect(await over.json()).toEqual({ ok: false, error: 'too_large' });
      expect(over.headers.get('access-control-allow-origin')).toBe(ORIGIN);
      const at = await send(r.path, jsonOfBytes(r.max), { 'content-type': 'application/json' });
      expect(at.status).not.toBe(413);
    });

    it(`${r.path}: a streamed body (no Content-Length) is cut off at the limit`, async () => {
      const over = await send(r.path, stream(jsonOfBytes(r.max + 1)), { 'content-type': 'application/json' });
      expect(over.status).toBe(413);
      expect(over.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    });

    it(`${r.path}: a Content-Length above the limit is refused before the body is read`, async () => {
      let pulled = false;
      const body = new ReadableStream<Uint8Array>({ pull(c) { pulled = true; c.enqueue(new TextEncoder().encode('{}')); c.close(); } });
      const res = await send(r.path, body, { 'content-type': 'application/json', 'content-length': String(r.max + 1) });
      expect(res.status).toBe(413);
      expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
      expect(pulled).toBe(false);
    });
  }

  for (const path of FORM_ROUTES) {
    it(`${path}: multibyte form one byte over 8192 is 413; at the limit is not`, async () => {
      const type = { 'content-type': 'application/x-www-form-urlencoded' };
      expect((await send(path, formOfBytes(MAX + 1), type)).status).toBe(413);
      expect((await send(path, stream(formOfBytes(MAX + 1)), type)).status).toBe(413);
      expect((await send(path, formOfBytes(MAX), type)).status).not.toBe(413);
    });
  }

  it('nothing is stored and siteverify is never called for an oversized enquiry', async () => {
    await send('/lead', jsonOfBytes(MAX + 1), { 'content-type': 'application/json' });
    expect(calls).toHaveLength(0);
    expect(await rows('SELECT id FROM leads')).toHaveLength(0);
  });
});
