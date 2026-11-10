// Supabase Edge Function «sms-verify» (Deno). Deploy: supabase functions deploy sms-verify --no-verify-jwt
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (oder TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET),
//          TWILIO_VERIFY_SERVICE_SID, optional ALLOWED_ORIGINS, SMS_TEST_CODE=1 (nur für Tests, siehe handler.ts)
import { createHandler } from './handler.ts';

Deno.serve(createHandler(Deno.env.toObject()));
