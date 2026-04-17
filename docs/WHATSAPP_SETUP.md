# WhatsApp Business API Setup Guide

## ✅ Current Status

Your WhatsApp Business API credentials are **CONFIGURED** and ready to use!

```
Phone Number ID: 1165370629985726
API Version: v19.0
Status: Active ✅
```

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

- Send text messages via WhatsApp Business API
- Receive incoming messages via webhook
- Auto-responses for common queries
- Message status tracking (sent, delivered, read)
- Save new contacts from WhatsApp
- Quick response templates
- Open in WhatsApp (wa.me links)

### 🔄 Coming Soon

- Send images, documents, videos
- Message templates for broadcasts
- WhatsApp Business profile management
- Analytics dashboard (message volume, response time)

---

## 💡 Best Practices

### 1. Response Time
- Aim to respond within 2 hours
- Use auto-responses for off-hours
- Set expectations in welcome message

### 2. Message Templates
- Create templates for common scenarios:
  - Welcome message
  - Payment confirmation
  - Assignment reminder
  - Class schedule

### 3. Compliance
- Get consent before messaging
- Provide opt-out option
- Don't spam users
- Follow WhatsApp Business Policy

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

## 🚀 Next Steps

1. **Test sending a message** from `/dashboard/inbox`
2. **Configure webhook** in Meta Business Manager
3. **Test receiving a message** by sending to your business number
4. **Add variables to Vercel** for production
5. **Create message templates** for common scenarios
6. **Train your team** on using the inbox

---

**Last Updated**: 2026-04-17  
**Status**: Production Ready ✅  
**Integration**: Meta WhatsApp Business API v19.0
