# Product Requirements Document (PRD)
## Invoice Collector - Portugal Use Case

**Version:** 1.0
**Date:** January 20, 2026
**Status:** Draft

---

## 1. Executive Summary

Invoice Collector is an automated solution designed for Portuguese businesses to streamline invoice and credit note management. The system connects to Gmail accounts, automatically identifies and extracts invoices/credit notes from emails, and organizes them in Google Drive with a user-driven approval workflow.

---

## 2. Problem Statement

Portuguese businesses receive numerous invoices and credit notes via email daily. Manual sorting, downloading, and organizing these documents is:
- Time-consuming and error-prone
- Difficult to track and audit
- Lacks proper categorization
- Requires constant manual intervention

---

## 3. Goals & Objectives

### Primary Goals
1. Automate invoice/credit note detection from Gmail
2. Reduce manual document handling by 80%
3. Ensure proper categorization and storage organization
4. Provide user control over document acceptance

### Success Metrics
- Number of emails processed per sync
- Accuracy of invoice vs. credit note classification
- User approval rate
- Time saved per month

---

## 4. User Personas

### Primary User: Small Business Owner / Accountant (Portugal)
- Receives 20-100 invoices/credit notes per month via email
- Uses Gmail for business communication
- Stores documents in Google Drive
- Needs organized records for tax compliance (Portuguese regulations)
- Limited technical expertise

---

## 5. Core Features

### 5.1 Email Integration
**Description:** Connect to Gmail account to access emails containing invoices

**Requirements:**
- OAuth 2.0 authentication with Gmail API
- Read-only email access (gmail.readonly scope)
- Support for multiple Gmail accounts per user
- Secure token storage and refresh mechanism

**Acceptance Criteria:**
- User can authenticate Gmail account
- System can read emails from connected account
- Tokens are securely stored in Supabase
- Automatic token refresh on expiration

---

### 5.2 Email Sync & Invoice Detection
**Description:** Scan emails for attachments that are invoices or credit notes

**Requirements:**
- Scan emails for PDF attachments
- Common Portuguese invoice indicators:
  - Subject keywords: "Fatura", "Factura", "Invoice", "Nota de Crédito", "Credit Note"
  - Sender domains from known invoice platforms (e.g., InvoiceXpress, Moloni, Sage)
  - Attachment filenames containing "fatura", "invoice", "NC", etc.
- Configurable date range for sync (last 30 days default)
- Batch processing support

**Acceptance Criteria:**
- System identifies emails with PDF attachments
- Filters emails based on Portuguese invoice patterns
- Downloads relevant PDFs for processing
- Handles pagination for large mailboxes

---

### 5.3 Document Classification
**Description:** Categorize documents as Invoice or Credit Note

**Requirements:**
- Use Google Document AI (already configured) for PDF text extraction
- Classification logic based on Portuguese document patterns:
  - **Invoice indicators:** "FATURA", "INVOICE", document numbers starting with "FT", "FA"
  - **Credit Note indicators:** "NOTA DE CRÉDITO", "CREDIT NOTE", "NC"
- Confidence scoring for classifications
- Fallback to "Unclassified" if uncertain (confidence < 70%)

**Acceptance Criteria:**
- Documents are classified as: Invoice, Credit Note, or Unclassified
- Classification confidence score is recorded
- Portuguese and English terms are recognized
- System handles multi-page documents

---

### 5.4 Google Drive Storage
**Description:** Upload documents to user-selected Google Drive folder with proper organization

**Requirements:**
- OAuth 2.0 authentication with Google Drive API
- User can select existing Drive folder OR create new folder from dashboard
- Selected folder structure:
  ```
  [User Selected Folder]/
  ├── Pending Approval/
  └── Approved/
      ├── 01-2026/
      ├── 02-2026/
      └── ...
  ```
- Upload PDFs to "Pending Approval" initially
- Include metadata in file description (sender, date, classification)
- **Duplicate Prevention:** Check for existing files by:
  - Email message ID (primary)
  - File hash/checksum (secondary)
  - Original filename + sender + date combination (fallback)
- Store Drive folder ID in user settings
- Folder can be shared with accountant (user handles sharing externally)

**Acceptance Criteria:**
- User can browse and select Drive folder during setup
- User can create new folder with custom name from dashboard
- Documents upload to "Pending Approval" subfolder
- Folder structure auto-creates within selected parent folder
- Duplicate detection prevents re-uploads of same email attachment
- Duplicate detection prevents re-uploads of identical files from different emails
- Files maintain original names with metadata suffix
- Selected folder ID persists in database

---

### 5.5 Document Approval Workflow
**Description:** Allow users to review and approve/reject documents with learning capabilities

**Requirements:**
- List all documents in "Pending Approval"
- Display document metadata:
  - Original email subject
  - Sender email/domain
  - Classification (Invoice/Credit Note/Unclassified)
  - Received date
  - Confidence score
  - PDF preview/thumbnail
- User actions:
  - **Approve:** Move to Approved/MM-YYYY folder based on document date
  - **Reject:** Permanently delete file from Drive AND remove database record
  - **Reclassify:** Manually override classification (Invoice ↔ Credit Note ↔ Unclassified)
- Reclassification must be possible before or during approval
- Track user corrections for machine learning

**Acceptance Criteria:**
- Users see all pending documents in dashboard
- Approve action moves file to correct monthly folder (e.g., "01-2026")
- Reject action deletes file from Drive completely
- Reject action removes database record
- Users can manually change classification with dropdown/buttons
- Reclassification updates metadata immediately
- Changed classification affects final folder placement
- User can reclassify before approving

---

### 5.6 Document Dashboard & Listing
**Description:** Display collected documents in web dashboard with manual sync

**Requirements:**
- Web dashboard showing all documents in table format
- Columns:
  - Thumbnail/icon
  - Filename
  - Sender email
  - Email subject
  - Classification (with edit capability)
  - Confidence score
  - Received date
  - Status (Pending/Approved/Rejected)
  - Actions (Approve, Reject, Reclassify, View PDF)
- **Manual Sync Button:** "Sync Invoices" button on dashboard
- **Sync Date Range:** Last 24 hours (1 day ago to now) for MVP testing
- Real-time sync progress indicator
- Filter by status, classification, date range
- Sort by any column
- Pagination for large result sets

**Acceptance Criteria:**
- Dashboard displays all documents in readable table
- User can click "Sync Invoices" to trigger manual sync
- Sync processes emails from last 24 hours only
- Progress indicator shows during sync
- Table updates automatically after sync completes
- Filters and sorting work correctly
- Actions (approve/reject) work from table row
- PDF opens in new tab when clicked (not modal)

---

### 5.7 Machine Learning from User Feedback
**Description:** Learn from user approvals, rejections, and reclassifications to improve accuracy

**Requirements:**
- Track all user corrections and decisions:
  - When user rejects a document (learn this sender/pattern should be ignored)
  - When user reclassifies (e.g., Credit Note → Invoice)
  - When user approves without changes (confirmation of correct classification)
- Store training data:
  - Original classification vs. user's final classification
  - Sender domain patterns for approved vs. rejected documents
  - Keywords/phrases in subject lines that correlate with user decisions
  - PDF text patterns that led to misclassification
- **Learning mechanisms:**
  - **Sender Reputation:** Build allowlist/blocklist of sender domains
  - **Keyword Weighting:** Increase weight for keywords in approved docs
  - **Pattern Recognition:** Identify common subject line patterns
  - **Reclassification Learning:** If user consistently changes "Invoice" to "Credit Note" for specific sender, adjust future classification

**Implementation Approach (MVP):**
1. **Rule-based Learning (Phase 1 - MVP):**
   - Track rejected sender domains → auto-skip in future syncs
   - Track approved sender domains → prioritize in future syncs
   - Build "trusted senders" list based on 3+ approvals
   - Build "blocked senders" list based on 2+ rejections

2. **Advanced ML (Phase 2 - Future):**
   - Train custom Document AI model with user-labeled data
   - Use TensorFlow/PyTorch for pattern recognition
   - Implement feedback loop to retrain monthly
   - A/B test improved model vs. baseline

**Acceptance Criteria:**
- Every user action (approve/reject/reclassify) is logged with context
- System builds sender reputation scores over time
- After 3+ approvals from same sender, confidence score increases
- After 2+ rejections from same sender, future emails from sender are auto-skipped
- Dashboard shows learning statistics (X senders trusted, Y senders blocked)
- User can view and manage trusted/blocked sender lists

---

## 6. Technical Architecture

### 6.1 Technology Stack
- **Frontend:** Next.js (React)
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth + Google OAuth
- **Email Processing:** Gmail API
- **Document Processing:** Google Document AI
- **Storage:** Google Drive API
- **Language:** TypeScript
- **Hosting:** Vercel
- **Monitoring:** None (MVP) - can add Sentry/LogRocket later if needed

### 6.2 Data Model

#### Users Table
```sql
users (
  id: uuid (primary key)
  email: string
  created_at: timestamp
)
```

#### Gmail Accounts Table
```sql
gmail_accounts (
  id: uuid (primary key)
  user_id: uuid (foreign key)
  email: string
  access_token: encrypted string
  refresh_token: encrypted string
  token_expiry: timestamp
  is_primary: boolean (default true, MVP: only one account per user)
  created_at: timestamp
)
```

#### User Settings Table
```sql
user_settings (
  id: uuid (primary key)
  user_id: uuid (foreign key, unique)
  drive_folder_id: string
  drive_folder_name: string
  drive_folder_path: string
  sync_days_back: integer (default 1 for MVP)
  created_at: timestamp
  updated_at: timestamp
)
```

#### Documents Table
```sql
documents (
  id: uuid (primary key)
  user_id: uuid (foreign key)
  gmail_account_id: uuid (foreign key)
  email_message_id: string (unique per user)
  file_hash: string (for duplicate detection)
  subject: string
  sender: string
  sender_domain: string (extracted from sender email)
  received_date: timestamp
  filename: string
  original_classification: enum (invoice, credit_note, unclassified)
  final_classification: enum (invoice, credit_note, unclassified)
  confidence_score: decimal
  was_reclassified: boolean (default false)
  status: enum (pending, approved, rejected)
  drive_file_id: string
  drive_folder_path: string
  processed_at: timestamp
  approved_at: timestamp
  rejected_at: timestamp
)
```

#### Sync Jobs Table
```sql
sync_jobs (
  id: uuid (primary key)
  user_id: uuid (foreign key)
  gmail_account_id: uuid (foreign key)
  status: enum (running, completed, failed)
  sync_from_date: timestamp
  sync_to_date: timestamp
  emails_scanned: integer
  documents_found: integer
  duplicates_skipped: integer
  started_at: timestamp
  completed_at: timestamp
  error_message: text
)
```

#### User Feedback Table (Learning Data)
```sql
user_feedback (
  id: uuid (primary key)
  user_id: uuid (foreign key)
  document_id: uuid (foreign key)
  action: enum (approved, rejected, reclassified)
  original_classification: enum (invoice, credit_note, unclassified)
  new_classification: enum (invoice, credit_note, unclassified)
  sender_domain: string
  feedback_at: timestamp
)
```

#### Sender Reputation Table
```sql
sender_reputation (
  id: uuid (primary key)
  user_id: uuid (foreign key)
  sender_domain: string
  approval_count: integer (default 0)
  rejection_count: integer (default 0)
  reputation_score: decimal (calculated: approvals - rejections)
  is_trusted: boolean (true if 3+ approvals)
  is_blocked: boolean (true if 2+ rejections)
  last_interaction: timestamp
  created_at: timestamp
  updated_at: timestamp

  UNIQUE(user_id, sender_domain)
)
```

### 6.3 API Endpoints

#### Authentication
- `POST /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Handle OAuth callback
- `POST /api/auth/logout` - Revoke tokens and logout

#### Gmail Integration
- `GET /api/gmail/account` - Get connected Gmail account (MVP: single account)
- `POST /api/gmail/connect` - Connect Gmail account
- `DELETE /api/gmail/disconnect` - Disconnect Gmail account
- `POST /api/gmail/sync` - Trigger manual email sync (last 24 hours)

#### Documents
- `GET /api/documents` - List all documents (with filters: status, classification, date)
- `GET /api/documents/:id` - Get document details
- `PUT /api/documents/:id/approve` - Approve document (moves to monthly folder)
- `DELETE /api/documents/:id/reject` - Reject document (deletes from Drive & DB)
- `PUT /api/documents/:id/reclassify` - Manually change classification
- `GET /api/documents/:id/preview` - Get PDF preview URL

#### Drive
- `GET /api/drive/folders` - Browse user's Drive folders (for selection)
- `POST /api/drive/folders/create` - Create new folder in Drive
- `POST /api/drive/folders/select` - Set selected folder for invoice storage
- `GET /api/drive/folders/current` - Get currently selected folder
- `POST /api/drive/setup` - Create subfolder structure (Pending/Approved/MM-YYYY)

#### Learning & Reputation
- `GET /api/learning/stats` - Get learning statistics (trusted/blocked senders)
- `GET /api/senders/reputation` - List sender reputation scores
- `POST /api/senders/:domain/trust` - Manually mark sender as trusted
- `POST /api/senders/:domain/block` - Manually mark sender as blocked
- `DELETE /api/senders/:domain` - Remove sender from lists

---

## 7. MVP Options (UPDATED)

### Option 1: Minimal CLI Tool (Fastest - 1-2 weeks) ❌ NOT RECOMMENDED
**Description:** Command-line interface for testing core functionality

**Why not:** Too limited for your requirements. You need Drive folder selection, user feedback tracking, and a dashboard interface which CLI cannot provide effectively.

---

### Option 2: Web Dashboard with Learning (Recommended - 3-4 weeks) ⭐ **RECOMMENDED**
**Description:** Complete web application with learning capabilities

**Scope:**
- ✅ Next.js web application with Supabase auth
- ✅ Single Gmail account connection (MVP limit)
- ✅ **Drive folder selection:** User browses and selects folder OR creates new one
- ✅ Manual sync button (syncs last 24 hours)
- ✅ Google Document AI for classification
- ✅ Dashboard table with all documents
- ✅ Approve/Reject workflow:
  - Approve → moves to Approved/MM-YYYY folder
  - Reject → deletes from Drive + removes DB record
- ✅ **Manual reclassification:** User can override classification
- ✅ **Duplicate prevention:** Checks by message ID + file hash
- ✅ **Learning system:**
  - Tracks user feedback (approvals, rejections, reclassifications)
  - Builds sender reputation (trusted/blocked lists)
  - Auto-skips blocked senders in future syncs
  - Prioritizes trusted senders
- ✅ **RLS (Row Level Security):** Complete isolation between users
- ✅ PDF preview modal
- ✅ Filter by status, classification, date
- ✅ Sender reputation dashboard

**Pros:**
- Meets ALL your requirements
- Learning improves over time
- Accountant can access shared Drive folder
- Secure multi-user support
- Foundation for production

**Cons:**
- More complex than basic MVP
- Learning needs time to show value (requires user data)

**Tech Stack:** Full stack from section 6.1

**Deliverables:**
- `/login` - Google OAuth (Gmail + Drive)
- `/setup` - Drive folder selection/creation
- `/dashboard` - Document table with sync button
- `/settings` - Account management, sender lists
- Approval workflow with reclassification
- Learning engine (rule-based)
- RLS policies on all tables

---

### Option 3: Advanced MVP with Auto-Sync (Complete - 5-6 weeks)
**Description:** Production-ready with automation and ML

**Scope:**
- Everything from Option 2, PLUS:
- ✅ Automated periodic sync (hourly/daily via cron)
- ✅ Email notifications for new invoices
- ✅ **Advanced ML:** Custom Document AI model trained on user data
- ✅ Sync multiple date ranges
- ✅ Bulk approve/reject actions
- ✅ Analytics dashboard (monthly trends, accuracy metrics)
- ✅ Export to CSV/Excel
- ✅ Webhook notifications
- ✅ Mobile-responsive design
- ✅ Advanced error recovery

**Pros:**
- Fully automated
- Best learning capabilities
- Production-ready
- Analytics insights

**Cons:**
- Longest development time
- Requires background job infrastructure
- ML training needs significant data

**Tech Stack:** Full stack + Vercel Cron + TensorFlow/Custom AI

---

## 8. Out of Scope (Future Enhancements)

### Phase 2 Features
- OCR for scanned invoices
- Automatic data extraction (amounts, dates, vendor info)
- Integration with accounting software (Sage, Primavera)
- Multi-user organizations/teams
- Advanced reporting and analytics
- Mobile app
- Bulk operations
- Custom classification rules
- Webhook notifications
- API for third-party integrations

---

## 9. Portuguese-Specific Considerations

### Document Standards
- Portuguese invoices follow specific formats per AT (Autoridade Tributária)
- Must handle both "Fatura" and "Factura" spellings
- Credit notes may be called "Nota de Crédito" or "NC"
- Common platforms: InvoiceXpress, Moloni, Sage, SAP

### Legal Requirements
- Invoices must be retained for 10 years (tax compliance)
- Data privacy (GDPR applies)
- Secure storage required

### Language Support
- UI should support Portuguese (PT-PT)
- Document classification for Portuguese terms
- Date formats (DD/MM/YYYY)

---

## 10. Security & Privacy

### Row Level Security (RLS) - CRITICAL
**All Supabase tables MUST have RLS enabled with these policies:**

#### Users Table
```sql
-- Users can only see their own record
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);
```

#### Gmail Accounts Table
```sql
-- Users can only access their own Gmail account
CREATE POLICY "Users can manage own Gmail account" ON gmail_accounts
  FOR ALL USING (auth.uid() = user_id);
```

#### User Settings Table
```sql
-- Users can only access their own settings
CREATE POLICY "Users can manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);
```

#### Documents Table
```sql
-- Users can only see their own documents
CREATE POLICY "Users can view own documents" ON documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON documents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON documents
  FOR DELETE USING (auth.uid() = user_id);
```

#### Sync Jobs Table
```sql
-- Users can only see their own sync jobs
CREATE POLICY "Users can view own sync jobs" ON sync_jobs
  FOR SELECT USING (auth.uid() = user_id);
```

#### User Feedback Table
```sql
-- Users can only access their own feedback
CREATE POLICY "Users can manage own feedback" ON user_feedback
  FOR ALL USING (auth.uid() = user_id);
```

#### Sender Reputation Table
```sql
-- Users can only access their own sender reputation data
CREATE POLICY "Users can manage own reputation data" ON sender_reputation
  FOR ALL USING (auth.uid() = user_id);
```

### Data Protection
- ✅ RLS enabled on ALL tables - users cannot access other users' data
- ✅ OAuth tokens encrypted at rest in Supabase
- ✅ No email body content stored (only metadata: subject, sender)
- ✅ Complete user data isolation via RLS
- ✅ GDPR compliant data handling
- ✅ Secure token refresh mechanism
- ✅ API endpoints validate user ownership before operations
- ✅ No shared data between users

### Permissions
- Minimal Gmail scope (gmail.readonly)
- Drive access for user's selected folder only
- User can revoke access anytime
- Audit log for document access (via user_feedback table)
- No anonymous access - all endpoints require authentication

---

## 11. Testing Strategy

### MVP Testing Focus
1. **Gmail Connection:** Test OAuth flow with multiple accounts
2. **Email Scanning:** Verify detection of Portuguese invoices
3. **Classification:** Test accuracy on 50+ real invoices/credit notes
4. **Drive Upload:** Confirm folder structure and metadata
5. **Approval Workflow:** Test move to monthly folders
6. **Error Handling:** Test with malformed PDFs, large mailboxes

### Test Data
- Collect 50+ sample Portuguese invoices
- Include edge cases (scanned, multi-page, non-standard)
- Test with different email clients/platforms

---

## 12. Success Criteria

### MVP Launch Criteria
- [ ] Successfully connect Gmail account
- [ ] Scan last 30 days of emails
- [ ] Achieve >80% classification accuracy
- [ ] Upload documents to Drive correctly
- [ ] Complete approval workflow functional
- [ ] Zero data loss or corruption
- [ ] Handle errors gracefully

### User Acceptance
- User can complete full workflow in <5 minutes
- Classification accuracy satisfies user
- No duplicate documents
- Folder organization is correct

---

## 13. Timeline Estimates

### Option 1 (CLI Tool)
- Week 1: Gmail API integration, email scanning
- Week 2: Classification logic, testing

### Option 2 (Web App - Recommended)
- Week 1: Authentication, database setup, Gmail integration
- Week 2: Document AI integration, Drive upload, document listing
- Week 3: Approval workflow, testing, refinement

### Option 3 (Full MVP)
- Weeks 1-2: Same as Option 2
- Week 3: Auto-sync, notifications, search/filter
- Week 4: Polish, edge cases, production deploy

---

## 14. Recommendation (UPDATED)

**Recommended Approach: Option 2 (Web Dashboard with Learning)**

### Rationale
1. **Meets ALL requirements:** Includes every feature you specified
2. **Learning capability:** System improves with usage via sender reputation
3. **User-driven folder selection:** Accountant collaboration ready
4. **Secure multi-user:** RLS prevents data leakage between users
5. **Manual sync for testing:** Last 24 hours perfect for MVP validation
6. **Reclassification support:** Users can correct and teach the system
7. **Duplicate prevention:** Won't store same invoice twice
8. **Complete workflow:** Approve → Move to monthly folder, Reject → Delete entirely

### MVP Feature Priorities
1. ✅ Gmail OAuth and connection - SINGLE account only (Critical)
2. ✅ Drive folder selection/creation (Critical)
3. ✅ Email sync last 24 hours with manual button (Critical)
4. ✅ Duplicate detection by message ID + file hash (Critical)
5. ✅ Google Document AI classification (Critical)
6. ✅ Drive upload to user-selected Pending folder (Critical)
7. ✅ Dashboard table with document listing (Critical)
8. ✅ Approve workflow → moves to Approved/MM-YYYY (Critical)
9. ✅ Reject workflow → deletes from Drive + DB (Critical)
10. ✅ Manual reclassification capability (Critical)
11. ✅ Learning system - sender reputation tracking (High)
12. ✅ RLS policies on all tables (Critical - Security)
13. ✅ PDF preview (High)
14. ⚠️ Filter by status/classification/date (Medium)
15. ⚠️ Sender reputation dashboard (Medium)
16. 🔄 Auto-sync (Future - Option 3)
17. 🔄 Email notifications (Future - Option 3)
18. 🔄 Advanced ML training (Future - Option 3)

---

## 15. Next Steps

1. Review and approve this PRD
2. Choose MVP option (recommend Option 2)
3. Set up development environment
4. Implement database schema
5. Build authentication flow
6. Develop Gmail integration
7. Integrate Document AI
8. Implement Drive storage
9. Build approval workflow
10. Test with real Portuguese invoices
11. Deploy to staging
12. User acceptance testing
13. Production launch

---

## 16. Questions & Decisions Needed

### ✅ ANSWERED (from user feedback):
1. ✅ **Sync frequency:** Manual button syncing last 24 hours (MVP)
2. ✅ **Retention:** Rejected documents deleted immediately from Drive + DB
3. ✅ **Multi-account:** NO - Single Gmail account per user in MVP
4. ✅ **Reclassification:** YES - Users can manually override classification
5. ✅ **Drive folder:** User selects existing folder OR creates new one from dashboard
6. ✅ **Duplicate handling:** Check by email message ID + file hash
7. ✅ **Learning:** YES - Track user feedback to build sender reputation
8. ✅ **RLS:** YES - All tables must have RLS policies

### ✅ FINAL DECISIONS:
9. ✅ **Hosting:** Vercel
10. ✅ **Monitoring:** None for MVP (can add later)
11. ✅ **PDF Preview:** Open in new tab (not modal)

### ⚠️ STILL NEEDED (Optional - can decide during implementation):
1. **Sender reputation threshold:** Keep at 3 approvals = trusted, 2 rejections = blocked?
2. **Learning reset:** Should user be able to reset reputation for specific sender?
3. **Date range expansion:** After MVP, allow custom date ranges for sync?
4. **Bulk actions:** Should dashboard support select-all and bulk approve/reject?

---

## Appendix A: Common Portuguese Invoice Senders

- InvoiceXpress (invoicexpress.com)
- Moloni (moloni.pt)
- Sage (sage.pt)
- SAP
- EDP (energy bills)
- MEO/NOS/Vodafone (telecom)
- CTT (postal service)
- Various accounting firms

## Appendix B: Sample Email Patterns

**Invoice Email Subjects:**
- "Fatura #FT2026/001"
- "Nova fatura disponível"
- "Invoice from [Company]"
- "Documento: Fatura"

**Credit Note Email Subjects:**
- "Nota de Crédito NC2026/001"
- "Credit Note #NC001"
- "Emissão de Nota de Crédito"
