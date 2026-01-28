# Technical Specification (SPEC.md)
## Invoice Collector - Implementation Blueprint

**Version:** 1.0
**Date:** January 20, 2026
**Based on:** PRD.md v1.0
**Target:** Option 2 - Web Dashboard with Learning (3-4 weeks)

---

## 1. Project Overview

This document provides the technical implementation details for the Invoice Collector MVP. It breaks down the PRD requirements into actionable development tasks with specific technical approaches.

---

## 2. Technology Stack & Dependencies

### 2.1 Core Framework
```json
{
  "framework": "Next.js 14",
  "runtime": "Node.js 20+",
  "language": "TypeScript 5.x",
  "package-manager": "npm"
}
```

### 2.2 Dependencies to Install

#### Frontend Dependencies
```bash
npm install react react-dom next
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install @tanstack/react-table
npm install lucide-react # Icons
npm install date-fns # Date formatting
npm install react-hot-toast # Notifications
npm install tailwindcss postcss autoprefixer
npm install class-variance-authority clsx tailwind-merge # Styling utilities
```

#### Backend/API Dependencies
```bash
npm install googleapis # Gmail + Drive APIs
npm install @google-cloud/documentai # Document AI
npm install crypto # File hashing (built-in)
npm install zod # Schema validation
```

#### Dev Dependencies
```bash
npm install -D typescript @types/react @types/node
npm install -D eslint eslint-config-next
npm install -D prettier prettier-plugin-tailwindcss
```

### 2.3 Environment Variables (Already in .env.local)
```bash
# ✅ Already configured:
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://dygkgeqizcgxqzljqphr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
GOOGLE_CLIENT_ID=864340721798-...
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_PROJECT_ID=invoicingapp-484219
GOOGLE_LOCATION=eu
GOOGLE_PROCESSOR_ID=b67604ef78aedd70
```

---

## 3. Database Schema Implementation

### 3.1 Supabase Setup Steps

#### Step 1: Create Tables

**Execute in Supabase SQL Editor:**

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (managed by Supabase Auth)
-- No need to create manually

-- Gmail Accounts Table
CREATE TABLE gmail_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id) -- MVP: Only one account per user
);

-- User Settings Table
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  drive_folder_id TEXT,
  drive_folder_name TEXT,
  drive_folder_path TEXT,
  sync_days_back INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents Table
CREATE TYPE document_classification AS ENUM ('invoice', 'credit_note', 'unclassified');
CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  email_message_id TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  subject TEXT,
  sender TEXT,
  sender_domain TEXT,
  received_date TIMESTAMPTZ NOT NULL,
  filename TEXT NOT NULL,
  original_classification document_classification NOT NULL,
  final_classification document_classification NOT NULL,
  confidence_score DECIMAL(5,4),
  was_reclassified BOOLEAN DEFAULT false,
  status document_status DEFAULT 'pending',
  drive_file_id TEXT,
  drive_folder_path TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  UNIQUE(user_id, email_message_id)
);

-- Create index for faster queries
CREATE INDEX idx_documents_user_status ON documents(user_id, status);
CREATE INDEX idx_documents_sender_domain ON documents(sender_domain);

-- Sync Jobs Table
CREATE TYPE sync_status AS ENUM ('running', 'completed', 'failed');

CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  status sync_status DEFAULT 'running',
  sync_from_date TIMESTAMPTZ NOT NULL,
  sync_to_date TIMESTAMPTZ NOT NULL,
  emails_scanned INTEGER DEFAULT 0,
  documents_found INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- User Feedback Table (Learning)
CREATE TYPE feedback_action AS ENUM ('approved', 'rejected', 'reclassified');

CREATE TABLE user_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  action feedback_action NOT NULL,
  original_classification document_classification,
  new_classification document_classification,
  sender_domain TEXT,
  feedback_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sender Reputation Table
CREATE TABLE sender_reputation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_domain TEXT NOT NULL,
  approval_count INTEGER DEFAULT 0,
  rejection_count INTEGER DEFAULT 0,
  reputation_score DECIMAL(10,2) DEFAULT 0,
  is_trusted BOOLEAN DEFAULT false,
  is_blocked BOOLEAN DEFAULT false,
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, sender_domain)
);
```

#### Step 2: Enable Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE sender_reputation ENABLE ROW LEVEL SECURITY;

-- Gmail Accounts Policies
CREATE POLICY "Users can manage own Gmail account"
  ON gmail_accounts FOR ALL
  USING (auth.uid() = user_id);

-- User Settings Policies
CREATE POLICY "Users can manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id);

-- Documents Policies
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- Sync Jobs Policies
CREATE POLICY "Users can view own sync jobs"
  ON sync_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync jobs"
  ON sync_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync jobs"
  ON sync_jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- User Feedback Policies
CREATE POLICY "Users can manage own feedback"
  ON user_feedback FOR ALL
  USING (auth.uid() = user_id);

-- Sender Reputation Policies
CREATE POLICY "Users can manage own reputation data"
  ON sender_reputation FOR ALL
  USING (auth.uid() = user_id);
```

#### Step 3: Create Database Functions

```sql
-- Function to automatically update sender reputation
CREATE OR REPLACE FUNCTION update_sender_reputation()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update sender reputation
  INSERT INTO sender_reputation (
    user_id,
    sender_domain,
    approval_count,
    rejection_count,
    reputation_score,
    is_trusted,
    is_blocked,
    last_interaction,
    updated_at
  )
  VALUES (
    NEW.user_id,
    NEW.sender_domain,
    CASE WHEN NEW.action = 'approved' THEN 1 ELSE 0 END,
    CASE WHEN NEW.action = 'rejected' THEN 1 ELSE 0 END,
    CASE WHEN NEW.action = 'approved' THEN 1 ELSE -1 END,
    false,
    false,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, sender_domain)
  DO UPDATE SET
    approval_count = sender_reputation.approval_count +
      CASE WHEN NEW.action = 'approved' THEN 1 ELSE 0 END,
    rejection_count = sender_reputation.rejection_count +
      CASE WHEN NEW.action = 'rejected' THEN 1 ELSE 0 END,
    reputation_score = sender_reputation.approval_count - sender_reputation.rejection_count,
    is_trusted = (sender_reputation.approval_count +
      CASE WHEN NEW.action = 'approved' THEN 1 ELSE 0 END) >= 3,
    is_blocked = (sender_reputation.rejection_count +
      CASE WHEN NEW.action = 'rejected' THEN 1 ELSE 0 END) >= 2,
    last_interaction = NOW(),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update reputation on feedback
CREATE TRIGGER trigger_update_sender_reputation
  AFTER INSERT ON user_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_sender_reputation();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_settings
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## 4. Project Structure

```
invoice-collector/
├── .env.local                    # ✅ Already exists
├── .gitignore
├── next.config.js
├── tsconfig.json
├── tailwind.config.ts
├── package.json
├── PRD.md                        # ✅ Already exists
├── SPEC.md                       # This file
├── README.md                     # ✅ Already exists
│
├── app/
│   ├── layout.tsx                # Root layout with providers
│   ├── page.tsx                  # Landing/redirect page
│   ├── login/
│   │   └── page.tsx              # Login page
│   ├── dashboard/
│   │   ├── page.tsx              # Main dashboard
│   │   └── layout.tsx            # Dashboard layout
│   ├── setup/
│   │   └── page.tsx              # Drive folder setup
│   ├── settings/
│   │   └── page.tsx              # Settings & sender management
│   └── api/
│       ├── auth/
│       │   ├── google/
│       │   │   ├── route.ts      # Initiate OAuth
│       │   │   └── callback/
│       │   │       └── route.ts  # OAuth callback
│       │   └── logout/
│       │       └── route.ts      # Logout handler
│       ├── gmail/
│       │   ├── account/
│       │   │   └── route.ts      # GET connected account
│       │   ├── connect/
│       │   │   └── route.ts      # POST connect account
│       │   ├── disconnect/
│       │   │   └── route.ts      # DELETE disconnect
│       │   └── sync/
│       │       └── route.ts      # POST trigger sync
│       ├── documents/
│       │   ├── route.ts          # GET list documents
│       │   └── [id]/
│       │       ├── route.ts      # GET document details
│       │       ├── approve/
│       │       │   └── route.ts  # PUT approve
│       │       ├── reject/
│       │       │   └── route.ts  # DELETE reject
│       │       ├── reclassify/
│       │       │   └── route.ts  # PUT reclassify
│       │       └── preview/
│       │           └── route.ts  # GET preview URL
│       ├── drive/
│       │   └── folders/
│       │       ├── route.ts      # GET list folders
│       │       ├── create/
│       │       │   └── route.ts  # POST create folder
│       │       ├── select/
│       │       │   └── route.ts  # POST select folder
│       │       ├── current/
│       │       │   └── route.ts  # GET current folder
│       │       └── setup/
│       │           └── route.ts  # POST setup structure
│       ├── learning/
│       │   └── stats/
│       │       └── route.ts      # GET learning stats
│       └── senders/
│           ├── reputation/
│           │   └── route.ts      # GET reputation list
│           └── [domain]/
│               ├── trust/
│               │   └── route.ts  # POST trust sender
│               ├── block/
│               │   └── route.ts  # POST block sender
│               └── route.ts      # DELETE remove sender
│
├── components/
│   ├── ui/                       # Shadcn-style UI components
│   │   ├── button.tsx
│   │   ├── table.tsx
│   │   ├── dialog.tsx
│   │   ├── select.tsx
│   │   ├── badge.tsx
│   │   └── spinner.tsx
│   ├── dashboard/
│   │   ├── DocumentsTable.tsx    # Main documents table
│   │   ├── SyncButton.tsx        # Sync trigger button
│   │   ├── DocumentRow.tsx       # Table row component
│   │   ├── ClassificationBadge.tsx
│   │   └── StatusBadge.tsx
│   ├── setup/
│   │   ├── FolderSelector.tsx    # Drive folder browser
│   │   └── FolderCreator.tsx     # Create new folder form
│   ├── settings/
│   │   ├── SenderReputationList.tsx
│   │   └── AccountInfo.tsx
│   └── providers/
│       ├── SupabaseProvider.tsx
│       └── ToastProvider.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Client-side Supabase
│   │   ├── server.ts             # Server-side Supabase
│   │   └── types.ts              # Database types
│   ├── google/
│   │   ├── auth.ts               # Google OAuth helpers
│   │   ├── gmail.ts              # Gmail API wrapper
│   │   ├── drive.ts              # Drive API wrapper
│   │   └── documentai.ts         # Document AI wrapper
│   ├── utils/
│   │   ├── classification.ts     # Classification logic
│   │   ├── hashing.ts            # File hashing
│   │   ├── date.ts               # Date utilities
│   │   └── cn.ts                 # Classname utility
│   └── constants.ts              # App constants
│
├── types/
│   ├── database.ts               # Database types
│   ├── api.ts                    # API types
│   └── google.ts                 # Google API types
│
└── public/
    └── favicon.ico
```

---

## 5. Implementation Phases

### Phase 1: Project Setup & Authentication (Week 1)

#### Task 1.1: Initialize Next.js Project
```bash
npx create-next-app@latest invoice-collector --typescript --tailwind --app --no-src-dir
cd invoice-collector
# Install dependencies (see section 2.2)
```

#### Task 1.2: Configure Supabase
- Copy `.env.local` values (already done)
- Create Supabase client helpers
- Set up auth providers

**Files to create:**
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/types.ts`

**Code: lib/supabase/client.ts**
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

#### Task 1.3: Google OAuth Flow
- Implement `/api/auth/google/route.ts`
- Implement `/api/auth/google/callback/route.ts`
- Create login page

**OAuth Scopes Required:**
```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email'
]
```

#### Task 1.4: Protected Routes
- Create middleware for auth checks
- Redirect logic (logged out → /login, logged in → /dashboard)

**Deliverables:**
- ✅ User can sign in with Google
- ✅ OAuth tokens stored in `gmail_accounts` table
- ✅ Protected dashboard route

---

### Phase 2: Gmail Integration & Sync (Week 1-2)

#### Task 2.1: Gmail API Wrapper
**File: `lib/google/gmail.ts`**

```typescript
interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  date: Date
  attachments: Attachment[]
}

interface Attachment {
  filename: string
  mimeType: string
  size: number
  attachmentId: string
}

class GmailService {
  async listMessages(opts: {
    accessToken: string
    fromDate: Date
    toDate: Date
  }): Promise<GmailMessage[]>

  async getAttachment(opts: {
    accessToken: string
    messageId: string
    attachmentId: string
  }): Promise<Buffer>

  async getMessageDetails(opts: {
    accessToken: string
    messageId: string
  }): Promise<GmailMessage>
}
```

**Logic:**
1. Query Gmail API with date range filter
2. Filter for messages with PDF attachments
3. Check subject/sender for Portuguese invoice keywords:
   - Keywords: "fatura", "factura", "invoice", "nota de crédito", "credit note"
   - Sender domains: invoicexpress.com, moloni.pt, sage.pt
4. Return list of candidate messages

#### Task 2.2: Sync API Endpoint
**File: `app/api/gmail/sync/route.ts`**

**Flow:**
1. Authenticate user
2. Get Gmail account tokens from DB
3. Create sync job record (status: running)
4. Call Gmail API for last 24 hours
5. For each message with PDF:
   - Check if already processed (duplicate detection by message ID)
   - Download attachment
   - Calculate file hash
   - Check duplicate by hash
   - Call Document AI for classification
   - Upload to Drive (Pending Approval folder)
   - Save to `documents` table
6. Update sync job (status: completed)
7. Return summary

**Duplicate Detection:**
```typescript
async function isDuplicate(
  userId: string,
  messageId: string,
  fileHash: string
): Promise<boolean> {
  // Check by message ID
  const byMessageId = await supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('email_message_id', messageId)
    .single()

  if (byMessageId.data) return true

  // Check by file hash
  const byHash = await supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('file_hash', fileHash)
    .single()

  return !!byHash.data
}
```

**Deliverables:**
- ✅ Sync button triggers email scan
- ✅ Only last 24 hours processed
- ✅ Duplicates skipped
- ✅ Progress visible to user

---

### Phase 3: Document AI Classification (Week 2)

#### Task 3.1: Document AI Wrapper
**File: `lib/google/documentai.ts`**

```typescript
interface ClassificationResult {
  classification: 'invoice' | 'credit_note' | 'unclassified'
  confidence: number
  extractedText: string
}

class DocumentAIService {
  async classifyDocument(
    pdfBuffer: Buffer
  ): Promise<ClassificationResult> {
    // Call Google Document AI
    const response = await documentai.processDocument({
      name: `projects/${GOOGLE_PROJECT_ID}/locations/${GOOGLE_LOCATION}/processors/${GOOGLE_PROCESSOR_ID}`,
      rawDocument: {
        content: pdfBuffer.toString('base64'),
        mimeType: 'application/pdf'
      }
    })

    // Extract text
    const text = response.document.text.toLowerCase()

    // Classification logic
    return this.classify(text)
  }

  private classify(text: string): ClassificationResult {
    // Portuguese invoice indicators
    const invoiceKeywords = [
      'fatura',
      'factura',
      'invoice',
      /ft\s*\d+/i,
      /fa\s*\d+/i
    ]

    // Credit note indicators
    const creditNoteKeywords = [
      'nota de crédito',
      'nota de credito',
      'credit note',
      /nc\s*\d+/i
    ]

    // Score calculation
    let invoiceScore = 0
    let creditNoteScore = 0

    invoiceKeywords.forEach(keyword => {
      if (typeof keyword === 'string') {
        if (text.includes(keyword)) invoiceScore++
      } else {
        if (keyword.test(text)) invoiceScore++
      }
    })

    creditNoteKeywords.forEach(keyword => {
      if (typeof keyword === 'string') {
        if (text.includes(keyword)) creditNoteScore++
      } else {
        if (keyword.test(text)) creditNoteScore++
      }
    })

    // Determine classification
    if (creditNoteScore > invoiceScore) {
      return {
        classification: 'credit_note',
        confidence: Math.min(creditNoteScore / 3, 1),
        extractedText: text.substring(0, 500)
      }
    } else if (invoiceScore > 0) {
      return {
        classification: 'invoice',
        confidence: Math.min(invoiceScore / 3, 1),
        extractedText: text.substring(0, 500)
      }
    } else {
      return {
        classification: 'unclassified',
        confidence: 0,
        extractedText: text.substring(0, 500)
      }
    }
  }
}
```

**Deliverables:**
- ✅ Documents classified automatically
- ✅ Confidence score calculated
- ✅ Portuguese terms recognized

---

### Phase 4: Google Drive Integration (Week 2)

#### Task 4.1: Drive API Wrapper
**File: `lib/google/drive.ts`**

```typescript
class DriveService {
  async listFolders(accessToken: string): Promise<DriveFolder[]>

  async createFolder(opts: {
    accessToken: string
    name: string
    parentId?: string
  }): Promise<string>

  async uploadFile(opts: {
    accessToken: string
    filename: string
    buffer: Buffer
    folderId: string
    description?: string
  }): Promise<string>

  async moveFile(opts: {
    accessToken: string
    fileId: string
    newFolderId: string
  }): Promise<void>

  async deleteFile(opts: {
    accessToken: string
    fileId: string
  }): Promise<void>

  async setupFolderStructure(opts: {
    accessToken: string
    rootFolderId: string
  }): Promise<{
    pendingFolderId: string
    approvedFolderId: string
  }>
}
```

#### Task 4.2: Drive Folder Selection UI
**Component: `components/setup/FolderSelector.tsx`**

- Browse user's Drive folders
- Select existing folder
- Create new folder button

#### Task 4.3: Folder Structure Setup
When user selects/creates folder:
1. Store folder ID in `user_settings`
2. Create subfolders:
   - `Pending Approval/`
   - `Approved/`
3. All documents initially go to `Pending Approval/`

**Deliverables:**
- ✅ User can select Drive folder
- ✅ User can create new folder
- ✅ Folder structure auto-created
- ✅ Documents uploaded to correct location

---

### Phase 5: Dashboard & Document Management (Week 2-3)

#### Task 5.1: Documents Table Component
**Component: `components/dashboard/DocumentsTable.tsx`**

**Columns:**
- Icon/thumbnail
- Filename (truncated)
- Sender email
- Subject (truncated)
- Classification badge (with edit icon)
- Confidence score (%)
- Received date (formatted)
- Status badge
- Actions: Approve, Reject, View PDF

**Features:**
- Pagination (20 per page)
- Sort by column (date, sender, classification)
- Filter by status/classification
- Real-time updates after sync

#### Task 5.2: Document Actions

**Approve Action:**
```typescript
async function approveDocument(documentId: string) {
  // 1. Get document details
  const doc = await getDocument(documentId)

  // 2. Determine monthly folder (e.g., "01-2026")
  const monthYear = format(doc.received_date, 'MM-yyyy')

  // 3. Get or create monthly folder in Drive
  const monthlyFolderId = await getOrCreateMonthlyFolder(
    monthYear,
    approvedFolderId
  )

  // 4. Move file in Drive
  await drive.moveFile({
    fileId: doc.drive_file_id,
    newFolderId: monthlyFolderId
  })

  // 5. Update database
  await supabase
    .from('documents')
    .update({
      status: 'approved',
      approved_at: new Date(),
      drive_folder_path: `Approved/${monthYear}`
    })
    .eq('id', documentId)

  // 6. Create user feedback record
  await supabase
    .from('user_feedback')
    .insert({
      user_id: doc.user_id,
      document_id: documentId,
      action: 'approved',
      sender_domain: doc.sender_domain,
      original_classification: doc.original_classification,
      new_classification: doc.final_classification
    })
}
```

**Reject Action:**
```typescript
async function rejectDocument(documentId: string) {
  // 1. Get document details
  const doc = await getDocument(documentId)

  // 2. Delete file from Drive
  await drive.deleteFile({
    fileId: doc.drive_file_id
  })

  // 3. Create user feedback record
  await supabase
    .from('user_feedback')
    .insert({
      user_id: doc.user_id,
      document_id: documentId,
      action: 'rejected',
      sender_domain: doc.sender_domain,
      original_classification: doc.original_classification
    })

  // 4. Delete from database
  await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
}
```

**Reclassify Action:**
```typescript
async function reclassifyDocument(
  documentId: string,
  newClassification: 'invoice' | 'credit_note' | 'unclassified'
) {
  // 1. Get current classification
  const doc = await getDocument(documentId)

  // 2. Update classification
  await supabase
    .from('documents')
    .update({
      final_classification: newClassification,
      was_reclassified: true
    })
    .eq('id', documentId)

  // 3. Create user feedback record
  await supabase
    .from('user_feedback')
    .insert({
      user_id: doc.user_id,
      document_id: documentId,
      action: 'reclassified',
      sender_domain: doc.sender_domain,
      original_classification: doc.original_classification,
      new_classification: newClassification
    })
}
```

**Deliverables:**
- ✅ Dashboard displays all documents
- ✅ Approve moves to monthly folder
- ✅ Reject deletes from Drive & DB
- ✅ Reclassify updates classification
- ✅ PDF opens in new tab

---

### Phase 6: Learning System (Week 3)

#### Task 6.1: Sender Reputation Auto-Update
- Database trigger already created (see Section 3.1 Step 3)
- Automatically updates on user feedback

#### Task 6.2: Apply Learning to Sync
**Modified sync logic:**

```typescript
async function shouldProcessSender(
  userId: string,
  senderDomain: string
): Promise<{ process: boolean; reason?: string }> {
  const reputation = await supabase
    .from('sender_reputation')
    .select('*')
    .eq('user_id', userId)
    .eq('sender_domain', senderDomain)
    .single()

  if (!reputation.data) {
    return { process: true } // New sender, process normally
  }

  if (reputation.data.is_blocked) {
    return {
      process: false,
      reason: 'Sender is blocked (2+ rejections)'
    }
  }

  return { process: true }
}
```

#### Task 6.3: Sender Reputation Dashboard
**Component: `components/settings/SenderReputationList.tsx`**

**Display:**
- List of all senders with stats
- Approval count, rejection count
- Trust/block status
- Actions: Manually trust, block, or reset

**API Endpoint:**
- `GET /api/senders/reputation` - List all senders
- `POST /api/senders/:domain/trust` - Manual trust
- `POST /api/senders/:domain/block` - Manual block
- `DELETE /api/senders/:domain` - Reset reputation

**Deliverables:**
- ✅ Feedback tracked on all actions
- ✅ Sender reputation auto-updates
- ✅ Blocked senders skipped in sync
- ✅ User can view/manage reputation

---

### Phase 7: Polish & Testing (Week 3-4)

#### Task 7.1: Error Handling
- Wrap all API calls in try-catch
- Display user-friendly error messages
- Log errors for debugging

#### Task 7.2: Loading States
- Sync button shows spinner during sync
- Table shows skeleton during load
- Disable actions during processing

#### Task 7.3: Responsive Design
- Mobile-friendly table (horizontal scroll)
- Responsive layout for all pages

#### Task 7.4: Portuguese Localization
- Date formats: DD/MM/YYYY
- UI text in Portuguese (optional for MVP)

#### Task 7.5: Testing
- Test with real Portuguese invoices
- Test duplicate detection
- Test learning system with multiple approve/reject
- Test RLS policies (create second user)

**Deliverables:**
- ✅ Graceful error handling
- ✅ Good loading states
- ✅ Mobile-friendly
- ✅ Tested with real data

---

## 6. API Endpoint Specifications

### 6.1 Authentication

#### POST /api/auth/google
**Description:** Initiate Google OAuth flow

**Request:** None

**Response:**
```typescript
{
  url: string // Redirect URL to Google OAuth
}
```

#### GET /api/auth/google/callback
**Description:** Handle OAuth callback

**Query Params:**
- `code: string` - Authorization code from Google

**Response:**
- Redirects to `/setup` or `/dashboard`

#### POST /api/auth/logout
**Description:** Revoke tokens and logout

**Request:** None

**Response:**
```typescript
{
  success: boolean
}
```

---

### 6.2 Gmail Integration

#### GET /api/gmail/account
**Description:** Get connected Gmail account

**Response:**
```typescript
{
  id: string
  email: string
  is_primary: boolean
  created_at: string
}
```

#### POST /api/gmail/sync
**Description:** Trigger manual sync (last 24 hours)

**Request:** None

**Response:**
```typescript
{
  job_id: string
  status: 'running'
}
```

**SSE Stream (optional for real-time progress):**
```typescript
{
  type: 'progress'
  emails_scanned: number
  documents_found: number
  duplicates_skipped: number
}

{
  type: 'complete'
  job_id: string
  emails_scanned: number
  documents_found: number
  duplicates_skipped: number
}
```

---

### 6.3 Documents

#### GET /api/documents
**Description:** List all documents with filters

**Query Params:**
- `status?: 'pending' | 'approved' | 'rejected'`
- `classification?: 'invoice' | 'credit_note' | 'unclassified'`
- `from_date?: ISO8601`
- `to_date?: ISO8601`
- `page?: number` (default: 1)
- `limit?: number` (default: 20)

**Response:**
```typescript
{
  documents: Array<{
    id: string
    filename: string
    sender: string
    sender_domain: string
    subject: string
    original_classification: string
    final_classification: string
    confidence_score: number
    was_reclassified: boolean
    status: string
    received_date: string
    processed_at: string
    drive_file_id: string
  }>
  total: number
  page: number
  limit: number
}
```

#### PUT /api/documents/[id]/approve
**Description:** Approve document and move to monthly folder

**Response:**
```typescript
{
  success: boolean
  document: { ... }
}
```

#### DELETE /api/documents/[id]/reject
**Description:** Reject document and delete from Drive & DB

**Response:**
```typescript
{
  success: boolean
}
```

#### PUT /api/documents/[id]/reclassify
**Description:** Manually change classification

**Request:**
```typescript
{
  classification: 'invoice' | 'credit_note' | 'unclassified'
}
```

**Response:**
```typescript
{
  success: boolean
  document: { ... }
}
```

#### GET /api/documents/[id]/preview
**Description:** Get PDF preview URL (opens in new tab)

**Response:**
```typescript
{
  url: string // Drive file web view URL
}
```

---

### 6.4 Drive

#### GET /api/drive/folders
**Description:** Browse user's Drive folders

**Query Params:**
- `parent_id?: string` - Parent folder ID (omit for root)

**Response:**
```typescript
{
  folders: Array<{
    id: string
    name: string
    parent_id: string | null
  }>
}
```

#### POST /api/drive/folders/create
**Description:** Create new folder in Drive

**Request:**
```typescript
{
  name: string
  parent_id?: string
}
```

**Response:**
```typescript
{
  id: string
  name: string
}
```

#### POST /api/drive/folders/select
**Description:** Set selected folder for invoice storage

**Request:**
```typescript
{
  folder_id: string
  folder_name: string
  folder_path: string
}
```

**Response:**
```typescript
{
  success: boolean
}
```

#### POST /api/drive/setup
**Description:** Create subfolder structure in selected folder

**Request:** None (uses folder from user_settings)

**Response:**
```typescript
{
  pending_folder_id: string
  approved_folder_id: string
}
```

---

### 6.5 Learning & Reputation

#### GET /api/learning/stats
**Description:** Get learning statistics

**Response:**
```typescript
{
  total_senders: number
  trusted_senders: number
  blocked_senders: number
  total_approvals: number
  total_rejections: number
  total_reclassifications: number
}
```

#### GET /api/senders/reputation
**Description:** List all sender reputations

**Response:**
```typescript
{
  senders: Array<{
    sender_domain: string
    approval_count: number
    rejection_count: number
    reputation_score: number
    is_trusted: boolean
    is_blocked: boolean
    last_interaction: string
  }>
}
```

---

## 7. Security Considerations

### 7.1 Token Management
- Store OAuth tokens encrypted in Supabase
- Refresh tokens before expiry
- Never expose tokens to client

### 7.2 RLS Enforcement
- All queries go through Supabase RLS
- API endpoints validate user ownership
- No direct database access from client

### 7.3 File Upload Security
- Validate file types (PDF only)
- Limit file size (10MB max)
- Scan for malware (optional)

### 7.4 API Rate Limiting
- Implement rate limiting on sync endpoint
- Prevent abuse (max 1 sync per minute per user)

---

## 8. Testing Strategy

### 8.1 Unit Tests
- Document classification logic
- File hashing
- Date utilities
- Sender reputation calculation

### 8.2 Integration Tests
- Gmail API integration
- Drive API integration
- Document AI processing
- Database operations with RLS

### 8.3 E2E Tests
- Full sync workflow
- Approve/reject workflow
- Reclassification workflow
- Learning system

### 8.4 Manual Testing Checklist
- [ ] Sign in with Google
- [ ] Connect Gmail account
- [ ] Select/create Drive folder
- [ ] Trigger sync (with real invoices)
- [ ] Verify documents appear in table
- [ ] Approve document → check Drive folder
- [ ] Reject document → verify deletion
- [ ] Reclassify document
- [ ] Check sender reputation updates
- [ ] Sync again → verify blocked senders skipped
- [ ] Test with second user → verify RLS isolation

---

## 9. Deployment Checklist

### 9.1 Pre-Deployment
- [ ] All environment variables set in Vercel
- [ ] Supabase tables created with RLS
- [ ] Google Cloud APIs enabled (Gmail, Drive, Document AI)
- [ ] OAuth redirect URIs configured
- [ ] Database migrations run
- [ ] All dependencies installed

### 9.2 Vercel Configuration
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

### 9.3 Environment Variables (Vercel)
- Copy all from `.env.local`
- Update `NEXT_PUBLIC_APP_URL` to production URL
- Update Google OAuth redirect URI

### 9.4 Post-Deployment
- [ ] Test OAuth flow in production
- [ ] Test sync with real account
- [ ] Monitor error logs
- [ ] Verify RLS policies working

---

## 10. Future Enhancements (Post-MVP)

### Phase 2 Features
1. **Auto-sync:** Vercel Cron job for hourly/daily sync
2. **Email notifications:** New invoices alert
3. **Bulk actions:** Select multiple docs to approve/reject
4. **Advanced search:** Full-text search across documents
5. **Export:** CSV/Excel export of document list
6. **Analytics:** Monthly trends, accuracy metrics
7. **Mobile app:** React Native app
8. **Multiple accounts:** Support more than one Gmail per user

### Advanced ML (Phase 3)
1. Custom Document AI processor trained on user data
2. Extract structured data (amounts, dates, vendor)
3. A/B testing improved model
4. Automatic confidence improvement over time

---

## 11. Success Criteria

### MVP Launch Criteria
- [ ] User can sign in with Google
- [ ] User can connect Gmail account
- [ ] User can select Drive folder
- [ ] Sync processes last 24 hours successfully
- [ ] Documents classified with >80% accuracy
- [ ] Approve workflow moves to correct monthly folder
- [ ] Reject workflow deletes completely
- [ ] Reclassification works correctly
- [ ] Duplicate detection prevents re-uploads
- [ ] Learning system tracks feedback
- [ ] Blocked senders skipped in sync
- [ ] RLS prevents data leakage between users
- [ ] No crashes or data loss
- [ ] Mobile-friendly UI

### Performance Targets
- Sync 100 emails in <30 seconds
- Classification <2 seconds per document
- Dashboard loads in <1 second
- No memory leaks during sync

---

## 12. Development Timeline

### Week 1: Foundation
- **Days 1-2:** Project setup, dependencies, Supabase schema
- **Days 3-4:** Authentication flow, protected routes
- **Days 5-7:** Gmail API integration, basic sync

### Week 2: Core Features
- **Days 8-9:** Document AI integration, classification
- **Days 10-11:** Drive API, folder selection
- **Days 12-14:** Documents table, approve/reject workflow

### Week 3: Advanced Features
- **Days 15-16:** Reclassification, learning system
- **Days 17-18:** Sender reputation, settings page
- **Days 19-21:** Polish, error handling, testing

### Week 4: Testing & Launch
- **Days 22-24:** Integration testing, bug fixes
- **Days 25-26:** User acceptance testing
- **Days 27-28:** Production deployment, monitoring

---

## 13. Key Technical Decisions

### Decision 1: Why Next.js App Router?
- Server components for better performance
- Built-in API routes
- Easy Vercel deployment
- Modern React patterns

### Decision 2: Why Supabase?
- PostgreSQL with built-in RLS
- Real-time subscriptions (future)
- Auth management
- Free tier for MVP

### Decision 3: Why Google Document AI?
- Already configured in project
- Better accuracy than simple regex
- Supports Portuguese
- Scalable for future ML

### Decision 4: Why Rule-Based Learning (not ML)?
- Faster to implement
- No training data needed initially
- Good enough for MVP
- Can upgrade to ML later

---

## Appendix A: Environment Setup

### Prerequisites
- Node.js 20+
- npm 9+
- Git
- Supabase account
- Google Cloud account

### Setup Steps
1. Clone repository
2. Copy `.env.local` (already done)
3. Install dependencies: `npm install`
4. Run Supabase migrations (SQL from Section 3.1)
5. Start dev server: `npm run dev`
6. Open http://localhost:3000

---

## Appendix B: Common Commands

```bash
# Development
npm run dev               # Start dev server
npm run build             # Build for production
npm run start             # Start production server
npm run lint              # Run ESLint
npm run type-check        # TypeScript check

# Database
npm run db:migrate        # Run migrations (if using tool)
npm run db:seed           # Seed test data

# Testing
npm run test              # Run tests
npm run test:e2e          # Run E2E tests
```

---

## Appendix C: Useful Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Gmail API Reference](https://developers.google.com/gmail/api)
- [Drive API Reference](https://developers.google.com/drive/api)
- [Document AI Docs](https://cloud.google.com/document-ai/docs)

---

**End of Technical Specification**

This spec provides everything needed to implement the Invoice Collector MVP. Follow the phases sequentially, and check off deliverables as you complete them.

Ready to start implementation? 🚀
