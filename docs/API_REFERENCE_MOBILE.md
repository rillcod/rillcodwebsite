# API Reference for Mobile App Development

**Base URL**: `https://your-domain.com/api`  
**Auth**: Bearer token in Authorization header  
**Format**: JSON

---

## Authentication

All requests require Supabase session token:
```typescript
headers: {
  'Authorization': `Bearer ${session.access_token}`,
  'Content-Type': 'application/json'
}
```

---

## Dashboard

### Get Dashboard Stats
```http
GET /api/dashboard/stats
```

**Response:**
```json
{
  "enrollments": 5,
  "assignments": 12,
  "grades": 8,
  "attendance": 95
}
```

### Get Activity Feed
```http
GET /api/dashboard/activity?limit=20
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "assignment_graded",
      "message": "Assignment graded: Math Quiz",
      "created_at": "2026-04-18T10:00:00Z"
    }
  ]
}
```

---

## Courses

### List Courses
```http
GET /api/courses?page=1&limit=20
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Mathematics 101",
      "description": "Basic mathematics",
      "instructor": "Mr. John Doe",
      "enrolled": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50
  }
}
```

### Get Course Details
```http
GET /api/courses/[id]
```

---

## Assignments

### List Assignments
```http
GET /api/assignments?status=pending&page=1
```

**Query Params:**
- `status`: pending, submitted, graded
- `course_id`: filter by course
- `page`, `limit`: pagination

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Math Quiz 1",
      "description": "Complete exercises 1-10",
      "due_date": "2026-04-25T23:59:59Z",
      "status": "pending",
      "course": {
        "id": "uuid",
        "title": "Mathematics 101"
      }
    }
  ]
}
```

### Submit Assignment
```http
POST /api/assignments/[id]/submit
Content-Type: application/json

{
  "content": "My submission text",
  "file_url": "https://storage.supabase.co/..."
}
```

---

## WhatsApp

### List Conversations
```http
GET /api/inbox
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "contact_name": "John Doe",
      "phone_number": "2348000000000",
      "last_message_preview": "Hello!",
      "last_message_at": "2026-04-18T10:00:00Z",
      "unread_count": 2,
      "opted_out": false
    }
  ]
}
```

### Get Messages
```http
GET /api/inbox?conversation_id=[id]&limit=50
```

### Send Message
```http
POST /api/inbox/send
Content-Type: application/json

{
  "conversation_id": "uuid",
  "message": "Hello, how are you?"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "body": "Hello, how are you?",
    "created_at": "2026-04-18T10:00:00Z",
    "status": "sent"
  },
  "whatsapp_status": "sent"
}
```

**Error (Opted Out):**
```json
{
  "error": "User has opted out of WhatsApp notifications",
  "opted_out": true
}
```

### Opt Out
```http
POST /api/inbox/opt-out
Content-Type: application/json

{
  "conversation_id": "uuid"
}
```

### Opt In
```http
PUT /api/inbox/opt-out
Content-Type: application/json

{
  "conversation_id": "uuid"
}
```

---

## Flashcards

### List Decks
```http
GET /api/flashcards/decks
```

### Get Deck with Cards
```http
GET /api/flashcards/decks/[id]/cards
```

**Response:**
```json
{
  "deck": {
    "id": "uuid",
    "title": "Math Formulas",
    "description": "Essential formulas",
    "card_count": 20
  },
  "cards": [
    {
      "id": "uuid",
      "front": "What is Pythagoras theorem?",
      "back": "a² + b² = c²",
      "mastery_level": 3
    }
  ]
}
```

### Record Study Session
```http
POST /api/flashcards/decks/[id]/study
Content-Type: application/json

{
  "cards_studied": 10,
  "duration_minutes": 15,
  "correct_count": 8
}
```

---

## Payments

### Initialize Payment
```http
POST /api/payments/initialize
Content-Type: application/json

{
  "amount": 50000,
  "description": "School Fees - Term 1",
  "callback_url": "myapp://payment-success"
}
```

**Response:**
```json
{
  "success": true,
  "authorization_url": "https://checkout.paystack.com/...",
  "reference": "ref_xxx",
  "access_code": "xxx"
}
```

### Verify Payment
```http
GET /api/payments/verify/[reference]
```

### Payment History
```http
GET /api/payments/transactions?page=1&limit=20
```

---

## Announcements

### List Announcements
```http
GET /api/announcements?page=1&limit=20
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "School Closure Notice",
      "content": "School will be closed...",
      "priority": "high",
      "created_at": "2026-04-18T10:00:00Z",
      "is_read": false
    }
  ]
}
```

### Mark as Read
```http
PUT /api/announcements/[id]/read
```

---

## Push Notifications

### Subscribe Device
```http
POST /api/push/subscribe
Content-Type: application/json

{
  "token": "ExponentPushToken[xxx]",
  "device_type": "ios",
  "device_id": "unique-device-id"
}
```

### Unsubscribe
```http
POST /api/push/unsubscribe
Content-Type: application/json

{
  "token": "ExponentPushToken[xxx]"
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "error": "User has opted out of WhatsApp notifications",
  "opted_out": true
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 429 Rate Limit
```json
{
  "error": "Rate limit exceeded",
  "is_rate_limit_error": true
}
```

### 500 Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limits

- **Free Tier**: 1,000 requests/hour per user
- **WhatsApp**: 1,000 conversations/month, 250 messages/day
- **Payments**: No limit

---

## Best Practices

1. **Cache Responses**: Cache GET requests locally
2. **Handle Errors**: Always check for error responses
3. **Retry Logic**: Implement exponential backoff
4. **Offline Queue**: Queue POST requests when offline
5. **Token Refresh**: Handle 401 by refreshing token
6. **Loading States**: Show loading indicators
7. **Optimistic Updates**: Update UI before API response

---

**Last Updated**: 2026-04-18
