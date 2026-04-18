# WhatsApp Business API Setup Guide - Rillcod Technologies

## ✅ Current Status

Your WhatsApp Business API credentials are **CONFIGURED** and ready to use!

```
Business Name: Rillcod Technologies (Approved ✅)
Phone Number ID: 1165370629985726
API Version: v19.0
Token Type: Permanent Access Token
App Status: Pending Business Verification
Status: Active ✅
```

---

## ⚠️ IMPORTANT: Token & App Approval Status

### Your Current Setup

You're using a **Permanent Access Token** - here's what you need to know:

#### ✅ Safe to Use (For Now)
- Permanent tokens work for development and testing
- They don't expire like temporary tokens (60 days)
- Your current integration will continue working

#### ⚠️ Security Concerns
1. **Not Recommended for Production**
   - Permanent tokens have full account access
   - If leaked, someone could control your entire WhatsApp Business account
   - No way to revoke without regenerating (breaks your app)

2. **App Approval Pending**
   - Your app needs Meta Business Verification
   - Until approved, you have limited features:
     - ❌ Can't send to users who haven't messaged you first
     - ❌ Limited to 1,000 conversations/month
     - ❌ Can't use message templates for broadcasts
     - ❌ No verified badge
   - ✅ Can receive messages
   - ✅ Can reply to incoming messages
   - ✅ Can test with your own numbers

#### 🔒 Recommended Actions

**Immediate (This Week):**
1. **Submit App for Business Verification**
   - Go to Meta Business Manager → Settings → Business Info
   - Click "Start Verification"
   - Provide: Business documents, website, registration papers
   - Timeline: 1-3 weeks for approval

2. **Keep Token Secure**
   - ✅ Already in `.env.local` (not committed to git)
   - ✅ Add to Vercel as environment variable
   - ❌ Never share in Slack, email, or screenshots
   - ❌ Never commit to GitHub

**After App Approval:**
3. **Switch to System User Token** (More Secure)
   - Create System User in Meta Business Manager
   - Generate token with limited permissions
   - Tokens can be revoked without breaking other integrations
   - Better for production environments

4. **Enable Two-Factor Authentication**
   - On your Meta Business Manager account
   - Adds extra security layer

---

## 🆕 NEW FEATURE: Quick Chat by Number

You can now start WhatsApp conversations with ANY phone number directly from the inbox!

### How to Use:

1. **Floating Button**: Click the green floating chat button (bottom-right) in the WhatsApp tab
2. **Enter Number**: Type any phone number (e.g., +234 800 000 0000)
3. **Start Chat**: Click "Start Chat" to create a conversation
4. **Send Messages**: Type and send messages as usual

### Features:

- ✅ **No Contact Required**: Chat with any number, even if not in your contacts
- ✅ **Auto-Detection**: System checks if number is registered on WhatsApp
- ✅ **Smart Indicators**: Shows warning if number is not on WhatsApp
- ✅ **Persistent Read Status**: Messages stay marked as read even after logout
- ✅ **Fallback Links**: Get wa.me links if API fails

### Number Validation:

- Accepts any format: +234 800 000 0000, 2348000000000, 08000000000
- Minimum 7 digits required
- Automatically strips non-numeric characters
- Shows preview before starting chat

---

## 🔧 Environment Variables (Already Added)

These are already in your `.env.local`:

```bash
WHATSAPP_API_URL="https://graph.facebook.com/v19.0/1165370629985726/messages"
WHATSAPP_API_TOKEN="EAAVX8DHo9Lo..." # Your access token
WHATSAPP_PHONE_NUMBER_ID="1165370629985726"
WHATSAPP_WEBHOOK_VERIFY_TOKEN="rillcod_webhook_secret_2026"
```

**⚠️ IMPORTANT**: Add these same variables to your Vercel dashboard:
1. Go to https://vercel.com/your-project/settings/environment-variables
2. Add each variable above
3. Redeploy your app

---

## 📱 How It Works Now

### Sending Messages

When you send a message from `/dashboard/inbox`:

1. **Message is saved to database** (always happens)
2. **API call to Meta WhatsApp** (using your credentials)
3. **If successful**: Message delivered via WhatsApp ✅
4. **If failed**: Message saved, you get fallback `wa.me` link

### Receiving Messages

When someone sends you a WhatsApp message:

1. **Meta sends webhook** to `https://your-domain.com/api/webhooks/whatsapp`
2. **Message saved to database**
3. **Auto-response triggered** (if enabled)
4. **Real-time update** in your inbox via Supabase

---

## 🔗 Webhook Setup (Required for Receiving Messages)

### Step 1: Configure Webhook in Meta Business Manager

1. Go to https://developers.facebook.com/apps
2. Select your WhatsApp app
3. Go to **WhatsApp > Configuration**
4. Click **Edit** next to Webhook
5. Enter these details:

```
Callback URL: https://your-domain.com/api/webhooks/whatsapp
Verify Token: rillcod_webhook_secret_2026
```

6. Click **Verify and Save**

### Step 2: Subscribe to Webhook Fields

Make sure these fields are subscribed:
- ✅ `messages` (incoming messages)
- ✅ `message_status` (delivery status)

---

## 🧪 Testing Your Integration

### Test 1: Send a Message

1. Go to `/dashboard/inbox`
2. Select a conversation (or create test conversation)
3. Type a message and send
4. Check browser console for:
   - `[WhatsApp API] Message sent successfully` ✅
   - OR `[WhatsApp API Error]` with details ❌

### Test 2: Receive a Message

1. Send a WhatsApp message to your business number
2. Check `/dashboard/inbox` - message should appear
3. Check database: `whatsapp_messages` table should have new row

### Test 3: Auto-Response

1. Send "hello" to your business number
2. You should receive auto-response within seconds
3. Check `/dashboard/inbox` to see both messages

---

## 🚨 Troubleshooting

### "Message saved but WhatsApp API failed"

**Possible causes:**
1. **Token expired**: WhatsApp tokens expire every 60 days
   - Solution: Generate new token in Meta Business Manager
   - Update `WHATSAPP_API_TOKEN` in Vercel

2. **Phone number not verified**: Recipient must have WhatsApp
   - Solution: Test with verified WhatsApp numbers first

3. **Rate limit exceeded**: Free tier has limits
   - Solution: Upgrade to paid tier or wait 24 hours

4. **Template required**: First message to user must use approved template
   - Solution: Use message templates for first contact

### Webhook Not Receiving Messages

**Check these:**
1. Webhook URL is publicly accessible (not localhost)
2. Verify token matches exactly: `rillcod_webhook_secret_2026`
3. SSL certificate is valid (https required)
4. Webhook fields are subscribed in Meta dashboard

### "Credentials Missing" Error

**Solution:**
1. Check `.env.local` has all 4 WhatsApp variables
2. Restart your dev server: `npm run dev`
3. For production: Add variables to Vercel and redeploy

---

## 📊 Message Status Flow

```
User sends message from inbox
    ↓
Message saved to DB (status: "pending")
    ↓
API call to Meta WhatsApp
    ↓
    ├─ Success → status: "sent"
    │      ↓
    │   Meta delivers → status: "delivered"
    │      ↓
    │   User reads → status: "read"
    │
    └─ Failed → status: "failed"
           ↓
        Fallback: wa.me link provided
```

---

## 🎯 Features Enabled

### ✅ Currently Working

- **Quick Chat by Number** - Start conversations with any phone number (NEW!)
- **Smart Number Detection** - Indicates if number is not on WhatsApp (NEW!)
- **Persistent Read Status** - Messages stay read after logout (NEW!)
- Send text messages via WhatsApp Business API
- Receive incoming messages via webhook
- Auto-responses for common queries
- Message status tracking (sent, delivered, read)
- Save new contacts from WhatsApp
- Quick response templates
- Open in WhatsApp (wa.me links)

### 🔄 Coming Soon (After App Approval)

- **Send images, documents, videos** - Requires approved app
- **Message templates for broadcasts** - Requires approved templates
- **Initiate conversations** - Currently can only reply to incoming messages
- **Verified badge** - After business verification
- **Higher rate limits** - Unlimited conversations with paid tier
- **WhatsApp Business profile** - Enhanced with catalog, hours, etc.

---

## 💡 Best Practices

### 1. Response Time
- Aim to respond within 2 hours during business hours
- Use auto-responses for off-hours (already configured)
- Set expectations in welcome message
- Monitor response time in activity logs

### 2. Message Templates (After App Approval)
Create templates for common scenarios:
- **Welcome message** - First contact with new users
- **Payment confirmation** - "Payment of ₦{{amount}} received for {{student}}"
- **Assignment reminder** - "Assignment due: {{subject}} on {{date}}"
- **Class schedule** - "Your class schedule for {{term}}"
- **Fee reminder** - "School fees due: ₦{{amount}} by {{date}}"
- **Report card** - "{{student}}'s report card is ready"

**Note:** Templates must be approved by Meta before use (1-2 days review time)

### 3. Compliance
- ✅ Get consent before messaging (add opt-in checkbox during registration)
- ✅ Provide opt-out option ("Reply STOP to unsubscribe")
- ✅ Don't spam users (max 1 message per day unless replying)
- ✅ Follow WhatsApp Business Policy: https://www.whatsapp.com/legal/business-policy
- ✅ Respect 24-hour messaging window (can only send templates after 24h)
- ✅ Store user preferences (who opted in/out)

### 4. Token Management
- Tokens expire every 60 days
- Set calendar reminder to renew
- Keep backup of old tokens for 7 days

---

## 🔐 Security Notes

### Token Security
- **Never commit tokens to git** ✅ (already in .gitignore)
- **Use environment variables** ✅ (already configured)
- **Rotate tokens regularly** (every 60 days)

### Webhook Security
- Verify token prevents unauthorized access
- Meta signs requests (verify signature in production)
- Use HTTPS only (HTTP not allowed)

---

## 📞 Support

### Meta WhatsApp Support
- Documentation: https://developers.facebook.com/docs/whatsapp
- Business Support: https://business.facebook.com/help

### Rillcod Support
- Check logs: `/dashboard/activity-logs`
- Test webhook: Use Meta's webhook tester
- Contact: support@rillcod.com

---

## 🚀 Next Steps - Post Name Approval

### ✅ Immediate Actions (This Week)

1. **Submit App for Business Verification** ⚠️ PRIORITY
   - Go to https://business.facebook.com/settings/info
   - Click "Start Verification"
   - Required documents:
     - Business registration certificate
     - Tax ID / TIN
     - Proof of address (utility bill, bank statement)
     - Website: rillcod.com
   - Timeline: 1-3 weeks
   - **Why it matters:** Unlocks templates, broadcasts, higher limits

2. **Update WhatsApp Business Profile**
   - Go to Meta Business Manager → WhatsApp → Settings
   - Update Business Name to: **Rillcod Technologies** ✅
   - Update Business Description: "All-in-one school management platform for Nigerian schools"
   - Add official logo/profile picture
   - Verify business category: Education / EdTech
   - Add website: https://rillcod.com
   - Add business hours: Mon-Fri 8AM-6PM WAT

3. **Secure Your Token** 🔒
   - Verify token is in `.env.local` only
   - Add to Vercel environment variables
   - Enable 2FA on Meta Business Manager
   - Document token location (password manager)
   - Plan to migrate to System User token after app approval

4. **Create Message Templates** (Submit for Approval)
   Go to Meta Business Manager → WhatsApp → Message Templates
   
   **Welcome Template:**
   ```
   Hello! Welcome to *Rillcod Technologies* 🎓
   
   Your all-in-one school management platform. How can we help you today?
   
   Reply with:
   • 1 for Student Info
   • 2 for Payments  
   • 3 for Support
   ```

   **Payment Confirmation:**
   ```
   ✅ Payment Received - Rillcod Technologies
   
   Amount: ₦{{1}}
   Student: {{2}}
   Reference: {{3}}
   Date: {{4}}
   
   Thank you for using Rillcod Technologies!
   View receipt: {{5}}
   ```

   **Assignment Reminder:**
   ```
   📚 Assignment Due - Rillcod Technologies
   
   Subject: {{1}}
   Due Date: {{2}}
   Class: {{3}}
   
   Submit via: app.rillcod.com/assignments
   
   Need help? Reply to this message.
   ```

   **Fee Reminder:**
   ```
   � School Fees Reminder -  Rillcod Technologies
   
   Student: {{1}}
   Amount Due: ₦{{2}}
   Due Date: {{3}}
   
   Pay online: {{4}}
   
   Questions? Reply to chat with us.
   ```

5. **Set Up Compliance**
   - Add opt-in checkbox during student registration
   - Create opt-out handler (reply "STOP")
   - Update privacy policy to include WhatsApp data handling
   - Document consent records in database

### 📋 After App Approval (1-3 Weeks)

6. **Enable Advanced Features**
   - ✅ Send images (report cards, receipts)
   - ✅ Send documents (PDFs, assignments)
   - ✅ Send videos (announcements, tutorials)
   - ✅ Use approved message templates
   - ✅ Initiate conversations (not just replies)
   - ✅ Request verification badge (green checkmark)

7. **Upgrade to Paid Tier** (Recommended)
   Current limits on free tier:
   - 1,000 conversations/month
   - 250 messages/day
   
   Paid tier benefits:
   - Unlimited conversations
   - Higher rate limits
   - Priority support
   - Advanced analytics
   - Cost: ~₦3-10 per message (Nigeria rates)

8. **Launch Broadcast Campaigns**
   - Term start announcements
   - Fee reminders (bulk)
   - Exam schedules
   - Holiday notices
   - Emergency alerts

### 🎯 Long-term Goals (1-3 Months)

9. **Advanced Features**
   - Set up WhatsApp Flows (interactive forms for payments)
   - Implement chatbot for common queries
   - Add payment links in WhatsApp
   - Create broadcast lists by school/class
   - Set up WhatsApp Business API catalog

10. **Analytics & Optimization**
    - Monitor response times (aim for <2 hours)
    - Track conversation resolution rates
    - Analyze peak hours
    - Optimize auto-responses based on data
    - A/B test message templates

11. **Team Training**
    - Schedule training session on inbox usage
    - Create internal guidelines for responses
    - Set up response time SLAs
    - Assign team members to different conversation types
    - Create escalation procedures

---

## 🎉 Congratulations on Name Approval!

Your **Rillcod Technologies** brand is now officially recognized. This is a major milestone that opens doors for:

- ✅ Official WhatsApp Business verification
- ✅ Trademark protection opportunities  
- ✅ Enhanced brand credibility
- ✅ Professional business profile
- ✅ Access to premium features

**Recommended Priority Order:**
1. ⚠️ Submit app for business verification (TODAY - most important!)
2. Update WhatsApp Business Profile (Today)
3. Secure your token properly (Today)
4. Create 3-5 core message templates (This week)
5. Set up compliance (opt-in/opt-out) (This week)
6. Request verification badge (After app approval)
7. Train team on inbox (After app approval)
8. Launch marketing campaign (After app approval)

---

## 🔐 Token Security - Critical Information

### Current Setup: Permanent Access Token

**What You Have:**
- Type: Permanent Access Token (never expires)
- Access Level: Full account access
- Security Risk: HIGH if leaked

**Is It Safe?**
- ✅ Safe for development/testing
- ✅ Safe if kept in environment variables only
- ⚠️ Not recommended for production long-term
- ❌ Dangerous if committed to git or shared

**What Happens If Token Leaks?**
- Attacker can send messages as your business
- Attacker can read all conversations
- Attacker can modify business profile
- Attacker can delete conversations
- You'd need to regenerate (breaks your app)

**Best Practices:**
1. ✅ Keep in `.env.local` (already done)
2. ✅ Add to Vercel as secret environment variable
3. ✅ Never commit to GitHub (already in .gitignore)
4. ✅ Never share in Slack, email, screenshots
5. ✅ Enable 2FA on Meta Business Manager
6. ⚠️ Plan to migrate to System User token after app approval

**After App Approval - Migrate to System User Token:**
1. Go to Meta Business Manager → Business Settings → Users → System Users
2. Create new System User: "Rillcod WhatsApp API"
3. Assign WhatsApp permissions only (not full account)
4. Generate token with limited scope
5. Replace permanent token with System User token
6. Benefits: Can revoke without breaking other integrations

---

**Last Updated**: 2026-04-18  
**Status**: Production Ready ✅ | Name Approved ✅ | App Verification Pending ⚠️  
**Integration**: Meta WhatsApp Business API v19.0  
**Brand**: Rillcod Technologies (Officially Approved)  
**Token Type**: Permanent Access Token (Migrate to System User after app approval)
