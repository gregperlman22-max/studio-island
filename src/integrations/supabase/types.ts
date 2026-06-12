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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          age_bands: string[]
          config: Json
          description: string
          engagement_loop: string
          id: string
          is_active: boolean
          modalities: string[]
          therapeutic_targets: string[]
          title: string
          zone_id: string
        }
        Insert: {
          age_bands?: string[]
          config?: Json
          description: string
          engagement_loop: string
          id?: string
          is_active?: boolean
          modalities?: string[]
          therapeutic_targets?: string[]
          title: string
          zone_id: string
        }
        Update: {
          age_bands?: string[]
          config?: Json
          description?: string
          engagement_loop?: string
          id?: string
          is_active?: boolean
          modalities?: string[]
          therapeutic_targets?: string[]
          title?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          activity_id: string
          assigned_by_profile_id: string
          created_at: string
          frequency_note: string | null
          id: string
          resident_id: string
          status: Database["public"]["Enums"]["assignment_status"]
        }
        Insert: {
          activity_id: string
          assigned_by_profile_id: string
          created_at?: string
          frequency_note?: string | null
          id?: string
          resident_id: string
          status?: Database["public"]["Enums"]["assignment_status"]
        }
        Update: {
          activity_id?: string
          assigned_by_profile_id?: string
          created_at?: string
          frequency_note?: string | null
          id?: string
          resident_id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "assignments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_assigned_by_profile_id_fkey"
            columns: ["assigned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      event_log: {
        Row: {
          activity_id: string | null
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          practice_id: string
          zone_key: string | null
        }
        Insert: {
          activity_id?: string | null
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          practice_id: string
          zone_key?: string | null
        }
        Update: {
          activity_id?: string | null
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          practice_id?: string
          zone_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_log_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      islands: {
        Row: {
          avatar_config: Json
          created_at: string
          enabled_activity_ids: string[]
          id: string
          layout_config: Json
          name: string
          owner_profile_id: string
          theme_pack_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_config?: Json
          created_at?: string
          enabled_activity_ids?: string[]
          id?: string
          layout_config?: Json
          name: string
          owner_profile_id: string
          theme_pack_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_config?: Json
          created_at?: string
          enabled_activity_ids?: string[]
          id?: string
          layout_config?: Json
          name?: string
          owner_profile_id?: string
          theme_pack_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "islands_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islands_theme_pack_id_fkey"
            columns: ["theme_pack_id"]
            isOneToOne: false
            referencedRelation: "theme_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      practices: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string
          full_name: string | null
          id: string
          practice_id: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          approved?: boolean
          created_at?: string
          full_name?: string | null
          id: string
          practice_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          approved?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          practice_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      residents: {
        Row: {
          age_band: string
          created_at: string
          created_by_profile_id: string
          id: string
          interests: string[]
          practice_id: string
          resident_code: string
          status: Database["public"]["Enums"]["resident_status"]
        }
        Insert: {
          age_band: string
          created_at?: string
          created_by_profile_id: string
          id?: string
          interests?: string[]
          practice_id: string
          resident_code?: string
          status?: Database["public"]["Enums"]["resident_status"]
        }
        Update: {
          age_band?: string
          created_at?: string
          created_by_profile_id?: string
          id?: string
          interests?: string[]
          practice_id?: string
          resident_code?: string
          status?: Database["public"]["Enums"]["resident_status"]
        }
        Relationships: [
          {
            foreignKeyName: "residents_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residents_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_packs: {
        Row: {
          age_band_label: string
          audio_key: string | null
          companion_register: Json
          description: string
          display_name: string
          id: string
          is_available: boolean
          key: string
          palette: Json
          tileset_key: string | null
        }
        Insert: {
          age_band_label: string
          audio_key?: string | null
          companion_register?: Json
          description: string
          display_name: string
          id?: string
          is_available?: boolean
          key: string
          palette?: Json
          tileset_key?: string | null
        }
        Update: {
          age_band_label?: string
          audio_key?: string | null
          companion_register?: Json
          description?: string
          display_name?: string
          id?: string
          is_available?: boolean
          key?: string
          palette?: Json
          tileset_key?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zone_skins: {
        Row: {
          id: string
          skin_description: string
          skin_name: string
          theme_pack_id: string
          zone_id: string
        }
        Insert: {
          id?: string
          skin_description: string
          skin_name: string
          theme_pack_id: string
          zone_id: string
        }
        Update: {
          id?: string
          skin_description?: string
          skin_name?: string
          theme_pack_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zone_skins_theme_pack_id_fkey"
            columns: ["theme_pack_id"]
            isOneToOne: false
            referencedRelation: "theme_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zone_skins_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          description: string
          display_name: string
          id: string
          key: string
          sort_order: number
        }
        Insert: {
          description: string
          display_name: string
          id?: string
          key: string
          sort_order?: number
        }
        Update: {
          description?: string
          display_name?: string
          id?: string
          key?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_practice_id: { Args: never; Returns: string }
      generate_resident_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: never; Returns: boolean }
    }
    Enums: {
      actor_type: "therapist" | "resident" | "system"
      app_role: "admin" | "therapist" | "parent" | "child"
      assignment_status: "assigned" | "completed" | "expired"
      resident_status: "draft" | "active" | "archived"
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
    Enums: {
      actor_type: ["therapist", "resident", "system"],
      app_role: ["admin", "therapist", "parent", "child"],
      assignment_status: ["assigned", "completed", "expired"],
      resident_status: ["draft", "active", "archived"],
    },
  },
} as const
