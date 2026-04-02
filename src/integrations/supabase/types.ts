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
      alerts: {
        Row: {
          acknowledged: boolean | null
          country_id: string | null
          created_at: string
          id: string
          ipbx_id: string | null
          message: string | null
          source: string | null
          title: string
          type: string
        }
        Insert: {
          acknowledged?: boolean | null
          country_id?: string | null
          created_at?: string
          id?: string
          ipbx_id?: string | null
          message?: string | null
          source?: string | null
          title: string
          type?: string
        }
        Update: {
          acknowledged?: boolean | null
          country_id?: string | null
          created_at?: string
          id?: string
          ipbx_id?: string | null
          message?: string | null
          source?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_ipbx_id_fkey"
            columns: ["ipbx_id"]
            isOneToOne: false
            referencedRelation: "ipbx"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          callee: string
          callee_name: string | null
          caller: string
          caller_name: string | null
          codec: string | null
          created_at: string
          duration: number | null
          ended_at: string | null
          id: string
          ipbx_id: string
          jitter: number | null
          mos: number | null
          started_at: string
          status: string
          trunk_name: string | null
        }
        Insert: {
          callee: string
          callee_name?: string | null
          caller: string
          caller_name?: string | null
          codec?: string | null
          created_at?: string
          duration?: number | null
          ended_at?: string | null
          id?: string
          ipbx_id: string
          jitter?: number | null
          mos?: number | null
          started_at?: string
          status?: string
          trunk_name?: string | null
        }
        Update: {
          callee?: string
          callee_name?: string | null
          caller?: string
          caller_name?: string | null
          codec?: string | null
          created_at?: string
          duration?: number | null
          ended_at?: string | null
          id?: string
          ipbx_id?: string
          jitter?: number | null
          mos?: number | null
          started_at?: string
          status?: string
          trunk_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_ipbx_id_fkey"
            columns: ["ipbx_id"]
            isOneToOne: false
            referencedRelation: "ipbx"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      extensions: {
        Row: {
          calls_today: number | null
          created_at: string
          id: string
          ip_address: string | null
          ipbx_id: string
          last_registration: string | null
          name: string
          number: string
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          calls_today?: number | null
          created_at?: string
          id?: string
          ip_address?: string | null
          ipbx_id: string
          last_registration?: string | null
          name: string
          number: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          calls_today?: number | null
          created_at?: string
          id?: string
          ip_address?: string | null
          ipbx_id?: string
          last_registration?: string | null
          name?: string
          number?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extensions_ipbx_id_fkey"
            columns: ["ipbx_id"]
            isOneToOne: false
            referencedRelation: "ipbx"
            referencedColumns: ["id"]
          },
        ]
      }
      ipbx: {
        Row: {
          ami_password: string | null
          ami_user: string | null
          country_id: string
          created_at: string
          id: string
          ip_address: string
          last_ping: string | null
          name: string
          ping_latency: number | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          ami_password?: string | null
          ami_user?: string | null
          country_id: string
          created_at?: string
          id?: string
          ip_address: string
          last_ping?: string | null
          name: string
          ping_latency?: number | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          ami_password?: string | null
          ami_user?: string | null
          country_id?: string
          created_at?: string
          id?: string
          ip_address?: string
          last_ping?: string | null
          name?: string
          ping_latency?: number | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ipbx_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          force_password_change: boolean
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          force_password_change?: boolean
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          force_password_change?: boolean
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sip_trunks: {
        Row: {
          channels: number | null
          created_at: string
          failed_attempts: number | null
          id: string
          ip_address: string | null
          ipbx_id: string
          last_check: string | null
          latency: number | null
          local_ip: string | null
          max_channels: number | null
          name: string
          provider: string | null
          remote_ip: string | null
          remote_ipbx_id: string | null
          status: string
          updated_at: string
          uptime: number | null
        }
        Insert: {
          channels?: number | null
          created_at?: string
          failed_attempts?: number | null
          id?: string
          ip_address?: string | null
          ipbx_id: string
          last_check?: string | null
          latency?: number | null
          local_ip?: string | null
          max_channels?: number | null
          name: string
          provider?: string | null
          remote_ip?: string | null
          remote_ipbx_id?: string | null
          status?: string
          updated_at?: string
          uptime?: number | null
        }
        Update: {
          channels?: number | null
          created_at?: string
          failed_attempts?: number | null
          id?: string
          ip_address?: string | null
          ipbx_id?: string
          last_check?: string | null
          latency?: number | null
          local_ip?: string | null
          max_channels?: number | null
          name?: string
          provider?: string | null
          remote_ip?: string | null
          remote_ipbx_id?: string | null
          status?: string
          updated_at?: string
          uptime?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sip_trunks_ipbx_id_fkey"
            columns: ["ipbx_id"]
            isOneToOne: false
            referencedRelation: "ipbx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sip_trunks_remote_ipbx_id_fkey"
            columns: ["remote_ipbx_id"]
            isOneToOne: false
            referencedRelation: "ipbx"
            referencedColumns: ["id"]
          },
        ]
      }
      user_countries: {
        Row: {
          country_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_countries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ipbx: {
        Row: {
          created_at: string
          id: string
          ipbx_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ipbx_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ipbx_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ipbx_ipbx_id_fkey"
            columns: ["ipbx_id"]
            isOneToOne: false
            referencedRelation: "ipbx"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          user_id?: string
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
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      user_can_access_country: {
        Args: { _country_id: string }
        Returns: boolean
      }
      user_can_access_ipbx: { Args: { _ipbx_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
