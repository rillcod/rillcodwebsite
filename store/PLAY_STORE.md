# Google Play — Rillcod Academy listing pack

Use these in [Google Play Console](https://play.google.com/console) when creating the app.

## App identity

| Field | Value |
|--------|--------|
| App name | Rillcod Academy |
| Package name | `com.rillcod.academy` |
| Default language | English (UK) or English (US) |
| App category | Education |
| Tags | STEM, coding, learning, school, ICT |
| Contact email | Use your support / privacy mailbox (e.g. privacy@rillcodacademy.com) |
| Website | https://www.rillcod.com |
| Privacy policy | https://www.rillcod.com/privacy-policy |

## Short description (≤ 80 characters)

Premier ICT & STEM learning for Nigerian schools — lessons, progress, and alerts.

## Full description

Rillcod Academy brings ICT and STEM education into one secure app for students, parents, teachers, and partner schools.

• Sign in once and open your dashboard  
• Track lessons, assignments, and results  
• Get optional alerts for classes, payments, and important updates  
• Enrol learners and manage learning on the go  

Built by Rillcod Technologies. The app uses a branded native shell with secure HTTPS access to your Rillcod account. Push notifications are optional and can be turned off in system settings.

Privacy: https://www.rillcod.com/privacy-policy  
Terms: https://www.rillcod.com/terms-of-service  

## Graphics checklist

- [ ] App icon 512×512 (PNG, no transparency for Play high-res)
- [ ] Feature graphic 1024×500
- [ ] Phone screenshots (min 2): splash/login, dashboard home, (optional) notifications/settings
- [ ] Use dark brand `#0f0f1a` + RILLCOD mark — keep UI clean, no clutter

## Data safety (Play Console answers)

**Does your app collect or share user data?** Yes  

Declare at least:

| Data type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| Name | Yes | No* | App functionality, account | No |
| Email | Yes | No* | App functionality, account | No |
| Phone | Yes (if provided) | No* | Account / support | Yes |
| User IDs | Yes | No* | Account | No |
| Device or other IDs (FCM push token) | Yes | Yes — Google Firebase Cloud Messaging | App functionality / messaging | Yes (user can deny notifications) |

\*Shared with infrastructure processors under contract (Supabase hosting, payment providers as needed). Do **not** mark as sold.  
For FCM: shared with **Google** to deliver notifications.

Also answer:
- Data encrypted in transit: **Yes**
- Users can request deletion: **Yes** (support / account channels)
- Independent security review: No (unless you have one)

## Content rating

Complete the IARC questionnaire honestly. Education app; if under-13 learners use it, declare appropriately and review Families / COPPA-style obligations.

## Release build (this repo)

1. Ensure `android/keystore.properties` exists (local, gitignored)  
2. `cd android && ./gradlew bundleRelease`  
3. Upload `android/app/build/outputs/bundle/release/app-release.aab`  
4. Prefer Play App Signing (Google holds app signing key; you keep upload key)

## Cloudflare production push secret

```bash
npx wrangler login
node scripts/set-cloudflare-fcm-secret.mjs
```

Then redeploy the site so production can send FCM.

## Closed testing

If Play requires it for new accounts: create a closed testing track, invite ≥20 testers, run ≥14 days, then request production.
