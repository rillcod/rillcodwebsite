# How to Run Database Migration - Step by Step

**Migration**: WhatsApp Opt-In/Opt-Out Compliance  
**File**: `supabase/migrations/20260418000001_whatsapp_opt_in_out.sql`

---

## Option 1: Run in Supabase Dashboard (EASIEST) ✅

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click on **SQL Editor** in the left sidebar

### Step 2: Create New Query
1. Click **"New query"** button (top right)
2. Copy and paste this SQL:

```sql
-- WhatsApp Opt-In/Opt-Out Compliance Migration

-- Add opt-out columns to whatsapp_conversations table
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS opted_in_at TIMESTAMPTZ;

-- Add opt-in column to portal_users table
ALTER TABLE portal_users 
ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE;

-- Create index for faster opt-out checks
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_opted_out 
ON whatsapp_conversations(opted_out) 
WHERE opted_out = TRUE;

-- Create index for portal user opt-in
CREATE INDEX IF NOT EXISTS idx_portal_users_whatsapp_opt_in 
ON portal_users(whatsapp_opt_in) 
WHERE whatsapp_opt_in = TRUE;

-- Add comments
COMMENT ON COLUMN whatsapp_conversations.opted_out IS 'User has opted out of WhatsApp notifications (replied STOP)';
COMMENT ON COLUMN whatsapp_conversations.opted_out_at IS 'Timestamp when user opted out';
COMMENT ON COLUMN whatsapp_conversations.opted_in_at IS 'Timestamp when user opted in (or first messaged us)';
COMMENT ON COLUMN portal_users.whatsapp_opt_in IS 'User has consented to receive WhatsApp notifications';

-- Set default opt-in timestamp for existing conversations
UPDATE whatsapp_conversations 
SET opted_in_at = created_at 
WHERE opted_in_at IS NULL AND created_at IS NOT NULL;
```

### Step 3: Run the Query
1. Click **"Run"** button (or press Ctrl+Enter / Cmd+Enter)
2. Wait for "Success. No rows returned" message
3. Done! ✅

### Step 4: Verify It Worked
Run this query to check:
```sql
-- Check if columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'whatsapp_conversations' 
  AND column_name IN ('opted_out', 'opted_out_at', 'opted_in_at');

-- Should return 3 rows
```

Expected output:
```
column_name    | data_type                   | is_nullable | column_default
---------------|----------------------------|-------------|---------------
opted_out      | boolean                    | YES         | false
opted_out_at   | timestamp with time zone   | YES         | NULL
opted_in_at    | timestamp with time zone   | YES         | NULL
```

---

## Option 2: Run via Supabase CLI (ADVANCED)

### Prerequisites:
- Supabase CLI installed: `npm install -g supabase`
- Logged in: `supabase login`
- Linked to project: `supabase link --project-ref your-project-ref`

### Step 1: Check Migration File Exists
```bash
ls supabase/migrations/20260418000001_whatsapp_opt_in_out.sql
```

### Step 2: Run Migration
```bash
supabase db push
```

This will:
1. Connect to your remote database
2. Apply the migration
3. Update migration history

### Step 3: Verify
```bash
supabase db diff
```

Should show "No schema changes detected" if successful.

---

## Option 3: Run Manually via psql (EXPERT)

### Prerequisites:
- PostgreSQL client installed
- Database connection string from Supabase

### Step 1: Get Connection String
1. Go to Supabase Dashboard → Settings → Database
2. Copy "Connection string" (URI format)
3. Replace `[YOUR-PASSWORD]` with your actual password

### Step 2: Connect
```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres"
```

### Step 3: Run Migration
```sql
\i supabase/migrations/20260418000001_whatsapp_opt_in_out.sql
```

Or copy-paste the SQL directly.

---

## ✅ Verification Checklist

After running the migration, verify everything works:

### 1. Check Columns Exist
```sql
-- Check whatsapp_conversations
SELECT column_name FROM information_schema.columns
WHERE table_name = 'whatsapp_conversations' 
  AND column_name IN ('opted_out', 'opted_out_at', 'opted_in_at');

-- Check portal_users
SELECT column_name FROM information_schema.columns
WHERE table_name = 'portal_users' 
  AND column_name = 'whatsapp_opt_in';
```

### 2. Check Indexes Created
```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'whatsapp_conversations' 
  AND indexname = 'idx_whatsapp_conversations_opted_out';

SELECT indexname FROM pg_indexes
WHERE tablename = 'portal_users' 
  AND indexname = 'idx_portal_users_whatsapp_opt_in';
```

### 3. Check Default Values
```sql
-- All existing conversations should have opted_out = false
SELECT COUNT(*) FROM whatsapp_conversations WHERE opted_out = FALSE;

-- All existing users should have whatsapp_opt_in = false
SELECT COUNT(*) FROM portal_users WHERE whatsapp_opt_in = FALSE;
```

### 4. Test Opt-Out Functionality
```sql
-- Manually opt out a test conversation
UPDATE whatsapp_conversations 
SET opted_out = TRUE, opted_out_at = NOW() 
WHERE phone_number = '2348000000000'; -- Use a test number

-- Verify
SELECT phone_number, opted_out, opted_out_at 
FROM whatsapp_conversations 
WHERE phone_number = '2348000000000';
```

---

## 🚨 Troubleshooting

### Error: "relation whatsapp_conversations does not exist"
**Problem**: Table doesn't exist yet  
**Solution**: Create the table first or check table name spelling

### Error: "column already exists"
**Problem**: Migration already ran  
**Solution**: This is fine! The `IF NOT EXISTS` clause prevents errors. Skip to verification.

### Error: "permission denied"
**Problem**: Not enough database permissions  
**Solution**: Use the Supabase dashboard (Option 1) or contact admin

### Error: "syntax error near ALTER TABLE"
**Problem**: SQL syntax issue  
**Solution**: Copy the exact SQL from this guide, don't modify it

---

## 📊 What This Migration Does

### Adds to `whatsapp_conversations`:
- `opted_out` (BOOLEAN) - Is user opted out? Default: FALSE
- `opted_out_at` (TIMESTAMPTZ) - When did they opt out?
- `opted_in_at` (TIMESTAMPTZ) - When did they opt in?

### Adds to `portal_users`:
- `whatsapp_opt_in` (BOOLEAN) - Has user consented? Default: FALSE

### Creates Indexes:
- Fast lookup for opted-out users
- Fast lookup for opted-in users

### Sets Defaults:
- Existing conversations get `opted_in_at = created_at`
- This assumes they consented by messaging you first

---

## ⏱️ Estimated Time

- **Option 1 (Dashboard)**: 2 minutes
- **Option 2 (CLI)**: 5 minutes
- **Option 3 (psql)**: 10 minutes

---

## 🎯 After Migration

Once migration is complete:

1. ✅ Deploy your code to production
2. ✅ Test opt-out: Send "STOP" to your WhatsApp number
3. ✅ Test opt-in: Send "START" to your WhatsApp number
4. ✅ Verify in database that `opted_out` changes

---

## 📞 Need Help?

**Can't run migration?**
- Email: support@rillcod.com
- Share error message and which option you tried

**Migration successful but features not working?**
- Check code is deployed: `git log --oneline -1`
- Check environment variables are set
- Review `docs/WHATSAPP_COMPLIANCE_IMPLEMENTATION_GUIDE.md`

---

## ✅ Success Indicators

You'll know it worked when:
- ✅ No errors in SQL Editor
- ✅ Columns show up in verification query
- ✅ Indexes created successfully
- ✅ Can send "STOP" and get confirmation message
- ✅ Opted-out users can't receive messages

---

**Recommended**: Use **Option 1 (Supabase Dashboard)** - it's the easiest and safest!

**Last Updated**: 2026-04-18
