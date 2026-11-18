// Hand-written database types for Forma Office, matching
// supabase/migrations/20261117010000_forma_auth_workspace.sql,
// supabase/migrations/20261117020000_forma_documents_library.sql,
// supabase/migrations/20261117030000_forma_editor_sessions.sql and
// supabase/migrations/20261118050000_forma_ocr.sql.
//
// DRAFT until the migrations are applied to the live project: then
// run `supabase gen types typescript --project-id <ref>` and replace
// this file with the generated output. Do not edit the generated
// shape by hand after that point.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type WorkspaceRole =
  "owner" | "admin" | "editor" | "commenter" | "viewer";

export type MemberStatus = "active" | "invited" | "removed";

export type PlanKey = "free" | "pro" | "team";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_path: string | null;
          locale: string;
          ocr_language: string;
          image_export_format: string;
          image_export_dpi: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_path?: string | null;
          locale?: string;
          ocr_language?: string;
          image_export_format?: string;
          image_export_dpi?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_path?: string | null;
          locale?: string;
          ocr_language?: string;
          image_export_format?: string;
          image_export_dpi?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          plan_key: PlanKey;
          is_personal: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          plan_key?: PlanKey;
          is_personal?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string;
          plan_key?: PlanKey;
          is_personal?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          id: string;
          workspace_id: string;
          parent_id: string | null;
          name: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          parent_id?: string | null;
          name: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          parent_id?: string | null;
          name?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "folders_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          // NOTE: the parent_id self-reference (folders_parent_id_fkey)
          // exists in the database but is deliberately NOT declared
          // here: supabase-js's query-type inference loops on
          // self-referencing tables and fails with TS7022. No query
          // in the app joins folders to itself. Re-check when the
          // types are regenerated with `supabase gen types`.
        ];
      };
      documents: {
        Row: {
          id: string;
          workspace_id: string;
          folder_id: string | null;
          title: string;
          file_path: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          folder_id?: string | null;
          title: string;
          file_path?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          folder_id?: string | null;
          title?: string;
          file_path?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          id: string;
          document_id: string;
          workspace_id: string;
          version_number: number;
          file_path: string;
          mime_type: string | null;
          size_bytes: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          workspace_id: string;
          version_number: number;
          file_path: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          workspace_id?: string;
          version_number?: number;
          file_path?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      document_stars: {
        Row: {
          document_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          document_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          document_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_stars_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      editor_sessions: {
        Row: {
          key: string;
          document_id: string;
          workspace_id: string;
          user_id: string;
          version: number;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          key: string;
          document_id: string;
          workspace_id: string;
          user_id: string;
          version: number;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          key?: string;
          document_id?: string;
          workspace_id?: string;
          user_id?: string;
          version?: number;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "editor_sessions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "editor_sessions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      document_shares: {
        Row: {
          id: string;
          document_id: string;
          workspace_id: string;
          token_hash: string;
          expires_at: string | null;
          created_by: string;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          document_id: string;
          workspace_id: string;
          token_hash: string;
          expires_at?: string | null;
          created_by: string;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          document_id?: string;
          workspace_id?: string;
          token_hash?: string;
          expires_at?: string | null;
          created_by?: string;
          created_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      ocr_jobs: {
        Row: {
          id: string;
          document_id: string;
          workspace_id: string;
          user_id: string;
          status: string;
          language: string;
          page_count: number | null;
          processed_pages: number;
          error: string | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          document_id: string;
          workspace_id: string;
          user_id: string;
          status?: string;
          language?: string;
          page_count?: number | null;
          processed_pages?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          document_id?: string;
          workspace_id?: string;
          user_id?: string;
          status?: string;
          language?: string;
          page_count?: number | null;
          processed_pages?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ocr_jobs_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ocr_jobs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      document_ocr_results: {
        Row: {
          id: string;
          document_id: string;
          workspace_id: string;
          job_id: string;
          page_number: number;
          text: string;
          mean_confidence: number | null;
          language: string;
          words: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          workspace_id: string;
          job_id: string;
          page_number: number;
          text?: string;
          mean_confidence?: number | null;
          language?: string;
          words?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          workspace_id?: string;
          job_id?: string;
          page_number?: number;
          text?: string;
          mean_confidence?: number | null;
          language?: string;
          words?: unknown;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_ocr_results_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_ocr_results_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_ocr_results_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "ocr_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
          status: MemberStatus;
          joined_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: WorkspaceRole;
          status?: MemberStatus;
          joined_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          role?: WorkspaceRole;
          status?: MemberStatus;
          joined_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
