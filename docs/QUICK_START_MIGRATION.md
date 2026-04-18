# Quick Start: Run Database Migration in 2 Minutes ⚡

**Goal**: Add opt-in/opt-out columns to your database

---

## 🚀 Fastest Method (Copy & Paste)

### Step 1: Open Supabase
Go to: https://supabase.com/dashboard → Your Project → **SQL Editor**

### Step 2: Copy This SQL
```sql
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS opted_in_at TIMESTAMPTZ;

ALTER TABLE portal_users 
ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_opted_out 
ON whatsapp_conversations(opted_out) WHERE opted_out = TRUE;

CREATE INDEX IF NOT EXISTS idx_portal_users_whatsapp_opt_in 
ON portal_users(whatsapp_opt_in) WHERE whatsapp_opt_in = TRUE;

UPDATE whatsapp_conversations 
SET opted_in_at = created_at 
WHERE opted_in_at IS NULL;
```

### Step 3: Paste & Run
1. Paste into SQL Editor
2. Click **"Run"** (or Ctrl+Enter)
3. Wait for "Success" message
4. Done! ✅

---

## ✅ Verify It Worked

Run this to check:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'whatsapp_conversations' 
  AND column_name IN ('opted_out', 'opted_out_at', 'opted_in_at');
```

Should return 3 rows. If yes, you're done! 🎉

---

## 🎯 Next Steps

1. Deploy your code: `git push`
2. Test opt-out: Send "STOP" to your WhatsApp
3. Test opt-in: Send "START" to your WhatsApp

---

**That's it!** Your database is now ready for opt-in/opt-out compliance.

For detailed instructions, see: `docs/HOW_TO_RUN_DATABASE_MIGRATION.md`
