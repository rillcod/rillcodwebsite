# Automated Office — Simple Admin Guide

This guide is for a person who is not technical.

## What your job is now

Your main job is to **monitor the office and handle exceptions**.

You do not need to send every reminder yourself. The system continues routine work automatically. You step in when a customer needs judgment, a message fails, work becomes late, or a private matter needs careful handling.

## Where to start every day

Open **Dashboard → Office Center**.

Everything for the automated office lives in this one workplace. Use the tabs at the top to move between work areas without leaving Office Center (this also works on phones and the Android app).

Start on **Desk**. The Desk shows:

- the person’s real name;
- the real item, such as assignment, onboarding, result, payment, or class;
- the staff member responsible;
- the last action;
- the next action;
- whether a message was sent, delivered, read, stopped, or failed;
- anything that needs the admin’s attention.

You do not need to understand database IDs, entities, cron jobs, providers, or technical logs.

## Your five-minute morning check

1. On **Desk**, look at **You should check**.
2. Assign any work that says **No staff owner yet** (open the item into **Help Requests**).
3. Open failed messages from Desk or **Settings → Scheduled work** only when the number is above zero.
4. Open **Automatic work problems** (or **Settings → Scheduled work**) only when the number is above zero.
5. Search a person’s name on Desk if they ask what happened.

If the numbers are clear or green, leave the automation running.

## Who should handle what

The system uses the active staff found in the database. It is designed for about eight active staff but grows or reduces automatically.

- Teachers handle their own students, classes, assignments, learning questions, and ordinary academic follow-up.
- The staff member currently on duty handles routine unowned work.
- The admin handles finance exceptions, account access, complaints, private matters, failed work, approvals, and work that becomes seriously late.
- More than one admin login is not treated as several imaginary employees. It is one effective admin duty position.

Open **Duty** inside Office Center to mark a person available or away and choose the primary or backup duty person.

## What continues automatically

When its switch is on, the system can:

- acknowledge a new request;
- create one customer history across the app, email, and WhatsApp;
- assign routine work to suitable available staff;
- remind the staff owner about unfinished work;
- raise late work to the admin;
- send approved onboarding, class, assignment, result, payment, certificate, retention, and follow-up messages;
- record delivery and replies;
- retry or preserve failed queued messages;
- ask the customer whether the answer helped;
- stop marketing when the customer has not consented or asks to stop.

## Office Center workspaces

### Desk

Daily monitoring and tracing work by a person’s name or item. Start here every day.

### Help Requests

Read the full conversation, change the staff owner, record the next action, reply, resolve the work, or reopen it.

### Duty

Show who is available. This helps distribute routine work to teachers instead of sending everything to the admin.

### Inbox

WhatsApp staff chats. Use the **Groups** sub-tab for WhatsApp groups.

### Feedback

Answer, resolve, and audit customer feedback.

### Retention

Prospects and customers who need the next helpful contact (CRM).

### Newsletters

Draft, approve, target, and schedule marketing newsletters.

### Settings

One place for lower-visibility controls:

- **Automatic work** — turn customer follow-up, retention, or marketing on or off. An external schedule cannot bypass a switch that is off.
- **Message wording** — review and approve governed automatic messages.
- **Scheduled work** — green means timed work is running; red or amber needs attention. Use **Check now** for a safe immediate check.
- **Office results** — response speed, delivery, ratings, safety, and marketing accountability.

### Finance Settings (outside Office Center)

Finance channel controls live in **Finance Center → Settings**. They decide whether invoice, billing, balance, email, WhatsApp, or in-app reminders may be sent. A schedule does not override these settings. Office Center Settings links there when needed.

## What happens when something fails

Failed work is not silently thrown away.

1. The system records the problem.
2. The Desk shows the problem count.
3. Open **Settings → Scheduled work**.
4. Read **What went wrong**.
5. Use **Try again** for a message or **Check now** for scheduled work.
6. Mark it checked only after the work is complete or no longer needed.

## Email tracking

- Every outbound email is logged when the provider accepts or rejects it (`sent`, `failed`, or `suppressed`).
- Desk and Office Results count provider-accepted sends as successful until later status events arrive.
- **Your remaining setup (operator):** connect the email provider so delivered / bounce / open events hit the app.
  1. Reuse your existing `CRON_SECRET` (no new secret required). Optional: set `EMAIL_STATUS_WEBHOOK_SECRET` only if you want a separate key.
  2. Point SendPulse SMTP and/or Resend webhooks to:
     `https://www.rillcod.com/api/webhooks/email-status?token=YOUR_CRON_SECRET`
     (or send `x-webhook-secret` / `Authorization: Bearer YOUR_CRON_SECRET`).
  3. For Resend, also set `RESEND_WEBHOOK_SECRET` to the Svix signing secret (`whsec_...`) if the provider signs with Svix.
  4. Confirm one test send shows `delivered` / `bounced` in Office → Settings → Scheduled work / Desk activity.
- Delivery-index migration `20260917000001_delivery_provider_message_indexes.sql` is applied on the linked project.
- Failed portal emails are kept for **Try again** under Scheduled work when a staff user id is known. External email failures are also kept and can be retried without a portal user id.

## Customer privacy and sensitive messages

Messages about child safety, privacy, fraud, or serious complaints are marked private and restricted. They are not distributed as ordinary teacher work. The admin or another approved person must handle them.

## Marketing rules

Marketing is different from necessary service communication.

- Marketing is sent only when permission exists.
- A main switch can stop all marketing.
- A customer’s STOP or unsubscribe request is recorded and respected.
- The system records what campaign caused a message.
- The admin can measure sent, viewed, converted, failed, and stopped messages.
