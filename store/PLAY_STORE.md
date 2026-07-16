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
| Name | Yes | No* | App functionality, account management | No |
| Email | Yes | No* | App functionality, account management | No |
| Phone | Yes (if provided) | No* | Account / support | Yes |
| User IDs | Yes | No* | Account management | No |
| Date of birth | Yes | No* | App functionality, account management (student registration) | No |
| Gender | Yes | No* | App functionality (personalised reports) | Yes |
| Location (City/State) | Yes | No* | App functionality (school matching) | Yes |
| School affiliation | Yes | No* | App functionality (class enrollment) | No |
| Academic grades & performance | Yes | No* | App functionality (educational progress tracking) | No |
| Payment transaction data | Yes | Yes — Paystack, Stripe† | Payment processing | No (for paying users) |
| Parent-child relationship data | Yes | No* | App functionality (parental access to child records) | No |
| Device or other IDs (FCM push token) | Yes | Yes — Google Firebase Cloud Messaging | App functionality / messaging | Yes (user can deny notifications) |

\*Shared with infrastructure processors under contract (Supabase hosting). Do **not** mark as sold.
†Payment transaction data is shared with **Paystack** and/or **Stripe** as payment processors under contract, solely for processing payments. Do **not** mark as sold.
For FCM: shared with **Google** to deliver notifications.

Also answer:
- Data encrypted in transit: **Yes**
- Users can request deletion: **Yes** (support / account channels)
- Independent security review: No (unless you have one)

## Payment classification (Google Play Billing exemption)

> [!IMPORTANT]
> All payments processed through Rillcod Academy are for **real-world education services delivered at physical partner schools** — not for digital content, features, or goods consumed within the app itself.

Rillcod Academy connects students and parents with partner schools that provide in-person ICT and STEM instruction. Payments cover:

- **Tuition and enrolment fees** for physical classes at partner schools
- **Examination and assessment fees** for in-person examinations
- **Materials and lab fees** for physical learning resources used at school premises

These are **physical-world services** that exist independently of the app. The app serves as a convenient portal for enrolment, payment, and progress tracking — it does not gate access to digital content behind a paywall.

Under [Google Play's Payments policy](https://support.google.com/googleplay/android-developer/answer/10281818), apps that sell physical goods or real-world services are **exempt from Google Play Billing requirements** and may use alternative payment processors (Paystack, Stripe).

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
