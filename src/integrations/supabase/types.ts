export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      artworks: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          elements: Json | null
          id: string
          image_url: string
          project_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          elements?: Json | null
          id?: string
          image_url: string
          project_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          elements?: Json | null
          id?: string
          image_url?: string
          project_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artworks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_generations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json
          template_snapshot: Json
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          template_snapshot: Json
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          template_snapshot?: Json
          type?: string
        }
        Relationships: []
      }
      card_uploads: {
        Row: {
          card_id: string | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          upload_type: string
          uploaded_at: string | null
        }
        Insert: {
          card_id?: string | null
          file_name: string
          file_type: string
          file_url: string
          id?: string
          upload_type: string
          uploaded_at?: string | null
        }
        Update: {
          card_id?: string | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          upload_type?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_uploads_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "project_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_data: {
        Row: {
          active: boolean
          brand_kit: Json | null
          briefing: string | null
          company: string | null
          created_at: string | null
          created_by: string | null
          email: string
          id: string
          image_type: string | null
          monthly_amount: number | null
          name: string
          narration_type: string | null
          notes: string | null
          particularity_type: string | null
          payment_due_day: number | null
          payment_method: string | null
          phone: string | null
          slug: string
          team: string | null
        }
        Insert: {
          active?: boolean
          brand_kit?: Json | null
          briefing?: string | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
          image_type?: string | null
          monthly_amount?: number | null
          name: string
          narration_type?: string | null
          notes?: string | null
          particularity_type?: string | null
          payment_due_day?: number | null
          payment_method?: string | null
          phone?: string | null
          slug: string
          team?: string | null
        }
        Update: {
          active?: boolean
          brand_kit?: Json | null
          briefing?: string | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
          image_type?: string | null
          monthly_amount?: number | null
          name?: string
          narration_type?: string | null
          notes?: string | null
          particularity_type?: string | null
          payment_due_day?: number | null
          payment_method?: string | null
          phone?: string | null
          slug?: string
          team?: string | null
        }
        Relationships: []
      }
      client_payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string | null
          created_by: string | null
          due_date: string
          id: string
          notes: string | null
          paid: boolean
          paid_at: string | null
          payment_method: string | null
        }
        Insert: {
          amount?: number
          client_id: string
          created_at?: string | null
          created_by?: string | null
          due_date: string
          id?: string
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          payment_method?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_data"
            referencedColumns: ["id"]
          },
        ]
      }
      client_uploads: {
        Row: {
          client_id: string
          file_name: string
          file_type: string
          file_url: string
          id: string
          uploaded_at: string | null
        }
        Insert: {
          client_id: string
          file_name: string
          file_type: string
          file_url: string
          id?: string
          uploaded_at?: string | null
        }
        Update: {
          client_id?: string
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_uploads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_data"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          brand_kit: Json | null
          company: string | null
          created_at: string | null
          created_by: string | null
          email: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          brand_kit?: Json | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          brand_kit?: Json | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      master_templates: {
        Row: {
          background_color: string
          created_at: string
          created_by: string | null
          deleted: boolean
          elements: Json
          height: number
          id: string
          name: string
          updated_at: string
          width: number
        }
        Insert: {
          background_color?: string
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          elements?: Json
          height?: number
          id?: string
          name: string
          updated_at?: string
          width?: number
        }
        Update: {
          background_color?: string
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          elements?: Json
          height?: number
          id?: string
          name?: string
          updated_at?: string
          width?: number
        }
        Relationships: []
      }
      master_video_templates: {
        Row: {
          audio_url_1: string | null
          audio_url_2: string | null
          background_color: string
          content_elements: Json
          created_at: string
          created_by: string | null
          deleted: boolean
          height: number
          id: string
          name: string
          page_duration: number
          signature_elements: Json
          updated_at: string
          width: number
        }
        Insert: {
          audio_url_1?: string | null
          audio_url_2?: string | null
          background_color?: string
          content_elements?: Json
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          height?: number
          id?: string
          name: string
          page_duration?: number
          signature_elements?: Json
          updated_at?: string
          width?: number
        }
        Update: {
          audio_url_1?: string | null
          audio_url_2?: string | null
          background_color?: string
          content_elements?: Json
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          height?: number
          id?: string
          name?: string
          page_duration?: number
          signature_elements?: Json
          updated_at?: string
          width?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_master: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_master?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_master?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      project_briefs: {
        Row: {
          art_generation_selected: boolean
          brand_kit_id: string | null
          brief_type: string | null
          client_id: string | null
          cover_image: string | null
          cover_video: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          generated_caption: string | null
          generated_video_expires_at: string | null
          generated_video_url: string | null
          id: string
          published: boolean
          sort_order: number
          status: string | null
          title: string
        }
        Insert: {
          art_generation_selected?: boolean
          brand_kit_id?: string | null
          brief_type?: string | null
          client_id?: string | null
          cover_image?: string | null
          cover_video?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          generated_caption?: string | null
          generated_video_expires_at?: string | null
          generated_video_url?: string | null
          id?: string
          published?: boolean
          sort_order?: number
          status?: string | null
          title: string
        }
        Update: {
          art_generation_selected?: boolean
          brand_kit_id?: string | null
          brief_type?: string | null
          client_id?: string | null
          cover_image?: string | null
          cover_video?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          generated_caption?: string | null
          generated_video_expires_at?: string | null
          generated_video_url?: string | null
          id?: string
          published?: boolean
          sort_order?: number
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_briefs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_data"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
