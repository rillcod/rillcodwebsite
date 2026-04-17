# Rillcod Academy - Setup Guide

## Date: April 17, 2026

This guide covers the setup and configuration of all functions, edge functions, and cron jobs.

---

## Environment Variables Setup

### Required Variables

Copy `.env.example` to `.env.local` and fill in these values:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Paystack Configuration
PAYSTACK_SECRET_KEY=sk_live_your_secret_key
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_your_public_key

# Cron Job Secrets (generate random secure strings)
CRON_SECRET=your-random-secret-string-here
BILLING_CRON_SECRET=your-random-billing-secret-here

# Application URLs
NEXT_PUBLIC_APP_URL=https://rillcod.com
MOBILE_APP_URL=rillcod://

# Optional: Admin Operations
ADMIN_OPS_EMAIL=admin@rillcod.com

# Optional: SendPulse (for external emails)
SENDPULSE_API_ID=your-api-id
SENDPULSE_API_SECRET=your-api-secret

# Optional: Stripe (if using Stripe payments)
STRIPE_SECRET_KEY=sk_live_your_stripe_key

# Feature Flags
ENABLE_PAYMENTS=true
```

### Generating Secure Secrets

For `CRON_SECRET` and `BILLING_CRON_SECRET`, generate random secure strings:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32

# Using Python
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Cron Jobs Setup

### Vercel Cron Configuration

Create or update `vercel.json` in your project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/billing-reminders",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/invoice-reminders",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/live-session-reminders",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/process-notifications",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/streak-reminder",
      "schedule": "0 17 * * *"
    },
    {
      "path": "/api/cron/term-scheduler",
      "schedule": "0 5 * * 1"
    },
    {
      "path": "/api/cron/weekly-summary",
      "schedule": "0 17 * * 5"
    }
  ]
}
```

### Cron Schedule Explanations

1. **billing-reminders**: Daily at 8:00 AM UTC (9:00 AM WAT)
   - Sends billing reminders for weeks 6, 7, 8 of term
   - Handles auto-rollover for paid cycles

2. **invoice-reminders**: Daily at 8:00 AM UTC (9:00 AM WAT)
   - Three-stage reminder system
   - Auto-marks overdue invoices

3. **live-session-reminders**: Every 15 minutes
   - Sends reminders for upcoming live sessions

4. **process-notifications**: Every 5 minutes
   - Processes notification queue (batch of 10)

5. **streak-reminder**: Daily at 5:00 PM UTC (6:00 PM WAT)
   - Reminds students to maintain learning streaks

6. **term-scheduler**: Mondays at 5:00 AM UTC (6:00 AM WAT)
   - Auto-releases weekly lessons and assignments

7. **weekly-summary**: Fridays at 5:00 PM UTC (6:00 PM WAT)
   - Sends parent weekly activity summaries

### Manual Cron Triggers

All cron jobs support manual triggering via POST with the secret:

```bash
# Using curl
curl -X POST https://rillcod.com/api/cron/billing-reminders \
  -H "x-cron-secret: your-secret-here"

# Or using Authorization header
curl -X POST https://rillcod.com/api/cron/invoice-reminders \
  -H "Authorization: Bearer your-secret-here"
```

### Cron Job Monitoring

Check cron job logs in Vercel dashboard:
1. Go to your project in Vercel
2. Click "Logs" tab
3. Filter by function name (e.g., `/api/cron/billing-reminders`)

---

## Edge Functions Setup

### Paystack Webhook Configuration

#### 1. Deploy Edge Function

The edge function is already in `supabase/functions/paystack-webhook/index.ts`.

Deploy it:

```bash
# Login to Supabase CLI
npx supabase login

# Link your project
npx supabase link --project-ref your-project-ref

# Deploy the function
npx supabase functions deploy paystack-webhook
```

#### 2. Configure Secrets

Set secrets in Supabase Dashboard:

1. Go to Edge Functions → paystack-webhook → Settings
2. Add these secrets:

```
PAYSTACK_SECRET_KEY=sk_live_your_secret_key
EDGE_SERVICE_ROLE_KEY=your-service-role-key
```

Optional secrets for forwarding mode:

```
PAYSTACK_WEBHOOK_FORWARD_URL=https://rillcod.com/api/payments/webhook
APP_URL=https://rillcod.com
PAYMENT_WEBHOOK_INTERNAL_SECRET=your-internal-secret
RECEIPT_CALLBACK_URL=https://rillcod.com/api/payments/internal/generate-receipt
```

#### 3. Configure Paystack Webhook

1. Go to Paystack Dashboard → Settings → Webhooks
2. Add webhook URL: `https://your-project.supabase.co/functions/v1/paystack-webhook`
3. Select events: `charge.success`
4. Save

#### 4. Test Webhook

```bash
# Test GET endpoint
curl https://your-project.supabase.co/functions/v1/paystack-webhook

# Should return:
# {"ok":true,"service":"paystack-webhook","hint":"POST webhooks from Paystack..."}
```

### Edge Function Modes

The webhook supports two modes:

**Forwarding Mode** (Recommended for Next.js):
- Set `PAYSTACK_WEBHOOK_FORWARD_URL` or `APP_URL`
- Webhook forwards to your Next.js API route
- Next.js handles business logic

**Inline Mode** (Standalone):
- Don't set forwarding URLs
- Set `EDGE_SERVICE_ROLE_KEY`
- Edge function processes directly

---

## Database Functions (RPC)

All RPC functions are created via migrations. Ensure all migrations are applied:

```bash
# Check migration status
npx supabase db diff

# Apply pending migrations
npx supabase db push
```

### Key RPC Functions

**Dashboard Functions:**
- `get_teacher_dashboard_stats(teacher_uuid)` - Teacher dashboard data
- `get_student_dashboard_stats(student_uuid)` - Student dashboard data
- `get_school_dashboard_stats(school_uuid, school_name)` - School dashboard data
- `get_dashboard_activity(role, uuid, limit)` - Activity feed

**Payment Functions:**
- `process_payment_atomic(reference, invoice_id, amount)` - Atomic payment processing

**Analytics Functions:**
- `get_at_risk_students(school_id, class_id)` - At-risk student detection

**Timetable Functions:**
- `check_timetable_conflicts(slot_jsonb)` - Conflict detection

---

## Verification Checklist

### Environment Variables
- [ ] All required variables set in `.env.local`
- [ ] Secrets generated and configured
- [ ] Vercel environment variables synced

### Cron Jobs
- [ ] `vercel.json` configured with cron schedules
- [ ] Cron secrets set in Vercel dashboard
- [ ] Test manual trigger for each cron job
- [ ] Verify cron logs in Vercel dashboard

### Edge Functions
- [ ] Edge function deployed to Supabase
- [ ] Secrets configured in Supabase dashboard
- [ ] Webhook URL added to Paystack dashboard
- [ ] Test webhook with GET request
- [ ] Test webhook with Paystack test event

### Database Functions
- [ ] All migrations applied
- [ ] RPC functions exist in database
- [ ] Permissions granted correctly
- [ ] Test key functions from API routes

### Monitoring
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure log aggregation
- [ ] Set up uptime monitoring
- [ ] Create alerting rules

---

## Troubleshooting

### Cron Jobs Not Running

1. Check Vercel logs for errors
2. Verify `CRON_SECRET` matches in both places
3. Ensure cron schedule is valid (use crontab.guru)
4. Check function timeout limits (max 10s on Hobby plan)

### Edge Function Errors

1. Check Supabase Edge Function logs
2. Verify secrets are set correctly
3. Test with curl to see exact error
4. Check CORS headers if calling from browser

### RPC Function Errors

1. Check Supabase logs for SQL errors
2. Verify function exists: `SELECT * FROM pg_proc WHERE proname = 'function_name'`
3. Check permissions: `SELECT * FROM information_schema.routine_privileges WHERE routine_name = 'function_name'`
4. Test function directly in SQL editor

### Payment Webhook Issues

1. Verify HMAC signature is correct
2. Check Paystack webhook logs
3. Test with Paystack webhook tester
4. Ensure transaction exists before webhook fires

---

## Security Best Practices

1. **Never commit secrets** - Use `.env.local` (gitignored)
2. **Rotate secrets regularly** - Update cron secrets every 90 days
3. **Use service_role sparingly** - Only for admin operations
4. **Validate all inputs** - Even from trusted sources
5. **Log security events** - Track failed auth attempts
6. **Monitor webhook signatures** - Alert on signature failures
7. **Rate limit endpoints** - Prevent abuse
8. **Use HTTPS only** - No HTTP in production

---

## Support

For issues or questions:
- Email: support@rillcod.com
- Documentation: https://docs.rillcod.com
- GitHub Issues: https://github.com/rillcod/academy/issues

---

**Last Updated:** April 17, 2026
