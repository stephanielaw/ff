export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      households: {
        Row: {
          id: string;
          user1_id: string;
          user2_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user1_id: string;
          user2_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user1_id?: string;
          user2_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      invite_tokens: {
        Row: {
          id: string;
          token: string;
          household_id: string;
          created_by: string;
          accepted_by: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          token?: string;
          household_id: string;
          created_by: string;
          accepted_by?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          token?: string;
          household_id?: string;
          created_by?: string;
          accepted_by?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      joint_categories: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          is_required_monthly: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          is_active?: boolean;
          is_required_monthly?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          is_active?: boolean;
          is_required_monthly?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      individual_categories: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      category_ratio_history: {
        Row: {
          id: string;
          category_id: string;
          /** 'joint' or 'individual' */
          category_type: string;
          /** User1's share as a decimal, e.g. 0.6 = 60% */
          ratio: number;
          effective_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          category_type: string;
          ratio: number;
          effective_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          category_type?: string;
          ratio?: number;
          effective_date?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      split_ratios: {
        Row: {
          id: string;
          effective_date: string;
          /** user1 (household owner) percentage */
          user1_pct: number;
          /** user2 (invited partner) percentage */
          user2_pct: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          effective_date: string;
          user1_pct?: number;
          user2_pct?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          effective_date?: string;
          user1_pct?: number;
          user2_pct?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      joint_expenses: {
        Row: {
          id: string;
          description: string;
          amount: number;
          category_id: string | null;
          expense_date: string;
          month_year: string;
          paid_by: string;
          entered_by: string;
          is_recurring: boolean;
          is_required_monthly: boolean;
          recurring_parent_id: string | null;
          recurring_override: boolean;
          source: string;
          import_batch_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          description: string;
          amount: number;
          category_id?: string | null;
          expense_date: string;
          month_year: string;
          paid_by: string;
          entered_by: string;
          is_recurring?: boolean;
          is_required_monthly?: boolean;
          recurring_parent_id?: string | null;
          recurring_override?: boolean;
          source?: string;
          import_batch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          description?: string;
          amount?: number;
          category_id?: string | null;
          expense_date?: string;
          month_year?: string;
          paid_by?: string;
          entered_by?: string;
          is_recurring?: boolean;
          is_required_monthly?: boolean;
          recurring_parent_id?: string | null;
          recurring_override?: boolean;
          source?: string;
          import_batch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      individual_expenses: {
        Row: {
          id: string;
          user_id: string;
          description: string;
          amount: number;
          category_id: string | null;
          expense_date: string;
          month_year: string;
          is_visible_to_partner: boolean;
          reclassified_to_joint: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          description: string;
          amount: number;
          category_id?: string | null;
          expense_date: string;
          month_year: string;
          is_visible_to_partner?: boolean;
          reclassified_to_joint?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          description?: string;
          amount?: number;
          category_id?: string | null;
          expense_date?: string;
          month_year?: string;
          is_visible_to_partner?: boolean;
          reclassified_to_joint?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          paid_by: string;
          paid_to: string;
          amount: number;
          payment_date: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          paid_by: string;
          paid_to: string;
          amount: number;
          payment_date: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          paid_by?: string;
          paid_to?: string;
          amount?: number;
          payment_date?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      monthly_income: {
        Row: {
          id: string;
          user_id: string;
          month_year: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          month_year: string;
          amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          month_year?: string;
          amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      savings_goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_amount: number | null;
          allocated_amount: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          target_amount?: number | null;
          allocated_amount?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          target_amount?: number | null;
          allocated_amount?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      savings_transactions: {
        Row: {
          id: string;
          goal_id: string;
          amount: number;
          transaction_type: "deposit" | "withdrawal";
          note: string | null;
          transaction_date: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          goal_id: string;
          amount: number;
          transaction_type: "deposit" | "withdrawal";
          note?: string | null;
          transaction_date: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          goal_id?: string;
          amount?: number;
          transaction_type?: "deposit" | "withdrawal";
          note?: string | null;
          transaction_date?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      savings_allocations: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string | null;
          month_year: string;
          manual_amount: number;
          auto_calculated_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          goal_id?: string | null;
          month_year: string;
          manual_amount?: number;
          auto_calculated_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string | null;
          month_year?: string;
          manual_amount?: number;
          auto_calculated_amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_category_memory: {
        Row: {
          id: string;
          merchant_pattern: string;
          suggested_category_id: string | null;
          suggested_type: string;
          correction_count: number;
          last_updated: string;
        };
        Insert: {
          id?: string;
          merchant_pattern: string;
          suggested_category_id?: string | null;
          suggested_type?: string;
          correction_count?: number;
          last_updated?: string;
        };
        Update: {
          id?: string;
          merchant_pattern?: string;
          suggested_category_id?: string | null;
          suggested_type?: string;
          correction_count?: number;
          last_updated?: string;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          uploaded_by: string | null;
          file_name: string | null;
          row_count: number | null;
          imported_at: string;
        };
        Insert: {
          id?: string;
          uploaded_by?: string | null;
          file_name?: string | null;
          row_count?: number | null;
          imported_at?: string;
        };
        Update: {
          id?: string;
          uploaded_by?: string | null;
          file_name?: string | null;
          row_count?: number | null;
          imported_at?: string;
        };
        Relationships: [];
      };
      forecast_overrides: {
        Row: {
          id: string;
          year: number;
          category_id: string;
          forecasted_amount: number;
          note: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          year: number;
          category_id: string;
          forecasted_amount: number;
          note?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          year?: number;
          category_id?: string;
          forecasted_amount?: number;
          note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_invite_token: {
        Args: { p_token: string };
        Returns: Array<{
          id: string;
          token: string;
          household_id: string;
          created_by: string;
          accepted_by: string | null;
          expires_at: string;
          is_valid: boolean;
        }>;
      };
      get_household_partner_id: {
        Args: { caller_id: string };
        Returns: string | null;
      };
      is_household_member: {
        Args: { hh_id: string; caller_id: string };
        Returns: boolean;
      };
      accept_invite: {
        Args: { p_token: string };
        Returns: { error?: string; success?: boolean };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// Convenience types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Household = Database["public"]["Tables"]["households"]["Row"];
export type InviteToken = Database["public"]["Tables"]["invite_tokens"]["Row"];
export type JointCategory =
  Database["public"]["Tables"]["joint_categories"]["Row"];
export type IndividualCategory =
  Database["public"]["Tables"]["individual_categories"]["Row"];
export type SplitRatio = Database["public"]["Tables"]["split_ratios"]["Row"];
export type JointExpense =
  Database["public"]["Tables"]["joint_expenses"]["Row"];
export type IndividualExpense =
  Database["public"]["Tables"]["individual_expenses"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type MonthlyIncome =
  Database["public"]["Tables"]["monthly_income"]["Row"];
export type SavingsGoal = Database["public"]["Tables"]["savings_goals"]["Row"];
export type SavingsAllocation =
  Database["public"]["Tables"]["savings_allocations"]["Row"];
export type SavingsTransaction =
  Database["public"]["Tables"]["savings_transactions"]["Row"];
export type AiCategoryMemory =
  Database["public"]["Tables"]["ai_category_memory"]["Row"];
export type ImportBatch = Database["public"]["Tables"]["import_batches"]["Row"];
export type ForecastOverride =
  Database["public"]["Tables"]["forecast_overrides"]["Row"];
export type CategoryRatioHistory =
  Database["public"]["Tables"]["category_ratio_history"]["Row"];

export type JointExpenseWithCategory = JointExpense & {
  joint_categories: JointCategory | null;
  payer: Profile | null;
};

export type IndividualExpenseWithCategory = IndividualExpense & {
  individual_categories: IndividualCategory | null;
};

/** The two members of a household, resolved to full profiles. */
export interface HouseholdMembers {
  household: Household;
  user1: Profile;
  /** null if the partner has not yet accepted their invite */
  user2: Profile | null;
}
