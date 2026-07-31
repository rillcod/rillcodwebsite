# Rillcod Automated Office Master Plan

**Document owner:** Chief Operations Administrator  
**Technical owner:** Platform Engineering  
**Business owners:** Customer Care, Admissions, Academic Operations, Finance, School Partnerships, Marketing, and Compliance  
**Status:** Implementation blueprint  
**Version:** 1.0  
**Target operating model:** One coordinated company with the service capacity, consistency, and coverage of a 200+ person organisation

**Current staffing baseline:** Plan for approximately eight active staff, with one effective administrator duty position and teachers/operators handling day-to-day learning and service operations. The live database remains the source of truth, so routing expands or contracts with the actual active team. The system must protect the administrator from becoming the default owner of every task.


### Implementation progress - 20 July 2026

Completed locally in the first implementation tranche:

- WhatsApp inbox sends now have one persistence owner, preventing duplicate staff replies;
- delivery webhooks update both canonical and legacy WhatsApp provider-ID records;
- feedback identity comes from the authenticated database profile rather than client claims;
- feedback input limits, validation, and throttling are enforced;
- administrators have a feedback work queue and response screen;
- customers can open their feedback reference and see the recorded response;
- administrator responses create an in-app notification and attempt professional email delivery.
---


Completed locally in the second implementation tranche:

- an eight-active-staff planning baseline is shown beside the real database count;
- multiple admin logins are collapsed into one effective admin duty position;
- active teachers and administrators are discovered dynamically from the database;
- class ownership, current duty, skills, active workload, availability, and upcoming teaching affect assignment;
- complaints remain restricted to the effective administrator while routine feedback can go to an assigned teacher;
- feedback receives an accountable owner, department, priority, and first-response deadline;
- administrators can mark staff available or away and assign primary or backup duty for eight hours;
- a live duty board shows current capacity, ranked ownership, warnings, and the recommended next operator;
- assignment safely falls back to the admin notification queue if the duty tables are not yet deployed.

Completed and deployed in the third implementation tranche:

- every non-command inbound WhatsApp message receives an accountable duty owner;
- class ownership, live workload, availability, skills, and complaint restrictions drive assignment;
- routine WhatsApp work receives a four-hour response deadline;
- complaints receive a two-hour response deadline and remain admin-restricted;
- new customer messages reset stale reminder state and reopen the response clock;
- the secure external-cron endpoint `/api/cron/communication-followup` reminds the owner hourly;
- work still overdue after repeated reminders escalates to all active admin logins;
- reminder counts are stored durably so repeated cron calls do not flood staff.

Completed in the fourth implementation tranche:

- the existing `process-notifications` cron now owns communication reminders, so no new cron schedule is required;
- WhatsApp, feedback, customer email, and parent-teacher in-app messages write to one communication-case history;
- cases are grouped by customer and service category so unrelated active issues are not mixed together;
- customers see only their own cases, teachers see only assigned cases, and administrators see the company queue;
- every case has one owner, priority, status, response deadline, channels, and immutable event history;
- overdue cases are reminded and escalated through the existing minute-by-minute notification cron;
- a dedicated Service Cases screen is available from every dashboard role.

Completed in the fifth implementation tranche:

- Finance has one master communication switch plus separate invoice, billing-cycle, and special-program balance controls;
- Finance channel settings govern email, in-app, and WhatsApp delivery while accounting-state maintenance remains independent;
- external cron URL parameters cannot override the saved balance-reminder cadence;
- finance delivery fails closed when authoritative settings cannot be read;
- finance automation logs store the settings timestamp and cadence used for each balance reminder;
- one Office Automation control page governs customer-case follow-up, learning retention, lead nurture, form follow-up, and scheduled newsletter publishing;
- the marketing master switch overrides every marketing child automation;
- transactional queues continue safely when optional marketing or internal follow-up controls are unavailable;
- governed cron routes fail closed if Office Automation settings are missing or invalid;
- administrators work in one Office Center (Desk, Cases, Duty, Inbox, Feedback, Retention, Newsletters, Settings) instead of separate peer screens.


Completed and deployed in the sixth implementation tranche:

- all twelve existing cronjobs.org routes write last-run, result, duration, failure, and expected-next-run health;
- HTTP 200 responses that report failed work or errors are classified as unhealthy rather than hidden as success;
- repeated cron failures alert active administrators and link directly to Operations Health;
- notification jobs that exhaust retries, use an unsupported type, lose Redis, or encounter Redis errors enter durable dead-letter recovery;
- if both the live queue and recovery database fail, the caller receives an explicit error instead of false success;
- administrators can run a governed cron immediately, inspect recent executions, retry eligible email failures, and resolve or ignore recovery items;
- recent Finance delivery failures are visible separately from accounting-state maintenance;
- communication templates now have immutable versions, variable checks, test evidence, approval, retirement, and one administration registry;
- approved registry templates drive new-case receipts, staff case follow-up, and special-program balance emails, with safe professional fallbacks;
- drafting a replacement template does not disable the currently approved version;
- the linked production database now contains the Operations Health, dead-letter, and template registry structures.

Completed and deployed in the seventh implementation stage:

- Office Center (Desk workspace) is the administrator's daily starting point;
- names, actual work items, staff owners, last actions, next actions, delivery results, and problems are visible without technical IDs;
- recent assignment, onboarding, result, payment, class, certificate, and general notices are searchable in one activity view;
- routine successful automation stays quiet while failures, late work, unassigned work, and restricted matters are raised;
- cases now store next actions, due dates, resolution notes, satisfaction, outcomes, reopening, and privacy sensitivity;
- customer identities are normalized so app, email, and WhatsApp history can be joined;
- inbound email supports reply headers, thread tokens, provider message IDs, and case links;
- email and WhatsApp delivery status have one durable log and generic provider-status endpoint;
- automated emails identify themselves and invite a reply; staff-written inbox email is recorded as human-written;
- child-safety, privacy, fraud, and serious complaint messages create restricted human incidents;
- feedback can be reopened and customers can record a rating and useful outcome;
- marketing newsletters require explicit permission, respect suppression, record a campaign, and remain separate from service notices;
- WhatsApp STOP and START commands update the durable marketing stop list;
- the Office Results view measures speed, delivery, satisfaction, safety, marketing restraint, and useful outcomes;
- existing cronjobs.org schedules remain in place and continue to run through saved controls;
- the production database contains the completion schema from migration `20260916000007`;
- a plain-language administrator guide explains the daily workflow and all important terms.


## 1. Executive objective

Rillcod should feel like one large, organised, caring company at every contact point. A student, parent, teacher, school, prospect, or partner must be able to contact Rillcod through the app, WhatsApp, or email and receive:

1. immediate acknowledgement;
2. a clear reference number;
3. useful first-step guidance;
4. correct routing to the responsible department;
5. a named accountable owner or team;
6. progress updates without repeatedly asking;
7. resolution within a published service level;
8. a professional close-out message;
9. a short satisfaction request; and
10. a durable history visible to authorised staff.

The system must create **200-staff service capacity**, not pretend that 200 human employees exist. Automated messages must identify themselves as automated. Human names, signatures, and availability must be real. The goal is organised scale, not artificial impersonation.

### Current-team design constraint

Rillcod does not currently need a separate human employee behind every virtual department. Virtual departments are routing categories, templates, rules, and service queues. In the present operating model:

- the administrator is the accountable operations lead and handles restricted or exceptional work;
- teachers own routine academic and class-related service for the learners assigned to them;
- automation performs acknowledgement, classification, reminders, status updates, and safe self-service;
- work that requires a specialist who does not yet exist remains visibly owned by the administrator, with a realistic response target;
- the system must never imply that a fictional department employee personally reviewed a request.

The operating objective is to move the administrator from **doing everything** to **supervising exceptions, approvals, and service quality**.

### Customer-facing company standard

Customers should experience one coordinated Rillcod organisation, not the internal staffing model. The interface may present verified functional identities such as `Rillcod Service Desk`, `Rillcod Academic Operations`, or `Rillcod Finance` without publishing staff count, workload, rota, or internal handoff complexity.

- automated acknowledgements use a discreet label such as `Automated acknowledgement from Rillcod Service Desk`;
- a message says it was reviewed by a person only after a real duty operator, teacher, or administrator reviewed it;
- human replies use the real responder's name or an approved shared-team signature backed by an accountable logged owner;
- internal queues, staffing shortages, and workload scores remain private operational information;
- customers always receive a department, reference, status, next step, and next-update time;
- the company must never invent employees, conversations, actions, or approvals.


### North-star promise

> Every legitimate request is acknowledged, owned, tracked, answered, followed up, and closed. No message disappears, no team works from a separate truth, and no customer has to start the story again on another channel.

---

## 2. Non-negotiable operating principles

### 2.1 One customer, one timeline

All authorised interactions must appear on one customer timeline regardless of channel:

- in-app message;
- WhatsApp inbound or outbound;
- external email sent or received;
- phone-call note;
- feedback submission;
- consent or registration form;
- invoice, payment, receipt, or refund event;
- class, assignment, report, attendance, or certificate event;
- staff note, task, escalation, and resolution.

Duplicate contacts must be merged using verified identifiers, not names alone. The primary identity keys are authenticated user ID, verified email, verified phone number, parent-child link, school ID, and CRM contact ID.

### 2.2 One request, one case number

Any communication that requires work becomes a case with a reference such as `RIL-2026-000123`. A case has exactly one current owner, one department, one priority, one SLA, one status, and one next action.

### 2.3 Automation handles speed; humans own judgement

Automation may acknowledge, classify, retrieve approved information, create tasks, send reminders, and propose replies. Humans must own safeguarding, complaints, refunds, disputes, academic judgement, disciplinary decisions, sensitive personal data changes, and high-risk exceptions.

### 2.4 Honest identity

Approved sender labels:

- `Rillcod Automated Assistant` for automatic responses;
- `Rillcod Customer Care` for shared-team replies;
- `Rillcod Admissions`, `Rillcod Finance`, `Rillcod Academic Operations`, and similar verified departments;
- a real staff name only when that person sent or approved the message.

Never invent staff biographies, signatures, departments, availability, or actions that did not occur.

### 2.5 Consent and minimum necessary data

Marketing requires affirmative consent. Transactional messages must remain separate from marketing preferences. Staff see only the information needed for their role. Sensitive data must never be inserted into logs, URLs, email subject lines, or broad broadcasts.

### 2.6 Delivery is not resolution

`queued`, `sent`, `delivered`, `read`, `replied`, `resolved`, and `closed` are different states. Dashboards and reports must not count a queued or saved message as delivered.

---

## 3. Virtual department model

The platform should present a clear organisation without creating fake personnel. Each department is a queue backed by real owners, approved automation, templates, schedules, and escalation rules.

| Department | Primary responsibilities | Default owner role | Automation coverage |
|---|---|---|---|
| Front Desk and Customer Care | General questions, triage, account guidance | Support/admin | Acknowledge, classify, route, chase |
| Admissions | Enquiries, programme fit, registration, placement | Admissions/admin | Lead nurture, form follow-up, appointment prompts |
| Student Success | Engagement, access, learning support | Teacher/student-success | Reminders, at-risk alerts, check-ins |
| Parent Care | Progress, schedules, reports, concerns | Parent-support/admin | Weekly summaries, acknowledgement, routing |
| Academic Operations | Classes, timetable, curriculum, assignments, reports | Academic admin | Release schedules, reminders, integrity checks |
| Teacher Operations | Rosters, grading, resources, classroom support | Academic admin | Work queues, overdue alerts, summaries |
| School Partnerships | Partner onboarding, school requests, service delivery | School-success/admin | Milestones, review reminders, account health |
| Finance and Billing | Invoices, balances, receipts, allocations, refunds | Finance/admin | Reminders, receipts, reconciliation alerts |
| Technical Support | Login, devices, bugs, availability | Support/engineering | Diagnostics checklist, incident updates |
| Marketing and Community | Consented campaigns, newsletters, events | Marketing/admin | Segmentation, scheduling, attribution |
| Complaints and Quality | Complaints, feedback, service recovery | Quality/admin | Case creation, acknowledgement, SLA escalation |
| Safeguarding and Compliance | Child safety, privacy, legal requests | Designated admin | Immediate restricted escalation only |

Every department requires:

- a real primary owner and backup owner;
- business hours and on-call rules;
- an inbox queue;
- SLA rules by priority;
- approved templates;
- escalation recipients;
- a weekly quality review;
- measurable outcomes.

### 3.1 Lean-team ownership map

Until dedicated department staff are hired, use the following real ownership model.

| Work category | Routine owner | Administrator becomes involved when |
|---|---|---|
| Class schedule and session question | Assigned/class teacher | Cross-class conflict, policy exception, repeated failure |
| Assignment clarification | Assignment/class teacher | Complaint, accessibility issue, disputed policy |
| Submission or grading status | Responsible teacher | Grading SLA breach or disputed grade |
| Student progress question | Assigned teacher | Safeguarding, formal report dispute, serious decline |
| Attendance follow-up | Assigned teacher | Repeated absence or formal intervention required |
| Parent academic update | Assigned teacher | Complaint, transfer, disciplinary or policy matter |
| Learning-platform guidance | Teacher on duty or assigned teacher | Confirmed technical defect or account/security issue |
| New enquiry/programme information | Automated Front Desk, then admissions teacher on duty | Pricing exception, school partnership, sensitive case |
| Onboarding check-in | Assigned teacher/class owner | Account creation, payment, placement, or data mismatch |
| General feedback/suggestion | Rotating teacher on duty | Complaint, privacy, legal, or company policy issue |
| Invoice, payment, receipt, refund | Administrator | Always restricted unless a finance role is later appointed |
| School partnership and contract | Administrator | Always restricted |
| Privacy, safeguarding, security | Administrator/designated authorised person | Always restricted and never delegated by ordinary load balancing |
| Bulk broadcast or marketing approval | Administrator | Always requires approval; teachers may draft class messages only |

### 3.2 Six-person operator and teacher duty rotation

Create a configurable `Operations Duty` rotation for the approximately six real staff. It distributes general, low-risk work without making every teacher or operator monitor every queue.

- one primary duty operator and one backup per operating block;

The number of available staff must be loaded dynamically from `portal_users`, not hard-coded. Count only active users with an eligible operational role and a usable duty state. The routing pool changes automatically when a teacher/operator is added, deactivated, placed on leave, marked unavailable, assigned to a live class, or reaches capacity. The current team size of approximately six is a planning baseline only.

Capacity displayed to the administrator should show:

- active eligible teachers/operators currently in the database;
- available now, teaching now, off duty, unavailable, and at-capacity counts;
- total safe active-case capacity and current utilisation;
- class-specific requests still go first to the assigned teacher;
- rota published at least one week ahead;
- availability, timetable, leave, and workload considered;
- configurable maximum active non-class cases;
- automatic handover at the end of the duty period;
- unfinished work keeps its owner unless handed over with a note;
- administrator can pause, override, or reassign the rota.
- only one person is `current duty` for the general queue at a time, preventing duplicate or conflicting replies.

| Period | Coverage |
|---|---|
| Weekday opening block | New general enquiries and overnight low-risk messages |
| Weekday teaching blocks | Assigned teachers handle their own class queue |
| Weekday closing block | Unanswered routine queue and next-day handover |
| Weekend/holiday | Automated acknowledgement; configured urgent escalation only |

Do not assign a teacher to customer-care duty during a scheduled live class. Do not notify every teacher about every request; this creates fatigue and unclear ownership.

### 3.3 Automatic assignment score

For safe teacher-eligible cases, select the teacher with the highest routing score:

```text
assignment_score =
  +100 exact class owner
   +60 programme or subject match
   +40 active duty teacher
   +25 prior relationship with the contact
   +20 available during the SLA window
   -10 per active routine case
   -25 if teaching within the next 60 minutes
   -50 if near configured capacity
  -999 unavailable, out of scope, on leave, or restricted case
```

Apply school, class, parent-child, and role scope before scoring. If no eligible teacher exists, place the case in `unassigned_teacher_queue` and alert the administrator only when the assignment SLA is at risk.

### 3.4 Administrator exception queue

The administrator dashboard should default to exceptions, not the entire message stream:

- restricted finance, safeguarding, privacy, contract, and security cases;
- P0/P1 cases;
- unassigned cases approaching SLA;
- teacher capacity overload;
- disputed or reopened cases;
- provider or automation failures;
- cross-school requests;
- approvals for broadcasts, refunds, exports, and policy exceptions;
- daily digest of routine work completed by teachers and automation.

Routine teacher-owned work remains visible for oversight but should not notify the administrator for every message.

---

## 4. Omnichannel architecture

```text
In-app      WhatsApp      Email      Forms      System events
   |            |           |          |              |
   +------------+-----------+----------+--------------+
                            |
                    Communication Gateway
                            |
             identity + consent + policy + deduplication
                            |
                   Case and Conversation Engine
                            |
        classification -> department -> owner -> SLA -> next action
                            |
          +-----------------+-------------------+
          |                 |                   |
      Outbox/Queue       Customer Timeline   Tasks/Escalations
          |                 |                   |
     provider send      audit + analytics    staff workbench
          |
   delivery/read/failure webhooks
```

### 4.1 Communication gateway

Create a shared server-side communication service. No feature route should call Meta, Resend, SendPulse, push, or notification tables independently except through the gateway.

Required gateway functions:

- `createOrFindContact()`;
- `createOrFindConversation()`;
- `openOrAppendCase()`;
- `checkConsent()`;
- `checkRecipientScope()`;
- `classifyIntent()`;
- `selectChannel()`;
- `renderApprovedTemplate()`;
- `enqueueDelivery()`;
- `recordProviderEvent()`;
- `createFollowUp()`;
- `escalateCase()`;
- `closeCase()`.

### 4.2 Channel routing order

Routing is determined by urgency, consent, reachability, preference, cost, and message type.

| Message class | First channel | Fallback | Notes |
|---|---|---|---|
| Security/safeguarding | In-app + direct staff alert | Phone workflow | Do not rely only on automation |
| Transactional urgent | In-app/push + WhatsApp | Email | Respect WhatsApp consent and templates |
| Transactional normal | In-app + preferred channel | Email | Avoid duplicate copies unless policy requires |
| Academic reminder | In-app/push | Email or consented WhatsApp | Suppress after completion |
| Finance reminder | Email + in-app | Consented WhatsApp | Stop immediately after verified payment |
| Support conversation | Originating channel | Customer preference | Preserve one case timeline |
| Marketing | Explicitly consented channel | None | Separate opt-out per channel |

### 4.3 Inbound email

Implement a provider webhook or dedicated inbound mailbox processor. Each outbound case email must use a reply address or token that maps a reply to its conversation and case. Validate provider signatures, strip quoted history safely, scan attachments, and reject oversized or executable files.

### 4.4 WhatsApp

Use approved templates outside Meta's customer-service window. Store Meta message ID in one canonical column. Apply a unique constraint to provider message IDs. Never allow the transport layer and route layer to create two records for one send.

### 4.5 In-app communication

In-app messages are first-class messages, not truncated notification previews. A notification points to the complete case or conversation. A nonexistent internal address must return a clear failure, never `success: true`.

---

## 5. Canonical data model

Introduce or standardise the following entities. Existing tables may be migrated rather than duplicated.

### 5.1 `communication_contacts`

- `id`
- `portal_user_id`
- `crm_contact_id`
- `display_name`
- `primary_email`
- `primary_phone`
- `school_id`
- `contact_type`
- `preferred_channel`
- `timezone`
- `language`
- `verified_at`
- `merged_into_id`
- timestamps

### 5.2 `communication_cases`

- `id`
- `case_number`
- `contact_id`
- `conversation_id`
- `department`
- `intent`
- `subject`
- `priority`
- `status`
- `owner_id`
- `backup_owner_id`
- `school_id`
- `source_channel`
- `sla_first_response_at`
- `sla_resolution_at`
- `first_response_at`
- `resolved_at`
- `closed_at`
- `resolution_code`
- `resolution_summary`
- `customer_visible_status`
- timestamps

### 5.3 `communication_messages`

- `id`
- `conversation_id`
- `case_id`
- `direction`
- `channel`
- `sender_type`
- `sender_user_id`
- `recipient_contact_id`
- `subject`
- `body_text`
- `body_html_sanitised`
- `template_id`
- `provider`
- `provider_message_id`
- `idempotency_key`
- `status`
- `failure_code`
- `failure_detail_redacted`
- `queued_at`, `sent_at`, `delivered_at`, `read_at`, `failed_at`
- timestamps

Add unique indexes on `(provider, provider_message_id)` and `idempotency_key` when non-null.

### 5.4 `communication_tasks`

- `id`, `case_id`, `contact_id`
- `task_type`
- `title`, `description`
- `owner_id`
- `priority`
- `due_at`
- `status`
- `completed_at`
- `completion_note`
- timestamps

### 5.5 `communication_events`

Append-only audit stream for routing, ownership changes, consent changes, sends, delivery events, escalations, merges, access, exports, and closure.

### 5.6 `communication_preferences`

Maintain distinct preferences for:

- transactional email;
- transactional WhatsApp;
- push;
- SMS if introduced;
- marketing email;
- marketing WhatsApp;
- programme announcements;
- academic summaries;
- finance notices where legally optional.

Record consent source, wording/version, IP where appropriate, timestamp, and revocation timestamp.

---

## 6. Universal request lifecycle

### 6.1 Status model

```text
new -> acknowledged -> triaged -> assigned -> in_progress
                                  |              |
                                  v              v
                             waiting_staff  waiting_customer
                                  |              |
                                  +-------> resolved -> closed

Any active state -> escalated
Resolved -> reopened when the customer replies or rejects the resolution
```

### 6.2 Mandatory automatic actions

On every valid inbound request:

1. verify or create contact identity;
2. store the original message once;
3. create or attach to a case;
4. classify department, intent, urgency, sentiment, and safeguarding risk;
5. send an honest acknowledgement;
6. assign an owner using scope and workload;
7. calculate first-response and resolution SLAs;
8. create the next task;
9. notify the owner and backup;
10. display status to the customer.

### 6.3 Follow-up rules

- Notify owner at 50% of first-response SLA.
- Notify owner and backup at 80%.
- Escalate to department lead at 100%.
- Escalate to operations administrator at 150%.
- Inform the customer when a material delay occurs.
- Do not send “just checking” messages after the customer has completed the required action.
- Reopen the case when a customer replies within the configurable reopen window.
- Close only after a resolution message is delivered or a documented exception is approved.

---

## 7. Service levels

Times below are targets and must be configurable by business hours and department.

| Priority | Example | Acknowledgement | Human first response | Resolution target |
|---|---|---:|---:|---:|
| P0 Critical | Safeguarding, data breach, widespread outage | Immediate | 15 minutes | Continuous incident ownership |
| P1 Urgent | Payment blocked, live class access failure | Immediate | 30 minutes | 4 business hours |
| P2 High | Complaint, wrong invoice, account lockout | Immediate | 2 business hours | 1 business day |
| P3 Normal | General support, parent/teacher question | Immediate | 4 business hours | 2 business days |
| P4 Low | Suggestion, non-urgent request | Immediate | 1 business day | 5 business days or roadmap response |

Do not promise a two-hour response unless staffing, operating hours, alerts, and escalation rules can fulfil it.

---

## 8. Department workflows

### 8.1 Front desk and customer care

**Intake:** all unmatched inbound messages.  
**Automation:** greet, identify topic, provide safe self-service steps, create case, request missing non-sensitive details.  
**Human:** resolve or transfer with a warm handoff.  
**Close:** summary, useful link, satisfaction prompt.

Warm handoff text:

> I have routed case {{case_number}} to {{department}}. You do not need to repeat the details already provided. {{owner_or_team}} will update you by {{next_update_at}}.

### 8.2 Admissions and enrolment

Stages:

1. new enquiry;
2. qualified;
3. programme recommendation;
4. registration started;
5. payment pending;
6. paid;
7. onboarding incomplete;
8. onboarded;
9. first-week check-in;
10. retained or closed-lost with reason.

Automations:

- immediate enquiry acknowledgement;
- programme-fit information based on verified age/class and goals;
- 24-hour incomplete-form reminder;
- 72-hour helpful follow-up;
- final respectful follow-up;
- stop nurture on conversion, opt-out, invalid address, complaint, or staff takeover;
- create an onboarding-recovery task if payment succeeds but account/class setup is incomplete;
- send credentials only after verified provisioning;
- first-week satisfaction and access check.

### 8.3 Academic operations

Automations:

- publish term content from approved plans;
- remind students about upcoming work;
- suppress reminders after submission;
- alert teachers to grading queues;
- alert academic administration to overdue grading;
- notify parents only according to preferences and academic policy;
- produce weekly summaries from real activity data;
- flag data gaps instead of inventing a progress narrative.

Human approvals are required for grades, formal reports, curriculum publication policy, disciplinary communication, and exceptional progression decisions.

### 8.4 Student success and parent care

Create intervention cases for sustained inactivity, repeated absence, falling performance, or repeated access problems. Each intervention includes evidence, assigned teacher, recommended action, parent-contact state, next review date, and outcome.

Never label a child negatively. Use factual, supportive language and limit sensitive academic information to authorised recipients.

### 8.5 Teacher operations

Teacher workbench queues:

- messages awaiting reply;
- ungraded submissions;
- upcoming classes;
- attendance exceptions;
- intervention cases;
- reports awaiting completion;
- parent communication tasks;
- escalations assigned by academic administration.

Teachers may communicate only with students/classes in their authorised scope. Broad cross-school communication requires administration.

### 8.6 School partnerships

Maintain an account plan for every partner school:

- onboarding checklist;
- authorised contacts;
- programme/classes;
- devices/resources;
- teacher allocation;
- billing health;
- service issues;
- agreed review cadence;
- satisfaction and renewal risk;
- last and next executive review.

Automate milestone reminders and health alerts; require a real account owner for relationship decisions.

### 8.7 Finance

Finance communication must be event-driven and idempotent:

- invoice issued;
- payment initiated;
- payment verified;
- receipt issued;
- balance remaining;
- reminder due;
- overdue;
- evidence uploaded;
- evidence approved/rejected;
- refund requested/approved/completed;
- reconciliation exception.

Stop every payment reminder immediately after verified settlement. Never disclose balances to unauthorised contacts. Refunds and write-offs require human approval and audit records.

### 8.8 Complaints and feedback

Every complaint or question becomes a case. Required features:

- authenticated identity when available;
- public-submission rate limiting and bot protection;
- strict type, email, and length validation;
- admin detail page;
- owner and department assignment;
- internal notes separated from customer-visible replies;
- response editor with approved templates;
- send reply through originating/preferred channel;
- status history;
- SLA warnings and escalations;
- resolution summary and root cause;
- customer confirmation and CSAT;
- trend reporting by product area and cause.

### 8.9 Technical support and incidents

Create an incident when multiple cases share a probable cause. Link affected cases, publish a status update, send periodic updates, and close with a plain-language post-incident summary. Never expose internal stack traces or secrets.

### 8.10 Safeguarding and privacy

Safeguarding signals bypass normal queues and alert only designated authorised staff. Privacy requests require identity verification, tracked deadlines, data export/deletion review, legal hold checks, and an immutable audit log.

---

## 9. Modern communication template system

### 9.1 Mandatory template anatomy

Every operational message should contain only the applicable elements:

1. verified sender identity;
2. clear subject or WhatsApp heading;
3. recipient name;
4. purpose in the first sentence;
5. concise context;
6. one primary action;
7. deadline with date, time, and timezone;
8. case/reference number;
9. support/escalation path;
10. preference or opt-out text when legally required;
11. company signature and verified contact details.

### 9.2 Tone standard

Use warm, clear, respectful Nigerian English suitable for an international professional organisation. Avoid robotic filler, exaggerated promises, shame, pressure, fake scarcity, unexplained jargon, and excessive emoji. Use at most one purposeful emoji in WhatsApp marketing; transactional and complaint messages generally need none.

### 9.3 Acknowledgement template

**Subject:** We received your request - {{case_number}}

> Hello {{first_name}},
>
> Rillcod's automated assistant has received your request about {{plain_language_topic}} and assigned it to {{department}}.
>
> **Reference:** {{case_number}}  
> **Next update:** By {{next_update_at}}  
> **Current status:** {{customer_visible_status}}
>
> You can reply in this conversation; there is no need to repeat the information already provided.
>
> Rillcod Automated Assistant  
> {{verified_contact_line}}

### 9.4 Human response template

**Subject:** Update on {{case_number}} - {{short_topic}}

> Hello {{first_name}},
>
> I am {{real_staff_name}} from {{department}}. I reviewed your request and {{action_taken_or_answer}}.
>
> **What happens next:** {{next_step}}  
> **Expected by:** {{date_time_timezone}}
>
> If anything here is unclear, reply directly and the case will remain with our team.
>
> Kind regards,  
> {{real_staff_name}}  
> {{real_title}}, Rillcod Technologies  
> Reference: {{case_number}}

### 9.5 Delay template

> Hello {{first_name}}, we are still working on {{case_number}}. The delay is due to {{safe_plain_reason}}. {{owner_or_team}} remains responsible, and the next update will be sent by {{next_update_at}}. We apologise for the delay.

### 9.6 Resolution template

> Hello {{first_name}}, your request {{case_number}} has been resolved.
>
> **What we did:** {{resolution_summary}}  
> **Anything you need to do:** {{customer_action_or_none}}
>
> Reply within {{reopen_days}} days if the issue is not fully resolved. Otherwise, the case will close automatically. {{optional_csat_link}}

### 9.7 Complaint recovery template

> Hello {{first_name}},
>
> I am sorry that {{factual_summary_of_problem}}. Your complaint is recorded as {{case_number}} and is being handled by {{real_owner_or_quality_team}}.
>
> We have {{immediate_action}}. We will provide the next meaningful update by {{next_update_at}}. If this involves a child-safety or privacy concern, please use {{restricted_escalation_channel}}.

Do not admit legal liability automatically. Do acknowledge the experience, state facts, and show ownership.

### 9.8 Payment reminder template

> Hello {{first_name}}, this is a reminder that invoice {{invoice_number}} has an outstanding balance of {{currency}}{{amount}}, due {{due_date}}. View the invoice and verified payment options here: {{secure_link}}. If payment has already been completed, please ignore this message while verification finishes or submit evidence through your dashboard. Reference: {{case_number}}.

### 9.9 Marketing template

Marketing must include audience, consent basis, campaign objective, truthful offer, landing page, tracking identifiers, frequency cap, and unsubscribe mechanism.

> {{first_name}}, {{one_sentence_relevant_value}}. {{programme_or_event}} is available for {{eligible_audience}} from {{start_date}}. See verified details and fees: {{landing_page}}. Questions: {{contact_channel}}. Reply STOP to opt out of WhatsApp marketing.

---

## 10. Marketing and content operating system

### 10.1 Content pillars

- student learning value;
- parent education and guidance;
- teacher enablement;
- school transformation;
- project demonstrations;
- credible outcomes and case studies;
- programme information;
- events and community;
- company expertise and thought leadership;
- service updates.

### 10.2 Content workflow

```text
Brief -> Draft -> Evidence check -> Safeguarding/privacy check -> Brand review
      -> Approval -> Schedule -> Publish -> Moderate -> Measure -> Improve
```

AI may draft. A real authorised person approves public marketing. Student names, images, testimonials, work, or results require recorded permission.

### 10.3 Campaign lifecycle

Each campaign requires:

- campaign ID and owner;
- objective and target metric;
- consented audience segment;
- exclusion/suppression segment;
- value proposition and evidence;
- channel plan;
- approved creative/template version;
- frequency cap;
- start/end dates;
- landing page and attribution;
- follow-up sequence;
- conversion event;
- stop conditions;
- performance report and learning notes.

### 10.4 Recommended publishing rhythm

This is a planning baseline, not permission for unattended publishing.

| Cadence | Content |
|---|---|
| Daily | One useful operational update or approved educational insight when relevant |
| 2-3 times weekly | Project, lesson value, parent/teacher tip, or programme proof |
| Weekly | Newsletter or community roundup; avoid duplicating every social post |
| Monthly | Partner-school story, impact report, webinar, or detailed guide |
| Termly | Outcomes, curriculum progress, programme review, and next-term plan |

### 10.5 Lead nurture

Nurture must be helpful, consented, and state-aware. Stop immediately on conversion, opt-out, complaint, bounce, or human takeover. Do not run both form follow-up and lead-nurture sequences against the same person without a shared campaign lock.

---

## 11. Administration console

Create an `Office Operations` area for authorised administrators.

### 11.1 Executive overview

- open cases by department and priority;
- breached and at-risk SLAs;
- unread inbound messages;
- delivery failures by channel/provider;
- queue depth and oldest job age;
- unassigned work;
- customer satisfaction;
- complaints and root causes;
- leads by stage and conversion;
- payment and onboarding exceptions;
- academic operational exceptions;
- active incidents;
- automation health.

### 11.2 Unified workbench

Filters:

- mine, my department, unassigned, escalated;
- channel, school, programme, class;
- priority, status, intent;
- SLA at risk, breached, waiting customer;
- customer type and consent state;
- date range and last activity.

Actions:

- assign or transfer;
- change priority/status;
- add internal note;
- send approved reply;
- schedule follow-up;
- merge duplicate cases/contacts;
- escalate;
- resolve/reopen;
- export only with permission and audit reason.

### 11.3 Automation control centre

For every automation show:

- enabled/disabled;
- owner;
- schedule and timezone;
- last start and completion;
- last success/failure;
- records scanned/acted/skipped;
- next scheduled run;
- average duration;
- retry state;
- dead-letter count;
- manual run with confirmation and idempotency protection;
- link to redacted logs.

### 11.4 Template administration

- draft, reviewed, approved, retired states;
- version history;
- department and channel;
- required variables;
- preview with safe sample data;
- Meta template approval state;
- test-send to authorised test recipients;
- approval author and date;
- localisation and accessibility review.

### 11.5 RBAC

| Role | Scope |
|---|---|
| Super administrator | Configuration and audited emergency access |
| Operations administrator | Cross-department queues and escalation |
| Department lead | Department cases, templates, staff workload |
| Assigned staff | Assigned/scoped cases and approved actions |
| Teacher | Owned classes and assigned learners only |
| School administrator | Own school users, classes, and communications |
| Finance officer | Finance data and cases only |
| Marketing officer | Consented segments and campaigns, no academic secrets |
| Quality/compliance | Complaints, audits, restricted investigations |
| Parent/student | Own conversations, cases, preferences, and linked records |

Use server-side authorisation on every action. Hiding a button is not authorisation.

---

## 12. Automation schedule and dependency plan

External scheduler requests must use HTTPS and `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`. Keep the secret only in the scheduler and production environment. Alert on non-2xx responses and missed schedules.

`src/lib/operations/cron-registry.ts` is the single source of truth for this table. Regenerate it
with `npm run cron:table` after adding, retiming, or retiring a job — do not hand-edit it. The
registry also feeds each route's health interval and the Operations Health panel, and
`cron-registry.test.ts` fails the build if a route and its entry ever disagree.

**Every job is scheduled externally. Nothing is scheduled by the host.** `vercel.json` has no
`crons` key and `wrangler.toml` has no `[triggers]`, both deliberately. They previously listed nine
jobs that were never actually firing — confirmed against `cron_run_history` on 2026-07-31, where
`academic-readiness` ran twice in seven days instead of the seven implied by its daily 04:30 entry.
Do not re-add them: it would not restore a schedule, it would double-fire jobs that already run,
including the invoice, billing and payment reminders that email parents.

| Job | Schedule (WAT) | Maximum healthy age | Triggered by | Purpose |
|---|---:|---:|---|---|
| `process-notifications` | Every 2-5 minutes | 11 minutes | External scheduler | Email queue, WhatsApp outbox, scheduled newsletters |
| `live-session-reminders` | Every 10-15 minutes | 25 minutes | External scheduler | Upcoming live sessions |
| `onboarding-sweep` | Every 15 minutes | 25 minutes | External scheduler | Repair paid but incomplete onboarding; hosts the daily fan-out |
| `process-certificates` | Every 30 minutes | 75 minutes | External scheduler | Certificate queue |
| `communication-followup` | Hourly (fan-out) | 75 minutes | Fan-out from `onboarding-sweep` | Hourly owner reminder for unanswered customer communication |
| `integrity-sweep` | Daily 03:00 | 30 hours | External scheduler | Operational data integrity and self-healing repair |
| `academic-readiness` | Daily (fan-out) | 30 hours | Fan-out from `onboarding-sweep` | Prepare official teaching plans and notify teachers |
| `term-scheduler` | Weekly | 8.8 days | External scheduler | Release approved term content |
| `receipt-sweep` | Every 30 minutes | 75 minutes | External scheduler | Missing receipt recovery |
| `at-risk-students` | Daily 07:00 | 30 hours | External scheduler | Student-success detection; fans out registration and payment recovery |
| `invoice-reminders` | Daily 07:00 | 30 hours | External scheduler | Student invoice reminders |
| `billing-reminders` | Daily 08:00 | 30 hours | External scheduler | Partner-school billing |
| `payment-reminders` | Daily 09:00 | 30 hours | External scheduler | Outstanding registration balances |
| `school-report-readiness` | Daily 10:00 | 30 hours | External scheduler | Partner-school reporting readiness |
| `weekly-summary` | Monthly, 1st at 09:00 | 37.5 days | External scheduler | Parent summary |
| `assignment-reminders` | Daily (fan-out) | 30 hours | Fan-out from `onboarding-sweep` | Upcoming assignment reminders |
| `form-followup` | Daily (fan-out) | 30 hours | Fan-out from `onboarding-sweep` | Form and registration follow-up |
| `lead-nurture` | Daily (fan-out) | 30 hours | Fan-out from `onboarding-sweep` | State-aware lead nurture |
| `streak-reminder` | Every 15 minutes (also fanned out by at-risk-students) | 25 minutes | External scheduler | Engagement reminder |
| `auto-generate-content` | Hourly (fan-out); also chained from academic-readiness | 75 minutes | Fan-out from `onboarding-sweep` | Approved academic plan generation |
| `publish-newsletters` | Optional; the same work runs inside process-notifications | 15 minutes | Runs inside `process-notifications` | Scheduled newsletter publication |

Only the `External scheduler` rows need an entry on cron-job.org. **`communication-followup` has
never been confirmed as registered** — nothing in this repo triggers it. It is now monitored, so
Operations Health shows it as "Waiting for first run" until someone verifies the scheduler entry.

### 12.1 Fan-out warning

Fan-out is useful but must not hide missing schedules. The health dashboard must display child-job results. Critical queue draining should have its own external schedule rather than depend only on a daily parent job.

### 12.2 Idempotency

Every job must be safe to call more than once. Use event/reference-based idempotency keys stored durably in the database or provider-aware outbox. Do not set a duplicate-suppression key permanently before delivery without clearing or transitioning it correctly on failure.

---

## 13. Required remediation of current communication gaps

### P0 - seal before describing the office as autonomous

- [ ] Remove double WhatsApp message logging. One service owns persistence.
- [ ] Standardise on one `provider_message_id` field and update it from delivery webhooks.
- [ ] Add unique idempotency constraints for outbound and inbound provider messages.
- [ ] Make WhatsApp webhook signature verification fail closed in production.
- [ ] Protect public feedback with rate limiting, bot protection, validation, and identity rules.
- [ ] Stop accepting arbitrary client-supplied `user_id`, `user_role`, or trusted identity values.
- [ ] Add durable queue failure handling and a dead-letter queue.
- [ ] Alert administrators when Redis/provider configuration is unavailable.
- [ ] Confirm external cron coverage, secrets, non-2xx alerts, and last-success monitoring.
- [ ] Rotate any credential ever committed or distributed insecurely.

### P1 - complete the customer journey

- [ ] Build feedback detail, assignment, reply, resolution, and reopen APIs/pages.
- [ ] Correct dead notification links.
- [ ] Implement inbound email ingestion and conversation threading.
- [ ] Return failure when an in-app recipient does not exist.
- [ ] Create cases automatically for inbound WhatsApp/email/in-app/feedback.
- [ ] Create SLA metadata automatically on intake.
- [ ] Run SLA monitoring independently of a staff member opening the queue page.
- [ ] Add customer-visible case status and history.
- [ ] Route unlinked WhatsApp prospects to Front Desk rather than silently skipping them.
- [ ] Add human takeover, delay, escalation, resolution, and satisfaction workflows.

### P2 - operate like a large professional company

- [ ] Add executive operations and automation-health dashboards.
- [ ] Add department queues, workload balancing, backup ownership, and business hours.
- [ ] Centralise templates with approval/versioning.
- [ ] Add campaign management, consented segmentation, frequency limits, and attribution.
- [ ] Add partner-school account health and review workflows.
- [ ] Add incident management and status communication.
- [ ] Add root-cause and recurring-problem reporting.
- [ ] Add quality sampling and coaching reports.

### P3 - continuous optimisation

- [ ] Add template experiments with ethical controls and minimum sample sizes.
- [ ] Add intent-quality review and misrouting correction.
- [ ] Add multilingual templates only after human review.
- [ ] Add forecasting for queue volume and staffing needs.
- [ ] Add knowledge-base gap detection from unresolved topics.

---

## 14. Security, privacy, and compliance controls

- Keep service-role, provider, cron, payment, signing, and AI secrets server-side.
- Validate webhook signatures using raw bodies and constant-time comparison.
- Fail closed for required production security configuration.
- Apply per-IP, per-account, per-contact, and per-destination rate limits.
- Restrict attachment types; virus-scan and store privately with expiring links.
- Redact access tokens, passwords, full payment details, and sensitive child data from logs.
- Encrypt sensitive data at rest where required and use TLS in transit.
- Apply row-level security plus server-side scope checks.
- Audit reads and exports of highly sensitive data.
- Define retention by data class and delete expired communication content safely.
- Honour channel-specific opt-outs immediately.
- Separate service communication from marketing consent.
- Provide privacy access, correction, deletion, and objection workflows.
- Require dual approval for bulk exports and high-impact broadcasts.
- Use test recipients and dry-run previews before bulk sends.
- Maintain suppression lists for bounces, complaints, invalid numbers, and opt-outs.

---

## 15. Reliability and observability

### 15.1 Queue requirements

- durable storage;
- visibility timeout or atomic claim;
- exponential backoff with jitter;
- bounded retries by failure class;
- dead-letter state;
- manual replay with idempotency;
- priority lanes;
- queue-age metrics;
- provider rate-limit awareness;
- graceful degradation and clear customer/staff status.

### 15.2 Required alerts

- cron missed or non-2xx;
- queue oldest job above threshold;
- delivery failure spike;
- authentication/signature failures;
- WhatsApp or email credentials invalid;
- webhook silence beyond expected window;
- dead-letter item created;
- SLA breach spike;
- unassigned critical case;
- duplicate provider message detected;
- payment-success/onboarding mismatch;
- database or RLS errors affecting communication.

### 15.3 Health states

Each channel shows `healthy`, `degraded`, `paused`, or `unavailable`, with last checked time and safe reason. Never display “sent” merely because the provider request was attempted.

---

## 16. Metrics and quality governance

### 16.1 Customer metrics

- acknowledgement time;
- first human response time;
- resolution time;
- SLA attainment;
- reopen rate;
- customer satisfaction;
- customer effort score;
- repeat-contact rate;
- channel preference and containment;
- opt-out and complaint rate.

### 16.2 Operational metrics

- open workload by owner/department;
- unassigned age;
- automation success and failure;
- queue depth and oldest age;
- delivery/read/reply rates;
- escalation rate;
- transfer rate;
- backlog age;
- template usage and quality;
- recurring causes;
- conversion, onboarding completion, retention, and collection outcomes.

### 16.3 Quality review

Review a representative sample weekly. Score accuracy, empathy, clarity, ownership, privacy, correct routing, useful next step, and complete resolution. Automation suggestions that perform poorly must be revised or disabled.

---

## 17. Testing strategy

### 17.1 Unit tests

- intent and priority classification;
- identity merge rules;
- consent and channel selection;
- recipient authorisation;
- template rendering and escaping;
- idempotency and retry classification;
- SLA calculation;
- campaign suppression;
- status transitions.

### 17.2 Integration tests

- inbound webhook -> one stored message -> one case -> acknowledgement;
- staff reply -> one provider request -> one stored message;
- provider delivered/read/failed -> correct canonical message update;
- email reply -> correct case thread;
- Redis/provider failure -> retry/dead letter/admin alert;
- payment completion -> reminders stop;
- opt-out -> every affected automation stops;
- feedback -> assigned case -> human reply -> close -> CSAT;
- school/teacher/student scope boundaries;
- cron duplicate calls produce no duplicate customer messages.

### 17.3 End-to-end acceptance journeys

Test with authorised sandbox recipients:

1. unknown WhatsApp prospect;
2. known parent WhatsApp question;
3. student in-app message to teacher;
4. parent email reply;
5. complaint escalation;
6. unpaid invoice then payment;
7. paid registration with failed onboarding then recovery;
8. live-session reminder;
9. assignment reminder followed by submission suppression;
10. marketing opt-in and opt-out;
11. provider outage and recovery;
12. duplicate webhook delivery.

Verify database state, UI timeline, provider event, owner task, SLA, fallback, audit log, and customer-visible wording for each journey.

---

## 18. Delivery roadmap

### Phase 0 - governance and baseline (2-3 days)

- appoint owners and backups;
- inventory external cron jobs and production secrets without copying secret values;
- measure current queues, failures, response times, and channel health;
- freeze unsupported service promises;
- approve department names, business hours, and SLA targets.

### Phase 1 - seal correctness and security (1-2 weeks)

- fix duplicate WhatsApp persistence/statuses;
- harden feedback and webhooks;
- implement durable failures/dead letters;
- implement cron health monitoring;
- correct false-success and dead-link behaviour;
- add targeted regression tests.

### Phase 2 - unified cases and feedback completion (2-4 weeks)

- canonical case/message/task/event model;
- unified timeline;
- feedback admin response workflow;
- SLA calculation and proactive escalation;
- customer case status;
- department assignment.

### Phase 3 - email and omnichannel continuity (2-3 weeks)

- inbound email webhook/mailbox;
- reply threading;
- channel preference/fallback engine;
- template registry and approval;
- canonical delivery tracking.

### Phase 4 - department operations (3-5 weeks)

- workbenches and dashboards;
- admissions, academic, finance, school-partner, and student-success flows;
- incident management;
- quality and executive reporting.

### Phase 5 - marketing and optimisation (3-5 weeks)

- consented campaign system;
- content approval calendar;
- attribution and suppression;
- campaign reporting;
- knowledge-base and intent improvement.

Do not launch every automated department at once. Pilot one queue, measure quality, correct it, and expand.

---

## 19. Definition of done

The automated office is ready to be described as seamless only when all statements below are demonstrably true:

**Coverage audit: 20 July 2026 - all planned in-app structures implemented. External email-provider routing remains an operator connection check, and test coverage remains continuous work.**

- [ ] **External connection check:** Main inbound channels write one canonical message. The email provider must point inbound mail to `/api/webhooks/inbound-email` in each deployed environment.
- [x] **Complete:** Connected actionable requests have a case, real owner, department, priority, response target, next action, due time, and full history.
- [x] **Complete:** Governed automated email identifies itself as automated, while staff-written inbox email is marked as human-written.
- [x] **Complete:** Normalized portal identity, email, and phone aliases join a customer's connected-channel history.
- [ ] **External connection check:** Reply headers, provider IDs, thread references, and case tokens link email replies; the email provider webhook must be pointed at the deployed endpoint and tested with one real reply.
- [x] WhatsApp sends do not create duplicate records.
- [ ] **External connection check:** WhatsApp and email sent/delivered/read/failed status are supported. The email provider must send status events to `/api/webhooks/email-status`.
- [x] **Complete:** No notification queue silently drops work when infrastructure is missing. Redis absence and Redis errors persist to durable recovery; failure of both queue and recovery storage is returned to the caller.
- [x] **Complete:** Failed notification jobs enter a visible dead-letter workflow with administrator retry, resolve, ignore, and audit fields.
- [x] **Complete:** All listed external cron routes expose last run, last success, duration, result, lateness, and repeated-failure alerts inside Operations Health.
- [x] **Complete:** Feedback can be assigned, answered, resolved, reopened, rated, measured, and linked to customer outcomes.
- [x] SLA escalation runs without staff opening a dashboard.
- [x] **Complete:** Marketing is consented, paced, attributable, measurable, separate from service messages, and easy to stop by settings or WhatsApp command.
- [x] Payment reminders stop after verified payment.
- [x] Unauthorised staff cannot access other schools/classes/cases.
- [x] **Complete:** Safeguarding, privacy, fraud, and serious complaints use restricted human classification and incident tracking.
- [x] **Complete:** Governed templates are approved, versioned, tested, accessible through one registry, and delivery logs retain the template reference. Legacy messages can be migrated without weakening the central audit trail.
- [ ] **Continuous hardening:** Automated tests cover routing, consent, duplicate ownership, successful runs, reported provider failure, and durable queue recovery. Real-provider timeout drills remain part of release checks.
- [x] **Complete:** Office Results and audit history show response targets, resolution speed, delivery, safety, marketing restraint, and customer value.
- [x] **Complete:** Rating, reopening, satisfaction, and customer-value outcomes measure whether communication helped rather than only counting messages.

---

## 20. Final operating standard

Rillcod should look and behave like one giant professional company because its work is coordinated, accountable, measurable, secure, and caring. The experience must come from a strong operating system: one timeline, clear departments, truthful automation, real ownership, reliable delivery, thoughtful templates, proactive follow-up, and continuous quality improvement.

The measure of success is not how many automated messages are sent. It is how few customers are lost between teams, how quickly legitimate needs are resolved, how safely data is handled, and how consistently every interaction gives the customer something useful.
