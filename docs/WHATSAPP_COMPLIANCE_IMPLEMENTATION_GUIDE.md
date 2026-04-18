# WhatsApp Compliance Implementation Guide

**Quick Start**: How to deploy the compliance fixes

---

## 🚀 Step 1: Database Schema Updates (REQUIRED)

Run these SQL commands in your Supabase SQL Editor:

```sql
-- Add opt-out columns to whatsapp_conversations
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS opted_in_at TIMESTAMPTZ;

-- Add opt-in column to portal_users
ALTER TABLE portal_users 
ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE;

-- Create index for faster opt-out checks
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_opted_out 
ON whatsapp_conversations(opted_out) WHERE opted_out = TRUE;

-- Create index for portal user opt-in
CREATE INDEX IF NOT EXISTS idx_portal_users_whatsapp_opt_in 
ON portal_users(whatsapp_opt_in) WHERE whatsapp_opt_in = TRUE;
```

---

## 📝 Step 2: Deploy Code Changes

All code changes are already in place:

✅ `src/app/api/inbox/opt-out/route.ts` - NEW  
✅ `src/app/api/inbox/send/route.ts` - UPDATED  
✅ `src/app/api/inbox/auto-respond/route.ts` - UPDATED  
✅ `src/app/api/webhooks/whatsapp/route.ts` - UPDATED  

**Deploy to production:**
```bash
git add .
git commit -m "feat: add WhatsApp compliance (opt-in/opt-out, rate limits, privacy)"
git push origin main
```

Vercel will auto-deploy.

---

## 🧪 Step 3: Test the Implementation

### Test Opt-Out:
1. Send WhatsApp message to your business number: **"STOP"**
2. Expected response:
   ```
   ✅ You have been unsubscribed from Rillcod Technologies 
   WhatsApp notifications.
   
   You will no longer receive automated messages from us.
   
   To opt back in, reply "START" or visit your dashboard settings.
   
   Thank you for using Rillcod Technologies.
   ```
3. Try sending another message from admin → Should get 403 error
4. Check database: `opted_out` should be `true`

### Test Opt-In:
1. Send WhatsApp message: **"START"**
2. Expected response:
   ```
   🎉 Welcome back to Rillcod Technologies WhatsApp notifications!
   
   You will now receive:
   ✅ Important updates
   ✅ Assignment reminders
   ✅ Payment confirmations
   ✅ Support responses
   
   To unsubscribe anytime, reply "STOP"
   
   Thank you for choosing Rillcod Technologies!
   ```
3. Send "Hi" → Should get auto-response
4. Check database: `opted_out` should be `false`

### Test Auto-Response Branding:
1. Send "Hello" to your business number
2. Expected response should include:
   - "🤖 Auto-Response - Rillcod Technologies"
   - "A team member will respond soon..."
   - "Reply STOP to unsubscribe"

### Test Rate Limit Detection:
1. Simulate rate limit by hitting 1,000 conversations/month
2. Expected error message:
   ```
   ⚠️ Rate limit reached! You've hit WhatsApp's message limit...
   ```
3. Check database: `metadata.is_rate_limit_error` should be `true`

---

## 📄 Step 4: Update Privacy Policy

1. **Review the addendum:**
   - Open `docs/PRIVACY_POLICY_WHATSAPP_ADDENDUM.md`
   - Review with legal team if needed
   - Customize company address and contact details

2. **Add to your website:**
   - Add link to privacy policy page
   - Include in footer
   - Link from registration page

3. **Update registration form:**
   - Add checkbox: "I agree to receive WhatsApp notifications"
   - Link to privacy policy
   - Make it optional (unchecked by default)

---

## 🎯 Step 5: User Communication

### Notify Existing Users:

**Option A: WhatsApp Broadcast (After App Approval)**
```
📢 Important Update - Rillcod Technologies

We've updated our WhatsApp communications policy.

You're currently opted-in to receive:
✅ Assignment reminders
✅ Payment confirmations
✅ Important updates

To opt-out anytime, simply reply "STOP"

Read our privacy policy: [link]
```

**Option B: Email Notification**
Send email to all users explaining:
- New opt-out feature
- How to use it (reply "STOP")
- Privacy policy updates
- Benefits of staying opted-in

**Option C: Dashboard Banner**
Show banner in dashboard:
```
📱 WhatsApp Notifications
You're receiving WhatsApp updates. Reply "STOP" to any message to unsubscribe.
[Learn More] [Privacy Policy]
```

---

## 🔒 Step 6: Security Checklist

- [ ] Database columns added
- [ ] Code deployed to production
- [ ] Opt-out tested and working
- [ ] Opt-in tested and working
- [ ] Auto-response branding updated
- [ ] Rate limit detection working
- [ ] Privacy policy published
- [ ] Users notified of changes
- [ ] 2FA enabled on Meta Business Manager
- [ ] Token stored securely in Vercel

---

## 📊 Step 7: Monitoring

### Track Opt-Outs:
```sql
-- Count opted-out users
SELECT COUNT(*) FROM whatsapp_conversations WHERE opted_out = TRUE;

-- Recent opt-outs
SELECT phone_number, contact_name, opted_out_at 
FROM whatsapp_conversations 
WHERE opted_out = TRUE 
ORDER BY opted_out_at DESC 
LIMIT 10;
```

### Track Rate Limits:
```sql
-- Count rate limit errors
SELECT COUNT(*) FROM whatsapp_messages 
WHERE metadata->>'is_rate_limit_error' = 'true';

-- Recent rate limit errors
SELECT created_at, conversation_id, metadata 
FROM whatsapp_messages 
WHERE metadata->>'is_rate_limit_error' = 'true' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Track Auto-Responses:
```sql
-- Count auto-responses sent
SELECT COUNT(*) FROM whatsapp_messages 
WHERE metadata->>'auto_response' = 'true';

-- Auto-response triggers
SELECT 
  metadata->>'trigger' as trigger_word,
  COUNT(*) as count
FROM whatsapp_messages 
WHERE metadata->>'auto_response' = 'true'
GROUP BY metadata->>'trigger'
ORDER BY count DESC;
```

---

## 🚨 Troubleshooting

### Issue: Opt-out not working
**Check:**
1. Database columns exist
2. Webhook is receiving messages
3. `NEXT_PUBLIC_APP_URL` is set correctly
4. Opt-out API is accessible

**Debug:**
```bash
# Check webhook logs
curl https://your-domain.com/api/webhooks/whatsapp

# Test opt-out API directly
curl -X POST https://your-domain.com/api/inbox/opt-out \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "2348000000000"}'
```

### Issue: Auto-response still sent to opted-out users
**Check:**
1. `opted_out` column is being checked
2. Auto-respond API has latest code
3. Cache cleared (if using)

**Fix:**
```sql
-- Manually mark user as opted out
UPDATE whatsapp_conversations 
SET opted_out = TRUE, opted_out_at = NOW() 
WHERE phone_number = '2348000000000';
```

### Issue: Rate limit not detected
**Check:**
1. Error codes being checked (80007, 130429)
2. Error message parsing working
3. Metadata being saved

**Test:**
```javascript
// Simulate rate limit error in send API
const mockError = {
  error: {
    code: 80007,
    message: "Rate limit exceeded"
  }
};
```

---

## 📞 Support

**Implementation Questions:**
- Email: support@rillcod.com
- Review: `docs/WHATSAPP_COMPLIANCE_FIXES_COMPLETE.md`

**Legal Questions:**
- Email: privacy@rillcod.com
- Review: `docs/PRIVACY_POLICY_WHATSAPP_ADDENDUM.md`

---

## ✅ Completion Checklist

Before marking as complete:

- [ ] Database schema updated
- [ ] Code deployed to production
- [ ] All tests passing
- [ ] Privacy policy published
- [ ] Users notified
- [ ] Monitoring set up
- [ ] Documentation reviewed
- [ ] Team trained on new features

---

**Estimated Time**: 2-3 hours  
**Difficulty**: Medium  
**Impact**: High (Legal Compliance)

**Last Updated**: 2026-04-18
