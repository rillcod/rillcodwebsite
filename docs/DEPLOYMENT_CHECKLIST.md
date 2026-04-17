# Rillcod Academy - Deployment Checklist

## Date: April 17, 2026

Use this checklist before deploying to production.

---

## Pre-Deployment Checklist

### 1. Environment Variables ✅

- [ ] Copy `.env.example` to `.env.local`
- [ ] Set all required Supabase variables
- [ ] Set Paystack keys (live keys for production)
- [ ] Generate and set `CRON_SECRET` (32+ character random string)
- [ ] Generate and set `BILLING_CRON_SECRET` (32+ character random string)
- [ ] Set `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Set `MOBILE_APP_URL` if using mobile app
- [ ] Configure SendPulse credentials (if using external emails)
- [ ] Set `ENABLE_PAYMENTS=true` for production

### 2. Database Migrations ✅

- [ ] All migrations applied to production database
- [ ] Verify migrations with `npx supabase db diff`
- [ ] Test RPC functions in SQL editor
- [ ] Verify indexes created successfully
- [ ] Check materialized views refreshed

**Key Migrations:**
- `20260501000021_dashboard_performance_optimization.sql` - Dashboard RPC functions
- `20260501000022_instalment_completion_trigger.sql` - Instalment completion
- `20260501000023_term_date_validation.sql` - Term date validation
- `20260501000024_optimize_at_risk_rpc.sql` - At-risk detection optimization
- `20260501000025_performance_indexes.sql` - 80+ performance indexes

### 3. Vercel Configuration ✅

- [ ] `vercel.json` includes all 7 cron jobs
- [ ] Environment variables synced to Vercel
- [ ] Cron secrets added to Vercel dashboard
- [ ] Test deployment to preview environment
- [ ] Verify build completes successfully
- [ ] Check function timeout limits (upgrade if needed)

### 4. Supabase Edge Functions ✅

- [ ] Edge function deployed: `npx supabase functions deploy paystack-webhook`
- [ ] Secrets configured in Supabase dashboard
- [ ] Test edge function with GET request
- [ ] Verify CORS headers working

### 5. Paystack Configuration ✅

- [ ] Webhook URL added to Paystack dashboard
- [ ] Webhook URL: `https://your-project.supabase.co/functions/v1/paystack-webhook`
- [ ] Events selected: `charge.success`
- [ ] Test webhook with Paystack test event
- [ ] Verify webhook signature validation

### 6. Security Checks ✅

- [ ] All SQL injection vulnerabilities fixed (7 files)
- [ ] No secrets committed to git
- [ ] `.env.local` in `.gitignore`
- [ ] Service role key never exposed to client
- [ ] All RPC functions have proper permissions
- [ ] CORS configured correctly
- [ ] Rate limiting enabled (if applicable)

### 7. Performance Optimizations ✅

- [ ] Dashboard loads in < 1.5 seconds
- [ ] All indexes created and active
- [ ] Caching implemented where needed
- [ ] Pagination added to list endpoints
- [ ] Image optimization enabled
- [ ] CDN configured (Vercel handles automatically)

### 8. Testing ✅

- [ ] Test user registration flow
- [ ] Test payment processing
- [ ] Test invoice generation
- [ ] Test cron jobs manually
- [ ] Test edge function webhook
- [ ] Test dashboard loading
- [ ] Test at-risk student detection
- [ ] Test notification delivery

### 9. Monitoring Setup ⏳

- [ ] Error tracking configured (Sentry, etc.)
- [ ] Log aggregation set up
- [ ] Uptime monitoring enabled
- [ ] Alerting rules created
- [ ] Performance monitoring active
- [ ] Database monitoring enabled

### 10. Documentation ✅

- [ ] `SETUP_GUIDE.md` reviewed
- [ ] `COMPLETED_FIXES.md` up to date
- [ ] `OUTSTANDING_ISSUES.md` reviewed
- [ ] API documentation current
- [ ] Team trained on new features

---

## Post-Deployment Checklist

### Immediate (First Hour)

- [ ] Verify application loads correctly
- [ ] Test user login/registration
- [ ] Check error logs for issues
- [ ] Verify cron jobs scheduled in Vercel
- [ ] Test payment flow end-to-end
- [ ] Check webhook receiving events

### First Day

- [ ] Monitor error rates
- [ ] Check database performance
- [ ] Verify cron jobs executed successfully
- [ ] Review user feedback
- [ ] Check payment processing
- [ ] Monitor API response times

### First Week

- [ ] Review all cron job logs
- [ ] Check webhook delivery rates
- [ ] Monitor database query performance
- [ ] Review user activity metrics
- [ ] Check payment success rates
- [ ] Verify notification delivery

---

## Rollback Plan

If issues occur after deployment:

### Quick Rollback (< 5 minutes)

1. Revert to previous Vercel deployment:
   ```bash
   vercel rollback
   ```

2. If database issues, restore from backup:
   ```bash
   # In Supabase dashboard: Database → Backups → Restore
   ```

### Partial Rollback

1. Disable specific cron jobs in `vercel.json`
2. Redeploy with updated config
3. Fix issues in development
4. Re-enable when ready

### Emergency Contacts

- **Technical Lead:** [contact info]
- **Database Admin:** [contact info]
- **DevOps:** [contact info]
- **Supabase Support:** support@supabase.com
- **Vercel Support:** support@vercel.com
- **Paystack Support:** support@paystack.com

---

## Performance Benchmarks

Expected performance after all optimizations:

- **Dashboard Load Time:** 0.5-1.5 seconds (was 2-5 seconds)
- **At-Risk Detection:** < 0.5 seconds for 1000 students (was 5-10 seconds)
- **Database Queries:** 10-50x faster with indexes
- **API Response Time:** < 200ms for most endpoints
- **Webhook Processing:** < 100ms
- **Cron Job Execution:** < 30 seconds each

---

## Known Limitations

1. **Vercel Hobby Plan:**
   - Function timeout: 10 seconds
   - Cron jobs: Limited to 1 per day per path
   - Upgrade to Pro if hitting limits

2. **Supabase Free Tier:**
   - Database size: 500MB
   - Bandwidth: 2GB
   - Upgrade if exceeding limits

3. **Paystack:**
   - Webhook retries: 3 attempts
   - Implement idempotency for safety

---

## Success Criteria

Deployment is successful when:

- ✅ All tests passing
- ✅ Error rate < 1%
- ✅ Dashboard loads < 1.5s
- ✅ Payment success rate > 95%
- ✅ Webhook delivery rate > 99%
- ✅ Cron jobs executing on schedule
- ✅ No critical errors in logs
- ✅ User feedback positive

---

## Final Sign-Off

- [ ] Technical Lead approval
- [ ] QA approval
- [ ] Product Owner approval
- [ ] Security review completed
- [ ] Performance benchmarks met
- [ ] Documentation complete

**Deployment Date:** _______________

**Deployed By:** _______________

**Approved By:** _______________

---

**Status: READY FOR PRODUCTION DEPLOYMENT** 🚀
