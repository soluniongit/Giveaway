// Tests der Edge Function sms-verify mit simuliertem Twilio und simulierter Datenbank.
// Ausführen: node supabase/tests/sms_verify_function.test.ts   (Node ≥ 22.18, kein Twilio-Konto nötig)
import { createHandler } from '../functions/sms-verify/handler.ts';
import assert from 'node:assert/strict';
const calls: any[] = [];
let twilioCheckStatus = 'approved';
let twilioStartCode: number | null = null;
const fakeFetch = async (url: string, init: any) => {
  calls.push({ url, init });
  const body = init.body;
  if (url.includes('/rpc/sms_verify_start')) {
    const b = JSON.parse(body);
    if (b.p_phone.includes('44 ')) return new Response(JSON.stringify({ ok: false, error: 'phone_not_mobile' }));
    return new Response(JSON.stringify({ ok: true, phone: '+41791234567', test: b.p_campaign === 'testkampagne' }));
  }
  if (url.includes('/rpc/sms_verify_approved')) return new Response(JSON.stringify({ ok: true, token: 'tok123', phone: '+41791234567' }));
  if (url.includes('/rpc/get_campaign')) { const b = JSON.parse(body); return new Response(JSON.stringify({ ok: true, campaign: { status: b.p_campaign === 'testkampagne' ? 'draft' : 'published', test_mode: true } })); }
  if (url.endsWith('/Verifications')) {
    assert.equal(init.headers.Authorization, 'Basic ' + btoa('ACx:secret'));
    assert.match(body, /To=%2B41791234567&Channel=sms&Locale=de/);
    if (twilioStartCode) return new Response(JSON.stringify({ code: twilioStartCode, message: 'x' }), { status: 429 });
    return new Response(JSON.stringify({ status: 'pending' }), { status: 201 });
  }
  if (url.endsWith('/VerificationCheck')) {
    if (twilioCheckStatus === '404') return new Response(JSON.stringify({ code: 20404 }), { status: 404 });
    return new Response(JSON.stringify({ status: twilioCheckStatus }), { status: 200 });
  }
  throw new Error('unexpected ' + url);
};
const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srk', TWILIO_ACCOUNT_SID: 'ACx', TWILIO_AUTH_TOKEN: 'secret', TWILIO_VERIFY_SERVICE_SID: 'VA1', SMS_TEST_CODE: '1' };
const h = createHandler(env, fakeFetch as any);
const post = (b: any, origin = 'https://gewinnspiel.allnova.ch') => h(new Request('https://f/sms-verify', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, body: JSON.stringify(b) }));
const j = async (r: Response) => ({ status: r.status, body: await r.json(), cors: r.headers.get('access-control-allow-origin') });

let r = await j(await post({ action: 'start', campaign: 'ps5-gta6-2026', phone: '079 123 45 67' }));
assert.deepEqual(r.body, { ok: true, phone: '+41791234567' }); assert.equal(r.cors, 'https://gewinnspiel.allnova.ch');
assert.equal(JSON.parse(calls[0].init.body).p_ip, '1.2.3.4');
r = await j(await post({ action: 'start', campaign: 'ps5-gta6-2026', phone: '044 123 45 67' }));
assert.equal(r.body.error, 'phone_not_mobile');
twilioStartCode = 60203; r = await j(await post({ action: 'start', campaign: 'ps5-gta6-2026', phone: '079 123 45 67' })); assert.equal(r.body.error, 'rate_limited'); twilioStartCode = null;
r = await j(await post({ action: 'check', campaign: 'ps5-gta6-2026', phone: '079 123 45 67', code: '12 34 56' }));
assert.deepEqual(r.body, { ok: true, token: 'tok123', phone: '+41791234567' });
twilioCheckStatus = 'pending'; r = await j(await post({ action: 'check', campaign: 'ps5-gta6-2026', phone: '079 123 45 67', code: '000000' })); assert.equal(r.body.error, 'invalid_code');
twilioCheckStatus = '404'; r = await j(await post({ action: 'check', campaign: 'ps5-gta6-2026', phone: '079 123 45 67', code: '000000' })); assert.equal(r.body.error, 'code_expired');
r = await j(await post({ action: 'check', campaign: 'ps5-gta6-2026', phone: '079 123 45 67', code: 'abc' })); assert.equal(r.body.error, 'invalid_code');
// Testcode nur für Testkampagnen
const n = calls.length;
r = await j(await post({ action: 'start', campaign: 'testkampagne', phone: '079 123 45 67' })); assert.equal(r.body.test, true);
assert.ok(!calls.slice(n).some((c) => c.url.includes('twilio')), 'no twilio in test mode');
r = await j(await post({ action: 'check', campaign: 'testkampagne', phone: '079 123 45 67', code: '123456' })); assert.equal(r.body.ok, true);
r = await j(await post({ action: 'check', campaign: 'testkampagne', phone: '079 123 45 67', code: '654321' })); assert.equal(r.body.error, 'invalid_code');
// Fremde Herkunft, falsche Methode, kaputter Body
r = await j(await post({ action: 'start', campaign: 'ps5-gta6-2026', phone: '079 123 45 67' }, 'https://evil.example')); assert.equal(r.status, 403);
r = await j(await h(new Request('https://f/', { method: 'GET' }))); assert.equal(r.status, 405);
r = await j(await h(new Request('https://f/', { method: 'POST', body: '{' }))); assert.equal(r.status, 400);
r = await j(await post({ action: 'start', campaign: 'BAD SLUG', phone: '079' })); assert.equal(r.status, 400);
const o = await h(new Request('https://f/', { method: 'OPTIONS', headers: { origin: 'https://gewinnspiel.allnova.ch' } })); assert.equal(o.status, 204);
console.log('ALL EDGE FUNCTION TESTS PASSED');
