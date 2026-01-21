# Invoice Collector - Setup Guide

## ✅ Phase 1 Complete - Authentication System

### 1. Database Setup
- ✅ Supabase schema created
- ✅ All tables with RLS policies configured
- ✅ Automated triggers for sender reputation
- ✅ Database verification passed

### 2. Authentication
- ✅ Google OAuth with Gmail + Drive scopes
- ✅ Token storage in `gmail_accounts` table
- ✅ Automatic user settings creation
- ✅ Protected routes with middleware
- ✅ Login/logout functionality
- ✅ Error handling and user feedback

## ✅ Phase 2 Complete - Drive Setup & Gmail Sync

### 3. Drive Folder Setup
- ✅ Setup page with folder selection UI
- ✅ Create new folder with automatic structure
- ✅ Select existing Drive folders
- ✅ Automatic creation of "Pending Approval" and "Approved" subfolders
- ✅ Folder configuration saved to database
- ✅ Token refresh logic for Drive API calls

### 4. Gmail Integration
- ✅ Gmail API client implementation
- ✅ Email scanning with keyword filtering
- ✅ PDF attachment extraction
- ✅ Duplicate detection by file hash
- ✅ Sender domain extraction
- ✅ Automatic token refresh using refresh_token

### 5. Document Classification
- ✅ Keyword-based classification (invoice/credit note/other)
- ✅ Confidence scoring
- ✅ Ready for Document AI integration

### 6. Document Management Dashboard
- ✅ Document listing with real-time status
- ✅ Sync statistics display
- ✅ Manual sync button
- ✅ Document preview (opens in Google Drive)
- ✅ Approve/Reject/Reclassify workflow
- ✅ Approved documents view with filtering and search

### 7. Document Actions
- ✅ **Approve**: Moves to Approved/MM-YYYY folder
- ✅ **Reject**: Deletes from Drive and database
- ✅ **Reclassify**: Manual classification override
- ✅ User feedback tracking for learning system
- ✅ Automatic sender reputation updates

### 8. Token Management (Critical Fix)
- ✅ Automatic token refresh when expired
- ✅ Database storage of access and refresh tokens
- ✅ 5-minute buffer for token expiry
- ✅ Seamless token updates across all API calls

## 🚀 How to Use the Application

### First Time Setup

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Navigate to http://localhost:3000**

3. **Sign in with Google**
   - Click "Sign in with Google"
   - Grant permissions for Gmail and Drive access
   - You'll be redirected to the setup page

4. **Configure Drive Folder**
   - Choose to create a new folder OR select an existing one
   - The app will automatically create the folder structure:
     - `Your Folder/`
       - `Pending Approval/` (new documents go here)
       - `Approved/` (approved documents organized by month)

5. **You're ready!** You'll be redirected to the dashboard

### Daily Usage

1. **Sync Emails**
   - Click "Sync Emails" button on the dashboard
   - The app scans your Gmail for PDFs from the last 24 hours
   - Documents with invoice keywords are classified and uploaded to Drive
   - Duplicates are automatically skipped based on file hash
   - Tokens are automatically refreshed if expired

2. **Review Pending Documents**
   - Navigate to the "Pending" tab on the dashboard
   - Each document shows:
     - Filename, sender, subject
     - Classification (Invoice/Credit Note/Other)
     - Confidence score
     - Received date
   - Click "View PDF" to open in Google Drive (new tab)

3. **Take Action**
   - **Approve**: Moves to `Approved/MM-YYYY` folder, marks as approved
   - **Reject**: Deletes from Drive and database completely
   - **Reclassify**: Change classification (Invoice ↔ Credit Note ↔ Other)

4. **View Approved Documents**
   - Navigate to the "Approved" tab
   - See all approved documents with statistics
   - Filter by classification (Invoice/Credit Note/Other)
   - Search by filename, sender, or subject
   - Sort by date, sender, or filename
   - Click "View in Drive" to open documents

5. **Learning System**
   - Your approve/reject actions train the system
   - Senders with 3+ approvals become "trusted"
   - Senders with 2+ rejections get "blocked" status
   - Reputation updates automatically via database triggers

## 📁 Project Structure

```
invoice-collector/
├── app/
│   ├── api/
│   │   ├── auth/              # Authentication routes
│   │   ├── drive/folders/     # Drive folder management
│   │   ├── sync/              # Gmail sync endpoint
│   │   └── documents/         # Document action endpoints
│   ├── dashboard/             # Main dashboard (pending docs)
│   ├── approved/              # Approved documents page
│   ├── setup/                 # Drive folder setup page
│   └── login/                 # Login page
├── components/
│   ├── ui/                    # UI components (Button, etc.)
│   ├── logout-button.tsx      # Logout functionality
│   ├── sync-button.tsx        # Manual sync trigger
│   ├── document-list.tsx      # Pending documents list
│   └── approved-document-list.tsx  # Approved documents with filters
├── lib/
│   ├── supabase/              # Supabase clients
│   ├── gmail.ts               # Gmail API helpers
│   ├── google-drive.ts        # Drive API helpers
│   ├── document-ai.ts         # Classification logic
│   ├── token-refresh.ts       # OAuth token management
│   └── constants.ts           # Keywords and constants
└── types/
    └── database.ts            # TypeScript database types
```

## 🔧 Configuration Files

### Environment Variables (.env.local)
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email Notifications (Optional - for automation)
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM="Invoice Collector <notifications@yourdomain.com>"

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron Security (Optional - for automation)
CRON_SECRET=your-random-secret-string
```

**Notes:**
- Google credentials are used for OAuth token refresh
- Service role key is required for automated sync (bypasses RLS)
- Email configuration is optional but required for notifications
- See [AUTOMATION_SETUP.md](AUTOMATION_SETUP.md) for automation setup

### Database Tables
- `gmail_accounts` - OAuth tokens and refresh tokens
- `user_settings` - Drive folder configuration, sync preferences
- `documents` - All scanned documents with metadata
- `sync_jobs` - Sync history and statistics
- `user_feedback` - User actions for learning
- `sender_reputation` - Automated sender scores

## 🎯 Features Implemented

### Core Features (All Complete!)
- ✅ Google OAuth authentication with token refresh
- ✅ Gmail email scanning (configurable days back)
- ✅ PDF extraction from emails
- ✅ Keyword-based classification
- ✅ Google Drive integration with automatic folder creation
- ✅ Folder structure management
- ✅ Approve/Reject workflow
- ✅ Manual reclassification
- ✅ Duplicate detection by file hash
- ✅ Sender reputation system
- ✅ User feedback tracking
- ✅ RLS security policies
- ✅ Approved documents view with filtering and search
- ✅ Automatic token refresh on expiry

### Automation Features (All Complete!)
- ✅ Hourly automated sync via cron job
- ✅ Email notifications for new documents
- ✅ Configurable sync and notification settings
- ✅ Test email functionality
- ✅ Settings management UI
- ✅ Beautiful HTML email templates
- ✅ Protected cron endpoint with authentication

### System Behavior

**Document Flow:**
1. Token validation and automatic refresh if needed
2. Sync finds emails with PDF attachments (from configured days back)
3. Checks for invoice/credit note keywords in subject/sender
4. Extracts PDFs and calculates SHA-256 file hash
5. Checks for duplicates by file hash (skips if found)
6. Classifies document with confidence score
7. Uploads to "Pending Approval" folder in Drive
8. Saves metadata to database with all email details

**Approval Flow:**
1. User clicks "Approve"
2. File moves to `Approved/MM-YYYY` folder (based on received date)
3. Document status updated to "approved"
4. Feedback recorded
5. Sender reputation updated (via trigger)

**Rejection Flow:**
1. User clicks "Reject"
2. File deleted from Drive permanently
3. Document status updated to "rejected"
4. Feedback recorded
5. Sender reputation updated (via trigger)

## 🐛 Troubleshooting

### Authentication Issues
- Ensure Google OAuth is enabled in Supabase
- Check redirect URLs are configured correctly
- Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in .env.local
- Clear browser cookies and try again

### Sync Not Finding Documents
- Check Gmail has PDFs in last 24 hours
- Verify emails contain invoice keywords (fatura, factura, invoice, ft, fa, nota de crédito, credit note, nc)
- Keywords must appear in subject line or sender email
- Check browser console for API errors
- Token refresh happens automatically if expired

### Drive Errors
- Ensure OAuth tokens have Drive permissions
- Check Drive folder exists and is accessible
- Verify folder ID is saved in user_settings
- Folder listing will auto-refresh tokens if needed

### Token Issues
- Access tokens automatically refresh using refresh_token
- Tokens expire after 1 hour but refresh 5 minutes before expiry
- If you see "No refresh token available", log out and log in again
- Token refresh happens transparently on all API calls

## ✅ Phase 3 Complete - Automation & Notifications

### 9. Automated Sync
- ✅ Cron job endpoint for hourly automated syncing
- ✅ Configurable sync frequency (1-30 days back)
- ✅ User settings to enable/disable auto-sync
- ✅ Vercel Cron configuration
- ✅ Support for external cron services
- ✅ Protected endpoint with secret token

### 10. Email Notifications
- ✅ Email templates using Resend
- ✅ New documents notification emails
- ✅ Test email functionality
- ✅ Configurable notification preferences
- ✅ Custom notification email address
- ✅ Beautiful HTML email templates

### 11. Settings Page
- ✅ Sync configuration UI
- ✅ Notification preferences
- ✅ Test email button
- ✅ Navigation integration
- ✅ Settings API endpoints

**Setup Guide**: See [AUTOMATION_SETUP.md](AUTOMATION_SETUP.md) for detailed setup instructions.

## 📈 Next Steps (Future Enhancements)

- [ ] Real Google Document AI integration for better classification
- [ ] Support multiple Gmail accounts per user
- [ ] Bulk approve/reject actions
- [ ] Export reports (CSV, Excel)
- [ ] Mobile responsive improvements
- [ ] Analytics dashboard with charts
- [ ] OCR text extraction for searchability
- [ ] Custom folder organization rules
- [ ] Webhook notifications
- [ ] Slack/Discord integrations

## ✨ Current Status

**Fully Functional with Automation** ✅

The application is production-ready with all features implemented:
- Authentication ✅
- Drive setup ✅
- Gmail sync (manual & automated) ✅
- Document management ✅
- Learning system ✅
- Security (RLS) ✅
- Email notifications ✅
- Automated scheduling ✅

The app automatically collects invoices from Gmail every hour and notifies you via email when new documents arrive!
