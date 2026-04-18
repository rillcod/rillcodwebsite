# Rillcod Technologies - Mobile App Development Handoff

**Project**: Rillcod Technologies Mobile App (React Native/Expo)  
**Backend**: Shared with Web App (Next.js)  
**Status**: Web Complete, Ready for Mobile Development  
**Date**: 2026-04-18  
**Version**: 1.0

---

## 🎯 Executive Summary

This document provides everything needed to build the Rillcod Technologies mobile app using the existing backend infrastructure. The web application is complete and production-ready. The mobile app will use the same:
- Supabase database
- API endpoints
- Authentication system
- Business logic
- WhatsApp integration

**Key Principle**: NO NEW MIGRATIONS. Work within existing database schema.

---

## 📱 Project Overview

### What is Rillcod Technologies?
An all-in-one school management platform for Nigerian schools providing:
- Student enrollment and management
- Course and lesson planning
- Assignment and grading system
- Payment processing (Paystack integration)
- WhatsApp communication (Meta Business API)
- Parent-teacher messaging
- Flashcard study system
- Analytics and reporting
- CBT (Computer-Based Testing)

### Platform Architecture
```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND LAYER                     │
├──────────────────────┬──────────────────────────────┤
│   Web App (Next.js)  │  Mobile App (Expo/RN)       │
│   ✅ COMPLETE        │  🔄 TO BE BUILT             │
└──────────────────────┴──────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              SHARED BACKEND (Supabase)               │
├─────────────────────────────────────────────────────┤
│  • PostgreSQL Database (Schema Complete)            │
│  • Row Level Security (RLS) Policies                │
│  • Real-time Subscriptions                          │
│  • Storage (File Uploads)                           │
│  • Edge Functions                                   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              API LAYER (Next.js API Routes)          │
├─────────────────────────────────────────────────────┤
│  • RESTful Endpoints (All Complete)                 │
│  • WhatsApp Business API Integration                │
│  • Paystack Payment Gateway                         │
│  • AI Content Generation (OpenAI)                   │
│  • Email Service (SendPulse)                        │
└─────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema (COMPLETE - DO NOT MODIFY)

### Core Tables

**Users & Authentication:**
- `portal_users` - All users (students, parents, teachers, schools, admins)
  - Columns: id, email, full_name, phone, role, school_id, whatsapp_opt_in, is_active
  - Roles: student, parent, teacher, school, admin
  
**Academic:**
- `courses` - Course catalog
- `enrollments` - Student course enrollments
- `lessons` - Individual lessons
- `lesson_plans` - Teacher lesson plans
- `assignments` - Student assignments
- `submissions` - Assignment submissions
- `grades` - Student grades
- `timetables` - Class schedules

**Communication:**
- `whatsapp_conversations` - WhatsApp chat threads
  - NEW: opted_out, opted_out_at, opted_in_at (compliance)
- `whatsapp_messages` - Individual WhatsApp messages
- `parent_teacher_threads` - Parent-teacher conversations
- `parent_teacher_messages` - Parent-teacher messages
- `school_teacher_conversations` - School-teacher conversations
- `school_teacher_messages` - School-teacher messages
- `announcements` - School-wide announcements

**Financial:**
- `payments` - Payment records
- `transactions` - Payment transactions
- `instalment_plans` - Payment plans

**Learning:**
- `flashcard_decks` - Flashcard collections
- `flashcard_cards` - Individual flashcards
- `study_sessions` - Study tracking
- `cbt_tests` - Computer-based tests
- `cbt_questions` - Test questions
- `cbt_attempts` - Student test attempts

**System:**
- `activity_logs` - Audit trail
- `notifications` - Push notifications
- `feedback` - User feedback
- `consent_forms` - Parental consent

---

## 🔐 Authentication System

### Supabase Auth (Already Configured)

**Provider**: Supabase Auth  
**Methods**: Email/Password, Magic Link  
**Session Management**: JWT tokens  
**Refresh**: Automatic token refresh

**Mobile Implementation:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});

// Get session
const { data: { session } } = await supabase.auth.getSession();

// Sign out
await supabase.auth.signOut();
```

**User Roles:**
- `student` - Primary mobile app users
- `parent` - View child's progress
- `teacher` - Manage classes (limited mobile features)
- `school` - Admin access (web primarily)
- `admin` - Super admin (web only)

---

## 🌐 API Endpoints (ALL READY TO USE)

### Base URL
```
Production: https://your-domain.com/api
Development: http://localhost:3000/api
```

### Authentication Required
All endpoints require valid Supabase session token in headers:
```typescript
headers: {
  'Authorization': `Bearer ${session.access_token}`,
  'Content-Type': 'application/json'
}
```

### Available Endpoints

**Dashboard & Stats:**
- `GET /api/dashboard/stats` - User dashboard statistics
- `GET /api/dashboard/activity` - Recent activity feed
- `GET /api/dashboard/timetable` - Class schedule

**Courses & Lessons:**
- `GET /api/courses` - List available courses
- `GET /api/courses/[id]` - Course details
- `POST /api/enrollments` - Enroll in course
- `GET /api/lessons` - List lessons
- `GET /api/lesson-plans` - Lesson plans
- `GET /api/lesson-plans/[id]` - Lesson plan details

**Assignments:**
- `GET /api/assignments` - List assignments
- `GET /api/assignments/[id]` - Assignment details
- `POST /api/assignments/[id]/submit` - Submit assignment
- `GET /api/submissions` - My submissions

**Grades & Progress:**
- `GET /api/grades` - My grades
- `GET /api/progress` - Learning progress
- `GET /api/analytics/at-risk` - At-risk students (teachers)

**Flashcards:**
- `GET /api/flashcards/decks` - List flashcard decks
- `GET /api/flashcards/decks/[id]` - Deck details
- `GET /api/flashcards/decks/[id]/cards` - Cards in deck
- `POST /api/flashcards/decks/[id]/study` - Record study session
- `PUT /api/flashcards/cards/[id]` - Update card (flip, mark)

**Payments:**
- `GET /api/payments/transactions` - Payment history
- `POST /api/payments/initialize` - Start payment
- `GET /api/payments/verify/[reference]` - Verify payment
- `GET /api/billing/instalment-plans` - Payment plans

**Communication:**
- `GET /api/inbox` - WhatsApp conversations
- `GET /api/inbox?conversation_id=[id]` - Messages in conversation
- `POST /api/inbox/send` - Send WhatsApp message
- `POST /api/inbox/opt-out` - Opt out of WhatsApp
- `PUT /api/inbox/opt-out` - Opt in to WhatsApp
- `GET /api/school-teacher/conversations` - School-teacher chats
- `POST /api/school-teacher/conversations` - Start conversation

**Announcements:**
- `GET /api/announcements` - List announcements
- `GET /api/announcements/[id]` - Announcement details
- `PUT /api/announcements/[id]/read` - Mark as read

**Feedback:**
- `POST /api/feedback` - Submit feedback
- `GET /api/feedback` - My feedback

**Push Notifications:**
- `POST /api/push/subscribe` - Register device
- `POST /api/push/unsubscribe` - Unregister device

**CBT (Computer-Based Testing):**
- `GET /api/cbt/tests` - Available tests
- `GET /api/cbt/tests/[id]` - Test details
- `POST /api/cbt/tests/[id]/start` - Start test attempt
- `POST /api/cbt/tests/[id]/submit` - Submit answers
- `GET /api/cbt/attempts` - My test attempts

---

## 📋 Business Rules & Policies

### User Access Control

**Students Can:**
- View enrolled courses and lessons
- Submit assignments
- View grades and progress
- Use flashcards
- Take CBT tests
- Receive WhatsApp notifications (if opted in)
- View announcements
- Make payments
- Chat with teachers (via parent-teacher system)

**Students Cannot:**
- Create courses or lessons
- Grade assignments
- Access other students' data
- Send WhatsApp broadcasts
- Access admin features

**Parents Can:**
- View child's progress
- Communicate with teachers
- Make payments
- View announcements
- Receive notifications

**Teachers Can:**
- View their students
- Create lesson plans
- Grade assignments
- Send messages
- View analytics

### WhatsApp Communication Rules

**Compliance (CRITICAL):**
- Users must opt-in to receive WhatsApp messages
- Users can opt-out anytime by replying "STOP"
- Auto-responses must show "🤖 Auto-Response" indicator
- Include "Reply STOP to unsubscribe" in all automated messages
- Respect 24-hour messaging window (until app approved)
- Cannot initiate conversations (only reply) until app approved

**Opt-In/Opt-Out:**
- Check `whatsapp_conversations.opted_out` before sending
- Check `portal_users.whatsapp_opt_in` for user preference
- API will return 403 if user opted out
- Provide clear opt-in checkbox during registration

**Rate Limits:**
- Free tier: 1,000 conversations/month, 250 messages/day
- Detect error codes: 80007, 130429
- Show clear message when limit reached
- Recommend upgrade to paid tier

### Payment Processing

**Provider**: Paystack  
**Currency**: Nigerian Naira (NGN)  
**Methods**: Card, Bank Transfer, USSD

**Flow:**
1. Initialize payment via `/api/payments/initialize`
2. Redirect to Paystack checkout
3. User completes payment
4. Webhook receives confirmation
5. Verify via `/api/payments/verify/[reference]`
6. Update user account

**Instalment Plans:**
- Available for school fees
- Configured per school
- Automatic reminders via WhatsApp

### Data Privacy

**GDPR/NDPR Compliance:**
- Users own their data
- Can request deletion
- Can export data
- Consent required for WhatsApp
- Privacy policy must be shown

**Data Retention:**
- Active users: Indefinite
- Inactive users: 90 days
- Opted-out users: 30 days
- Messages: 90 days (configurable)

---

## 🔧 Environment Variables (Mobile App)

Create `.env` file in mobile app root:

```bash
# Supabase (Same as Web)
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...

# API Base URL
EXPO_PUBLIC_API_URL=https://your-domain.com/api

# Paystack (Same as Web)
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_xxx

# App Config
EXPO_PUBLIC_APP_NAME=Rillcod Technologies
EXPO_PUBLIC_APP_VERSION=1.0.0

# Push Notifications (Optional)
EXPO_PUBLIC_ONESIGNAL_APP_ID=xxx

# Feature Flags
EXPO_PUBLIC_ENABLE_WHATSAPP=true
EXPO_PUBLIC_ENABLE_PAYMENTS=true
EXPO_PUBLIC_ENABLE_CBT=true
EXPO_PUBLIC_ENABLE_FLASHCARDS=true
```

---

## 📱 Mobile App Features (Priority Order)

### Phase 1: Core Features (MVP)
1. **Authentication**
   - Login/Register
   - Password reset
   - Profile management

2. **Dashboard**
   - Stats overview
   - Recent activity
   - Quick actions

3. **Courses & Lessons**
   - Browse courses
   - View lessons
   - Track progress

4. **Assignments**
   - View assignments
   - Submit work
   - View grades

5. **Notifications**
   - Push notifications
   - In-app notifications
   - WhatsApp opt-in

### Phase 2: Communication
6. **WhatsApp Integration**
   - View conversations
   - Send/receive messages
   - Opt-in/opt-out
   - Quick chat by number

7. **Announcements**
   - View announcements
   - Mark as read
   - Filter by category

### Phase 3: Learning Tools
8. **Flashcards**
   - Browse decks
   - Study mode
   - Track progress
   - Spaced repetition

9. **CBT Tests**
   - Take tests
   - View results
   - Practice mode

### Phase 4: Financial
10. **Payments**
    - View balance
    - Make payments
    - Payment history
    - Instalment plans

### Phase 5: Advanced
11. **Analytics**
    - Progress charts
    - Performance insights
    - Study streaks

12. **Offline Mode**
    - Cache lessons
    - Offline flashcards
    - Sync when online

---

## 🎨 Design System

### Brand Colors
```typescript
const colors = {
  primary: '#F97316',      // Orange-500
  secondary: '#10B981',    // Emerald-500
  accent: '#8B5CF6',       // Violet-500
  background: '#111B21',   // Dark
  surface: '#1F2C34',      // Card background
  text: '#FFFFFF',         // White
  textSecondary: '#9CA3AF', // Gray-400
  error: '#EF4444',        // Red-500
  success: '#10B981',      // Emerald-500
  warning: '#F59E0B',      // Amber-500
};
```

### Typography
```typescript
const typography = {
  h1: { fontSize: 32, fontWeight: '900' },
  h2: { fontSize: 24, fontWeight: '800' },
  h3: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 16, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '600' },
};
```

### Spacing
```typescript
const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
```

---

## 🔌 Real-time Features

### Supabase Realtime (Already Configured)

**Subscribe to Changes:**
```typescript
// Listen for new messages
const subscription = supabase
  .channel('whatsapp_messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'whatsapp_messages'
  }, (payload) => {
    console.log('New message:', payload.new);
  })
  .subscribe();

// Cleanup
subscription.unsubscribe();
```

**Available Channels:**
- `whatsapp_messages` - New WhatsApp messages
- `parent_teacher_messages` - Parent-teacher chats
- `announcements` - New announcements
- `notifications` - Push notifications
- `grades` - New grades posted

---

## 📦 Recommended Tech Stack

### Core
- **Framework**: Expo (React Native)
- **Language**: TypeScript
- **Navigation**: Expo Router or React Navigation
- **State**: Zustand or React Query
- **Forms**: React Hook Form
- **UI**: NativeWind (Tailwind for RN) or React Native Paper

### Backend Integration
- **Database**: @supabase/supabase-js
- **HTTP**: Axios or Fetch API
- **Real-time**: Supabase Realtime
- **Auth**: Supabase Auth

### Features
- **Payments**: react-native-paystack-webview
- **Push**: expo-notifications or OneSignal
- **Storage**: AsyncStorage or MMKV
- **Images**: expo-image
- **Camera**: expo-camera (for assignments)
- **Documents**: expo-document-picker

---

## 🚀 Getting Started (Mobile Development)

### Step 1: Initialize Expo Project
```bash
npx create-expo-app rillcod-mobile --template
cd rillcod-mobile
```

### Step 2: Install Dependencies
```bash
# Core
npm install @supabase/supabase-js
npm install @react-navigation/native
npm install zustand react-query

# UI
npm install nativewind
npm install tailwindcss

# Features
npm install expo-notifications
npm install react-native-paystack-webview
npm install @react-native-async-storage/async-storage
```

### Step 3: Configure Supabase
```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

### Step 4: Create Auth Context
```typescript
// contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('portal_users')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### Step 5: Create API Client
```typescript
// lib/api.ts
import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Authorization': `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
  };
}

export const api = {
  async get(endpoint: string) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}${endpoint}`, { headers });
    return response.json();
  },

  async post(endpoint: string, data: any) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // Add PUT, DELETE as needed
};
```

---

## ✅ Implementation Checklist

### Before Starting
- [ ] Read this entire document
- [ ] Review web app codebase
- [ ] Understand database schema
- [ ] Test API endpoints with Postman
- [ ] Set up development environment

### Phase 1: Setup
- [ ] Initialize Expo project
- [ ] Install dependencies
- [ ] Configure Supabase
- [ ] Set up navigation
- [ ] Create auth flow

### Phase 2: Core Features
- [ ] Dashboard screen
- [ ] Courses list
- [ ] Lesson viewer
- [ ] Assignment list
- [ ] Assignment submission

### Phase 3: Communication
- [ ] WhatsApp inbox
- [ ] Message sending
- [ ] Opt-in/opt-out
- [ ] Announcements

### Phase 4: Learning
- [ ] Flashcards
- [ ] CBT tests
- [ ] Progress tracking

### Phase 5: Financial
- [ ] Payment integration
- [ ] Transaction history
- [ ] Instalment plans

### Phase 6: Polish
- [ ] Push notifications
- [ ] Offline mode
- [ ] Error handling
- [ ] Loading states
- [ ] Empty states

---

## 🎯 Key Success Factors

1. **Use Existing Backend** - Don't create new APIs
2. **No New Migrations** - Work with current schema
3. **Follow Web Patterns** - Maintain consistency
4. **Mobile-First UX** - Optimize for touch
5. **Offline Support** - Cache critical data
6. **Performance** - Fast load times
7. **Compliance** - Respect opt-out, privacy
8. **Testing** - Test on real devices

---

## 📞 Support & Resources

**Documentation:**
- This file (complete handoff)
- `docs/POLICIES.md` - Business policies
- `docs/WHATSAPP_SETUP.md` - WhatsApp integration
- `docs/PRIVACY_POLICY_WHATSAPP_ADDENDUM.md` - Privacy compliance

**API Testing:**
- Use Postman or Insomnia
- Base URL: https://your-domain.com/api
- Test with valid session token

**Database Access:**
- Supabase Dashboard: https://supabase.com/dashboard
- Use SQL Editor for queries
- Check RLS policies before querying

**Questions:**
- Email: support@rillcod.com
- Review web app code for examples
- Check API route files for implementation details

---

## 🎉 You're Ready!

Everything you need is in place:
✅ Database schema complete
✅ API endpoints ready
✅ Authentication configured
✅ Business logic implemented
✅ Compliance handled
✅ Documentation complete

**Next Step**: Initialize your Expo project and start building!

**Remember**: You're building the mobile interface for an existing, working system. Focus on great UX and leverage the robust backend that's already there.

---

**Last Updated**: 2026-04-18  
**Version**: 1.0  
**Status**: Ready for Mobile Development

**Good luck building an amazing mobile experience!** 🚀📱
