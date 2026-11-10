# SMS verification – open items before go-live

Status: 10.11.2026. The SMS verification (Twilio Verify) is **implemented and tested in the repository**, but **not live yet**. This file lists everything that still has to be done, in order.

What is already done (branch `claude/pensive-bardeen-je41f4` and `main`):

- Database migration `supabase/migrations/20261110120000_sms_bestaetigung.sql`
- Edge Function `supabase/functions/sms-verify/` (talks to Twilio)
- Form UI on all three giveaway pages (`web/ps5-gta6/`, `web/steuern/`, `web/buergenstock/`)
- Page texts (How it works, FAQ, terms, privacy) and post captions
- Tests: `supabase/tests/sms_tests.sql`, `supabase/tests/sms_verify_function.test.ts` (all passing locally)

Detailed setup steps (German) are in [UEBERGABE.md](UEBERGABE.md#sms-bestätigung-der-handynummer-twilio--stand-10112026).

---

## 1. Prerequisites (not specific to SMS, but blocking)

Nothing in this repository is connected to a live backend yet. Without these steps, neither the SMS verification nor the giveaway forms work in production.

- [ ] **Create the Supabase project** (or pick the existing one used by allnova).
- [ ] **Apply all migrations in order** (`supabase/migrations/*.sql`, oldest first). None of them has been applied to any Supabase project so far.
- [ ] **Enter `supabaseUrl` and `supabaseKey`** (publishable/anon key) in `web/assets/js/config.js`. While empty, all pages run in preview mode: no data is sent, SMS is simulated (code `123456`).
- [ ] **Set up email delivery** for the confirmation emails. Emails are queued in `private.email_outbox`; a mail service (e.g. Resend, Postmark or allnova's SMTP) has to send them and call `private.mark_email_sent(id)`. Without it, nobody can confirm their entry.

## 2. Twilio account (done by allnova)

- [ ] **Create a Twilio account and add credit.** A trial account can only send SMS to numbers verified in the console.
- [ ] **Create a Verify Service**: Console → Verify → Services → *Create new*.
  - Friendly name: `allnova` (this name appears in the SMS text)
  - Code length: 6
  - Note the **Service SID** (`VA…`).
- [ ] **Create an API key** (Account → API keys & tokens), or use Account SID + Auth Token. Note the SID and secret. Never put them in the website code.
- [ ] **Geo permissions**: Verify → Settings → allow **Switzerland only**. Block all other countries.
- [ ] **Fraud Guard**: leave it enabled (default).
- [ ] **Billing alerts**: set a monthly usage alert in the Twilio console (Account → Billing → Usage triggers).
- [ ] **Sign Twilio's Data Protection Addendum** (DPA) – required because phone numbers are processed in the USA.

## 3. Supabase deployment (done by the developer/hoster)

- [ ] **Apply the SMS migration** `supabase/migrations/20261110120000_sms_bestaetigung.sql` (after all earlier migrations). It enables SMS verification for `ps5-gta6-2026`, `steuern-2027` and `buergenstock-2026`.
- [ ] **Deploy the Edge Function** (Supabase CLI, run from the repo root):
  ```bash
  supabase functions deploy sms-verify --no-verify-jwt
  ```
  `--no-verify-jwt` is required because the pages call it without a login. The function checks the request origin; the database enforces the rate limits.
- [ ] **Set the secrets**:
  ```bash
  supabase secrets set TWILIO_VERIFY_SERVICE_SID=VA...
  supabase secrets set TWILIO_API_KEY_SID=SK... TWILIO_API_KEY_SECRET=...
  # or instead of the API key: TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=...
  ```
- [ ] **Allowed origins**: if the pages are served from a domain other than `https://gewinnspiel.allnova.ch`, `https://www.allnova.ch` or `https://allnova.ch`, set them (comma-separated):
  ```bash
  supabase secrets set ALLOWED_ORIGINS=https://gewinnspiel.allnova.ch,https://www.allnova.ch
  ```
- [ ] **Optional `smsVerifyUrl`** in `web/assets/js/config.js`: only needed if the function is not reachable at `<supabaseUrl>/functions/v1/sms-verify`.
- [ ] **Deploy the updated `web/` folder** to the hoster (changed files are listed in `UEBERGABE.md`).

## 4. Testing before go-live

- [ ] **Test without SMS costs**: `supabase secrets set SMS_TEST_CODE=1`. For giveaways in test mode (`test_mode = true`, not published) no SMS is sent and the code is always `123456`. This never applies to published giveaways.
- [ ] **End-to-end test with a real phone**: one full entry per giveaway (SMS code → submit → confirmation email → confirmation page).
- [ ] **Check the SMS text** on a real phone (sender name «allnova», language German).
- [ ] **Remove the test switch** before go-live: `supabase secrets unset SMS_TEST_CODE`.
- [ ] **Publish the campaigns** and check them once more in production.

## 5. Legal (done by allnova)

- [ ] **Update allnova's privacy policy**: phone number collection, SMS verification via Twilio (USA), purpose and retention. The giveaway pages already mention it in the form note and the privacy section.
- [ ] **Review the updated terms** on all three pages: «one entry per person and mobile number», entry only valid after confirming both the mobile number and the email address.
- [ ] **Add `privacyUrl`** in `web/assets/js/config.js` once the full privacy policy is online.

## 6. Decision needed: PS5 giveaway

The PS5 + GTA VI giveaway ends on **15.11.2026**. If it is already live on allnova.ch with another backend or an older version of this site:

- [ ] **Decide** whether SMS verification should still be switched on for the PS5 giveaway, or only for Steuern and Bürgenstock.
- [ ] If it stays off for PS5: `update public.campaigns set requires_phone_verification = false where slug = 'ps5-gta6-2026';` **and** keep the old PS5 page (without the mandatory mobile number field) online.
- [ ] If it is switched on: deploy the new page **and** the database change **at the same time**. Otherwise entries fail while one side is still on the old version.

## 7. Operations after go-live

- [ ] **Watch the costs** in the Twilio console during the first days (about USD 0.05 per successful verification plus the SMS fee to Switzerland; see twilio.com/verify/pricing).
- [ ] **Check the Edge Function logs** in Supabase for errors (`twilio start …` / `twilio check …` lines).
- [ ] **Adjust the limits if needed** (in `public.sms_verify_start`): currently 3 codes per number per 15 minutes, 6 per day, 10 per IP per hour, 300 per giveaway per hour.

---

## Reference: how it works

1. The visitor enters a mobile number and clicks «Code per SMS senden».
2. The page calls the Edge Function `sms-verify` (`action: start`). It checks the request with `public.sms_verify_start` (giveaway open, Swiss mobile number, rate limits) and asks Twilio Verify to send the code.
3. The visitor enters the code. The function (`action: check`) asks Twilio whether the code is correct. If it is, `public.sms_verify_approved` issues a one-time token, valid for 30 minutes.
4. The form sends the token with `submit_entry(…, p_phone_token)`. The entry is only accepted with a valid, unused token for exactly this number and giveaway, and `entries.phone_verified_at` is set.
5. The email confirmation (double opt-in) follows as before.

Phone numbers are stored only as hashes in the SMS tables, and those rows are deleted after 2 days. The phone number itself is stored on the entry, as before, and is removed when the campaign is anonymised.
