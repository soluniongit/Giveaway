/**
 * SMS-Bestätigung der Telefonnummer über Twilio Verify (Logik, ohne Deno-spezifischen Code → testbar).
 *
 * POST { action: 'start', campaign, phone }        → SMS mit Code senden
 * POST { action: 'check', campaign, phone, code }  → Code prüfen; bei Erfolg Einmal-Token für submit_entry
 * Antwort immer JSON: { ok: true, … } oder { ok: false, error: '<code>' }
 *
 * Rate-Limits, Kampagnenprüfung und Token liegen in der Datenbank (public.sms_verify_start / sms_verify_approved,
 * nur mit service_role aufrufbar). Twilio-Zugangsdaten bleiben in den Secrets der Edge Function.
 */

export type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const PHONE_RE = /^\+417[4-9]\d{7}$/;
const CODE_RE = /^\d{4,10}$/;
const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const TEST_CODE = '123456';

export function createHandler(env: Env, fetchImpl: Fetch = fetch) {
  const origins = (env.ALLOWED_ORIGINS || 'https://gewinnspiel.allnova.ch,https://www.allnova.ch,https://allnova.ch')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const cors = (origin: string | null): Record<string, string> => {
    const allow = origin && (origins.includes('*') || origins.includes(origin)) ? origin : origins[0];
    return {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
  };
  const json = (body: unknown, origin: string | null, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

  async function rpc(fn: string, body: unknown) {
    const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
    const res = await fetchImpl(`${(env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`rpc ${fn}: ${res.status}`);
    return res.json();
  }

  async function twilio(path: string, form: Record<string, string>) {
    const user = env.TWILIO_API_KEY_SID || env.TWILIO_ACCOUNT_SID || '';
    const pass = env.TWILIO_API_KEY_SECRET || env.TWILIO_AUTH_TOKEN || '';
    const res = await fetchImpl(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data as Record<string, unknown> };
  }

  // Twilio-Fehlercodes → Fehler fürs Formular
  const twilioError = (code: unknown, fallback: string) => {
    switch (Number(code)) {
      case 60200: case 21211: case 21614: return 'invalid_phone';
      case 60205: return 'phone_not_mobile';
      case 60203: case 60202: case 20429: return 'rate_limited';
      case 60410: case 60605: return 'blocked';
      case 20404: return 'code_expired';
      default: return fallback;
    }
  };

  // Testcode nur, wenn ausdrücklich eingeschaltet UND das Gewinnspiel im Testmodus ist (nicht veröffentlicht)
  const fakeAllowed = env.SMS_TEST_CODE === '1';
  async function isTestCampaign(slug: string) {
    const r = await rpc('get_campaign', { p_campaign: slug });
    return !!(r?.ok && r.campaign?.status !== 'published' && r.campaign?.test_mode);
  }

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get('origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, origin, 405);
    if (origin && !origins.includes('*') && !origins.includes(origin)) return json({ ok: false, error: 'forbidden' }, origin, 403);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_request' }, origin, 400); }
    const action = String(body.action || '');
    const campaign = String(body.campaign || '');
    const phoneRaw = String(body.phone || '').slice(0, 30);
    if (!SLUG_RE.test(campaign) || !phoneRaw) return json({ ok: false, error: 'bad_request' }, origin, 400);

    try {
      if (action === 'start') {
        const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || null;
        const r = await rpc('sms_verify_start', { p_campaign: campaign, p_phone: phoneRaw, p_ip: ip });
        if (!r?.ok) return json({ ok: false, error: r?.error || 'failed' }, origin);
        const phone = String(r.phone);
        if (!PHONE_RE.test(phone)) return json({ ok: false, error: 'phone_not_mobile' }, origin);
        if (fakeAllowed && r.test) return json({ ok: true, phone, test: true }, origin);
        const t = await twilio('Verifications', { To: phone, Channel: 'sms', Locale: 'de' });
        if (t.status >= 300) {
          console.error('twilio start', t.status, t.data?.code, t.data?.message);
          return json({ ok: false, error: twilioError(t.data?.code, 'sms_failed') }, origin);
        }
        return json({ ok: true, phone }, origin);
      }

      if (action === 'check') {
        const code = String(body.code || '').replace(/\s/g, '');
        if (!CODE_RE.test(code)) return json({ ok: false, error: 'invalid_code' }, origin);
        // Nummer gleich normalisieren wie die DB (über sms_verify_approved erst nach erfolgreicher Prüfung)
        const phone = normPhone(phoneRaw);
        if (!phone || !PHONE_RE.test(phone)) return json({ ok: false, error: 'invalid_phone' }, origin);
        let approved = false;
        if (fakeAllowed && await isTestCampaign(campaign)) {
          approved = code === TEST_CODE;
        } else {
          const t = await twilio('VerificationCheck', { To: phone, Code: code });
          if (t.status >= 300) {
            console.error('twilio check', t.status, t.data?.code, t.data?.message);
            return json({ ok: false, error: twilioError(t.data?.code, 'sms_failed') }, origin);
          }
          approved = t.data?.status === 'approved';
        }
        if (!approved) return json({ ok: false, error: 'invalid_code' }, origin);
        const r = await rpc('sms_verify_approved', { p_campaign: campaign, p_phone: phone });
        if (!r?.ok) return json({ ok: false, error: r?.error || 'failed' }, origin);
        return json({ ok: true, token: r.token, phone: r.phone }, origin);
      }

      return json({ ok: false, error: 'bad_request' }, origin, 400);
    } catch (e) {
      console.error('sms-verify', e);
      return json({ ok: false, error: 'failed' }, origin, 500);
    }
  };
}

/** wie private.norm_phone / core.js normPhone */
export function normPhone(raw: string): string | null {
  let p = String(raw || '').replace(/[^0-9+]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  if (/^0[1-9]/.test(p)) p = `+41${p.slice(1)}`;
  p = p.replace(/^\+410/, '+41');
  if (!/^\+[1-9]\d{7,14}$/.test(p)) return null;
  if (p.startsWith('+41') && !/^\+41[1-9]\d{8}$/.test(p)) return null;
  return p;
}
