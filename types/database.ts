export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type DocumentClassification = 'invoice' | 'credit_note' | 'unclassified'
export type DocumentStatus = 'pending' | 'approved' | 'rejected'
export type SyncStatus = 'running' | 'completed' | 'failed'
export type FeedbackAction = 'approved' | 'rejected' | 'reclassified'
export type UserRole = 'user' | 'admin'
export type ProfileStatus = 'invited' | 'active' | 'suspended'
export type InviteStatus = 'active' | 'used' | 'revoked' | 'expired'
// Mirrors the enums in 024_classification_rules.sql (and lib/classifier/rules.ts).
export type ClassificationRuleStage = import('@/lib/classifier/rules').RuleStage
export type ClassificationRuleMatch = import('@/lib/classifier/rules').RuleMatchType
export type ClassificationRuleAction = import('@/lib/classifier/rules').RuleAction
export type DocumentSource = 'gmail' | 'inbox_folder'

// Profile type for user management
export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  status?: ProfileStatus
  invited_by?: string | null
  onboarding_completed?: boolean
  onboarding_step?: number
  demo_invoice_created?: boolean
  created_at: string
  updated_at: string
}

// Admin statistics (aggregate data only)
export interface AdminStats {
  total_users: number
  connected_accounts: number
  active_syncs: number
  syncs_completed_today: number
  syncs_failed_today: number
  documents_processed_today: number
  total_pending_documents: number
  total_approved_documents: number
  total_rejected_documents: number
  active_users_today: number
  total_documents_found_today: number
  total_duplicates_skipped_today: number
}

// Admin sync log entry
export interface AdminSyncLog {
  id: string
  user_id: string
  user_email: string | null
  status: SyncStatus
  sync_from_date: string
  sync_to_date: string
  emails_scanned: number
  documents_found: number
  duplicates_skipped: number
  started_at: string
  completed_at: string | null
  error_message: string | null
  duration_seconds: number | null
}

export type Database = {
  public: {
    Tables: {
      classification_rules: {
        Row: {
          id: string
          user_id: string
          name: string
          enabled: boolean
          priority: number
          stage: ClassificationRuleStage
          match_type: ClassificationRuleMatch
          match_value: string
          action: ClassificationRuleAction
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          enabled?: boolean
          priority?: number
          stage: ClassificationRuleStage
          match_type: ClassificationRuleMatch
          match_value: string
          action: ClassificationRuleAction
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          enabled?: boolean
          priority?: number
          stage?: ClassificationRuleStage
          match_type?: ClassificationRuleMatch
          match_value?: string
          action?: ClassificationRuleAction
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          session_version?: number
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role: UserRole
          status?: ProfileStatus
          invited_by?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          demo_invoice_created?: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          session_version?: number
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role?: UserRole
          status?: ProfileStatus
          invited_by?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          demo_invoice_created?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          session_version?: number
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: UserRole
          status?: ProfileStatus
          invited_by?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          demo_invoice_created?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_credentials: {
        Row: {
          profile_id: string
          password_hash: string
          created_at: string
          updated_at: string
        }
        Insert: {
          profile_id: string
          password_hash: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          profile_id?: string
          password_hash?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          id: string
          user_id: string
          provider: 'anthropic' | 'openai'
          encrypted_key: string
          key_hint: string
          status: 'unverified' | 'valid' | 'invalid'
          last_validated_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: 'anthropic' | 'openai'
          encrypted_key: string
          key_hint: string
          status?: 'unverified' | 'valid' | 'invalid'
          last_validated_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: 'anthropic' | 'openai'
          encrypted_key?: string
          key_hint?: string
          status?: 'unverified' | 'valid' | 'invalid'
          last_validated_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          id: string
          code: string
          email: string | null
          created_by: string
          used_by: string | null
          used_at: string | null
          expires_at: string
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          email?: string | null
          created_by: string
          used_by?: string | null
          used_at?: string | null
          expires_at: string
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          email?: string | null
          created_by?: string
          used_by?: string | null
          used_at?: string | null
          expires_at?: string
          revoked_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          id: string
          profile_id: string
          token_hash: string
          expires_at: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          token_hash: string
          expires_at: string
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          token_hash?: string
          expires_at?: string
          used_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      gmail_accounts: {
        Row: {
          id: string
          user_id: string
          email: string
          access_token: string
          refresh_token: string
          token_expiry: string
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email: string
          access_token: string
          refresh_token: string
          token_expiry: string
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          email?: string
          access_token?: string
          refresh_token?: string
          token_expiry?: string
          is_primary?: boolean
          created_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          id: string
          user_id: string
          drive_folder_id: string | null
          drive_folder_name: string | null
          drive_folder_path: string | null
          inbox_folder_id: string | null
          inbox_folder_name: string | null
          inbox_folder_enabled: boolean
          inbox_folder_mode?: 'managed' | 'existing' | null
          pending_folder_id: string | null
          approved_folder_id: string | null
          approved_folder_name: string | null
          approved_folder_mode: 'managed' | 'existing' | null
          approved_filename_template: string | null
          last_inbox_sync_at: string | null
          sync_days_back: number
          auto_sync_enabled: boolean
          email_notifications_enabled: boolean
          notification_email: string | null
          inbound_email?: string | null
          last_auto_sync_at: string | null
          webhook_url: string | null
          gmail_sync_label: string | null
          archive_synced_emails: boolean
          enabled_sources?: string[]
          subscription_tier: 'free' | 'paid'
          sync_frequency_minutes: number
          auto_reject_enabled: boolean
          auto_approve_enabled: boolean
          classification_confidence_threshold: number
          duplicate_pair_default: 'ask' | 'invoice' | 'receipt' | 'both'
          classifier_backend: 'webhook' | 'anthropic' | 'openai'
          classifier_model: string | null
          prefilter_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          drive_folder_id?: string | null
          drive_folder_name?: string | null
          drive_folder_path?: string | null
          inbox_folder_id?: string | null
          inbox_folder_name?: string | null
          inbox_folder_enabled?: boolean
          inbox_folder_mode?: 'managed' | 'existing' | null
          pending_folder_id?: string | null
          approved_folder_id?: string | null
          approved_folder_name?: string | null
          approved_folder_mode?: 'managed' | 'existing' | null
          approved_filename_template?: string | null
          last_inbox_sync_at?: string | null
          sync_days_back?: number
          auto_sync_enabled?: boolean
          email_notifications_enabled?: boolean
          notification_email?: string | null
          inbound_email?: string | null
          last_auto_sync_at?: string | null
          webhook_url?: string | null
          gmail_sync_label?: string | null
          archive_synced_emails?: boolean
          enabled_sources?: string[]
          subscription_tier?: 'free' | 'paid'
          sync_frequency_minutes?: number
          auto_reject_enabled?: boolean
          auto_approve_enabled?: boolean
          classification_confidence_threshold?: number
          duplicate_pair_default?: 'ask' | 'invoice' | 'receipt' | 'both'
          classifier_backend?: 'webhook' | 'anthropic' | 'openai'
          classifier_model?: string | null
          prefilter_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          drive_folder_id?: string | null
          drive_folder_name?: string | null
          drive_folder_path?: string | null
          inbox_folder_id?: string | null
          inbox_folder_name?: string | null
          inbox_folder_enabled?: boolean
          inbox_folder_mode?: 'managed' | 'existing' | null
          pending_folder_id?: string | null
          approved_folder_id?: string | null
          approved_folder_name?: string | null
          approved_folder_mode?: 'managed' | 'existing' | null
          approved_filename_template?: string | null
          last_inbox_sync_at?: string | null
          sync_days_back?: number
          auto_sync_enabled?: boolean
          email_notifications_enabled?: boolean
          notification_email?: string | null
          inbound_email?: string | null
          last_auto_sync_at?: string | null
          webhook_url?: string | null
          gmail_sync_label?: string | null
          archive_synced_emails?: boolean
          enabled_sources?: string[]
          subscription_tier?: 'free' | 'paid'
          sync_frequency_minutes?: number
          auto_reject_enabled?: boolean
          auto_approve_enabled?: boolean
          classification_confidence_threshold?: number
          duplicate_pair_default?: 'ask' | 'invoice' | 'receipt' | 'both'
          classifier_backend?: 'webhook' | 'anthropic' | 'openai'
          classifier_model?: string | null
          prefilter_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          notified_at: string | null
          id: string
          user_id: string
          gmail_account_id: string | null
          email_message_id: string
          file_hash: string
          subject: string | null
          sender: string | null
          sender_domain: string | null
          received_date: string
          filename: string
          original_classification: DocumentClassification
          final_classification: DocumentClassification
          confidence_score: number | null
          classification_source: string | null
          classification_model: string | null
          rules_applied: Json | null
          variant: string | null
          pair_state: string
          paired_with_id: string | null
          pair_reason: string | null
          classification_reason: string | null
          needs_review: boolean
          prefilter_matched: Json | null
          was_reclassified: boolean
          status: DocumentStatus
          is_demo?: boolean
          drive_file_id: string | null
          drive_folder_path: string | null
          source: DocumentSource
          inbox_file_id: string | null
          processed_at: string
          approved_at: string | null
          rejected_at: string | null
          auto_action_reason: string | null
          invoice_number: string | null
          issue_date: string | null
          supplier_name: string | null
          invoice_date?: string | null
          supplier_vat_number: string | null
          total_without_vat: number | null
          total_vat: number | null
          invoice_total: number | null
          currency: string | null
          numb_pages: number | null
          document_type: string | null
          webhook_processed_at: string | null
          webhook_error: string | null
        }
        Insert: {
          notified_at?: string | null
          id?: string
          user_id: string
          gmail_account_id?: string | null
          email_message_id: string
          file_hash: string
          subject?: string | null
          sender?: string | null
          sender_domain?: string | null
          received_date: string
          filename: string
          original_classification: DocumentClassification
          final_classification: DocumentClassification
          confidence_score?: number | null
          classification_source?: string | null
          classification_model?: string | null
          rules_applied?: Json | null
          variant?: string | null
          pair_state?: string
          paired_with_id?: string | null
          pair_reason?: string | null
          classification_reason?: string | null
          needs_review?: boolean
          prefilter_matched?: Json | null
          was_reclassified?: boolean
          status?: DocumentStatus
          is_demo?: boolean
          drive_file_id?: string | null
          drive_folder_path?: string | null
          source?: DocumentSource
          inbox_file_id?: string | null
          processed_at?: string
          approved_at?: string | null
          rejected_at?: string | null
          auto_action_reason?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          supplier_name?: string | null
          invoice_date?: string | null
          supplier_vat_number?: string | null
          total_without_vat?: number | null
          total_vat?: number | null
          invoice_total?: number | null
          currency?: string | null
          numb_pages?: number | null
          document_type?: string | null
          webhook_processed_at?: string | null
          webhook_error?: string | null
        }
        Update: {
          notified_at?: string | null
          id?: string
          user_id?: string
          gmail_account_id?: string | null
          email_message_id?: string
          file_hash?: string
          subject?: string | null
          sender?: string | null
          sender_domain?: string | null
          received_date?: string
          filename?: string
          original_classification?: DocumentClassification
          final_classification?: DocumentClassification
          confidence_score?: number | null
          classification_source?: string | null
          classification_model?: string | null
          rules_applied?: Json | null
          variant?: string | null
          pair_state?: string
          paired_with_id?: string | null
          pair_reason?: string | null
          classification_reason?: string | null
          needs_review?: boolean
          prefilter_matched?: Json | null
          was_reclassified?: boolean
          status?: DocumentStatus
          is_demo?: boolean
          drive_file_id?: string | null
          drive_folder_path?: string | null
          source?: DocumentSource
          inbox_file_id?: string | null
          processed_at?: string
          approved_at?: string | null
          rejected_at?: string | null
          auto_action_reason?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          supplier_name?: string | null
          invoice_date?: string | null
          supplier_vat_number?: string | null
          total_without_vat?: number | null
          total_vat?: number | null
          invoice_total?: number | null
          currency?: string | null
          numb_pages?: number | null
          document_type?: string | null
          webhook_processed_at?: string | null
          webhook_error?: string | null
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          id: string
          user_id: string
          gmail_account_id: string
          status: SyncStatus
          sync_from_date: string
          sync_to_date: string
          emails_scanned: number
          documents_found: number
          duplicates_skipped: number
          started_at: string
          completed_at: string | null
          error_message: string | null
        }
        Insert: {
          id?: string
          user_id: string
          gmail_account_id: string
          status?: SyncStatus
          sync_from_date: string
          sync_to_date: string
          emails_scanned?: number
          documents_found?: number
          duplicates_skipped?: number
          started_at?: string
          completed_at?: string | null
          error_message?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          gmail_account_id?: string
          status?: SyncStatus
          sync_from_date?: string
          sync_to_date?: string
          emails_scanned?: number
          documents_found?: number
          duplicates_skipped?: number
          started_at?: string
          completed_at?: string | null
          error_message?: string | null
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          id: string
          user_id: string
          document_id: string
          action: FeedbackAction
          original_classification: DocumentClassification | null
          new_classification: DocumentClassification | null
          sender_domain: string | null
          feedback_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_id: string
          action: FeedbackAction
          original_classification?: DocumentClassification | null
          new_classification?: DocumentClassification | null
          sender_domain?: string | null
          feedback_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_id?: string
          action?: FeedbackAction
          original_classification?: DocumentClassification | null
          new_classification?: DocumentClassification | null
          sender_domain?: string | null
          feedback_at?: string
        }
        Relationships: []
      }
      sender_reputation: {
        Row: {
          id: string
          user_id: string
          sender_domain: string
          approval_count: number
          rejection_count: number
          reputation_score: number
          is_trusted: boolean
          is_blocked: boolean
          last_interaction: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          sender_domain: string
          approval_count?: number
          rejection_count?: number
          reputation_score?: number
          is_trusted?: boolean
          is_blocked?: boolean
          last_interaction?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          sender_domain?: string
          approval_count?: number
          rejection_count?: number
          reputation_score?: number
          is_trusted?: boolean
          is_blocked?: boolean
          last_interaction?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_stats: {
        Row: { [K in keyof AdminStats]: AdminStats[K] }
        Relationships: []
      }
      admin_sync_logs: {
        Row: { [K in keyof AdminSyncLog]: AdminSyncLog[K] }
        Relationships: []
      }
    }
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    CompositeTypes: Record<string, never>
    Enums: {
      document_classification: DocumentClassification
      document_status: DocumentStatus
      sync_status: SyncStatus
      feedback_action: FeedbackAction
    }
  }
}
