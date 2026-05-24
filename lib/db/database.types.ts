// Generated database types — DO NOT hand-edit; regenerate instead.
//
// Source: cloud dev project `dultruvperqxtqtbochp` (the prod project does not
// exist yet — see supabase/README.md). Generated via the Supabase MCP
// `generate_typescript_types` rather than `npm run db:types` because that script
// uses `--local`, and the local stack can't run here (no Docker). When Docker is
// available, `npm run db:types` regenerates this file from the local stack.
//
// Reflects migrations P0-5..P0-13 + P1-5 (19 MVP tables, 17 enums, RLS helper
// fns + create_household RPC).
// After regenerating, run `npm run format` so the output matches Prettier.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      dish_ingredients: {
        Row: {
          created_at: string;
          dish_id: string;
          id: string;
          ingredient_id: string;
          is_optional: boolean;
          is_required: boolean;
          quantity_per_serving: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dish_id: string;
          id?: string;
          ingredient_id: string;
          is_optional?: boolean;
          is_required?: boolean;
          quantity_per_serving: number;
          unit: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dish_id?: string;
          id?: string;
          ingredient_id?: string;
          is_optional?: boolean;
          is_required?: boolean;
          quantity_per_serving?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dish_ingredients_dish_id_fkey";
            columns: ["dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dish_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      dish_pairings: {
        Row: {
          created_at: string;
          id: string;
          paired_dish_id: string;
          pairing_type: Database["public"]["Enums"]["pairing_type"];
          primary_dish_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          paired_dish_id: string;
          pairing_type: Database["public"]["Enums"]["pairing_type"];
          primary_dish_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          paired_dish_id?: string;
          pairing_type?: Database["public"]["Enums"]["pairing_type"];
          primary_dish_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dish_pairings_paired_dish_id_fkey";
            columns: ["paired_dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dish_pairings_primary_dish_id_fkey";
            columns: ["primary_dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
        ];
      };
      dish_prep_tasks: {
        Row: {
          created_at: string;
          description: string | null;
          dish_id: string;
          id: string;
          required_before_minutes: number;
          task_name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          dish_id: string;
          id?: string;
          required_before_minutes: number;
          task_name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          dish_id?: string;
          id?: string;
          required_before_minutes?: number;
          task_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dish_prep_tasks_dish_id_fkey";
            columns: ["dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
        ];
      };
      dishes: {
        Row: {
          batch_cook_friendly: boolean;
          cook_time_minutes: number;
          created_at: string;
          cuisine: string | null;
          description: string | null;
          diabetic_friendly: boolean;
          diet_type: Database["public"]["Enums"]["diet_type"];
          difficulty: Database["public"]["Enums"]["difficulty_level"];
          high_protein: boolean;
          id: string;
          kid_friendly: boolean;
          leftover_friendly: boolean;
          low_carb: boolean;
          low_sodium: boolean;
          lunchbox_friendly: boolean;
          meal_slots: string[];
          name: string;
          prep_time_minutes: number;
          region: string | null;
          spice_level: Database["public"]["Enums"]["spice_level"];
          status: Database["public"]["Enums"]["dish_status"];
          total_time_minutes: number | null;
          updated_at: string;
        };
        Insert: {
          batch_cook_friendly?: boolean;
          cook_time_minutes?: number;
          created_at?: string;
          cuisine?: string | null;
          description?: string | null;
          diabetic_friendly?: boolean;
          diet_type: Database["public"]["Enums"]["diet_type"];
          difficulty?: Database["public"]["Enums"]["difficulty_level"];
          high_protein?: boolean;
          id?: string;
          kid_friendly?: boolean;
          leftover_friendly?: boolean;
          low_carb?: boolean;
          low_sodium?: boolean;
          lunchbox_friendly?: boolean;
          meal_slots?: string[];
          name: string;
          prep_time_minutes?: number;
          region?: string | null;
          spice_level?: Database["public"]["Enums"]["spice_level"];
          status?: Database["public"]["Enums"]["dish_status"];
          total_time_minutes?: number | null;
          updated_at?: string;
        };
        Update: {
          batch_cook_friendly?: boolean;
          cook_time_minutes?: number;
          created_at?: string;
          cuisine?: string | null;
          description?: string | null;
          diabetic_friendly?: boolean;
          diet_type?: Database["public"]["Enums"]["diet_type"];
          difficulty?: Database["public"]["Enums"]["difficulty_level"];
          high_protein?: boolean;
          id?: string;
          kid_friendly?: boolean;
          leftover_friendly?: boolean;
          low_carb?: boolean;
          low_sodium?: boolean;
          lunchbox_friendly?: boolean;
          meal_slots?: string[];
          name?: string;
          prep_time_minutes?: number;
          region?: string | null;
          spice_level?: Database["public"]["Enums"]["spice_level"];
          status?: Database["public"]["Enums"]["dish_status"];
          total_time_minutes?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      grocery_list_items: {
        Row: {
          category: string;
          checked: boolean;
          created_at: string;
          grocery_list_id: string;
          id: string;
          ingredient_id: string | null;
          name: string;
          quantity: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          checked?: boolean;
          created_at?: string;
          grocery_list_id: string;
          id?: string;
          ingredient_id?: string | null;
          name: string;
          quantity: number;
          unit: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          checked?: boolean;
          created_at?: string;
          grocery_list_id?: string;
          id?: string;
          ingredient_id?: string | null;
          name?: string;
          quantity?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grocery_list_items_grocery_list_id_fkey";
            columns: ["grocery_list_id"];
            isOneToOne: false;
            referencedRelation: "grocery_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grocery_list_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      grocery_lists: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          meal_plan_id: string;
          status: Database["public"]["Enums"]["grocery_list_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          meal_plan_id: string;
          status?: Database["public"]["Enums"]["grocery_list_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          meal_plan_id?: string;
          status?: Database["public"]["Enums"]["grocery_list_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grocery_lists_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grocery_lists_meal_plan_id_fkey";
            columns: ["meal_plan_id"];
            isOneToOne: true;
            referencedRelation: "meal_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      household_activity_events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          event_type: string;
          household_id: string;
          id: string;
          new_value: Json | null;
          old_value: Json | null;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          event_type: string;
          household_id: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          event_type?: string;
          household_id?: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "household_activity_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_activity_events_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_invites: {
        Row: {
          accepted_at: string | null;
          accepted_by_user_id: string | null;
          created_at: string;
          declined_at: string | null;
          expires_at: string;
          household_id: string;
          id: string;
          invite_token: string;
          invited_by_user_id: string;
          invited_email: string | null;
          invited_phone: string | null;
          membership_type: Database["public"]["Enums"]["membership_type"];
          permissions: Json;
          role: Database["public"]["Enums"]["member_role"];
          starts_at: string;
          status: Database["public"]["Enums"]["invite_status"];
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
          created_at?: string;
          declined_at?: string | null;
          expires_at: string;
          household_id: string;
          id?: string;
          invite_token: string;
          invited_by_user_id: string;
          invited_email?: string | null;
          invited_phone?: string | null;
          membership_type?: Database["public"]["Enums"]["membership_type"];
          permissions?: Json;
          role?: Database["public"]["Enums"]["member_role"];
          starts_at?: string;
          status?: Database["public"]["Enums"]["invite_status"];
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
          created_at?: string;
          declined_at?: string | null;
          expires_at?: string;
          household_id?: string;
          id?: string;
          invite_token?: string;
          invited_by_user_id?: string;
          invited_email?: string | null;
          invited_phone?: string | null;
          membership_type?: Database["public"]["Enums"]["membership_type"];
          permissions?: Json;
          role?: Database["public"]["Enums"]["member_role"];
          starts_at?: string;
          status?: Database["public"]["Enums"]["invite_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_invites_accepted_by_user_id_fkey";
            columns: ["accepted_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_invites_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_invites_invited_by_user_id_fkey";
            columns: ["invited_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      household_members: {
        Row: {
          can_change_today_menu: boolean;
          can_change_weekly_schedule: boolean;
          can_edit_household_preferences: boolean;
          can_invite_members: boolean;
          can_manage_grocery_list: boolean;
          can_remove_members: boolean;
          can_suggest_meals: boolean;
          can_view_plan: boolean;
          created_at: string;
          expires_at: string | null;
          household_id: string;
          id: string;
          invited_by_user_id: string | null;
          joined_at: string | null;
          membership_type: Database["public"]["Enums"]["membership_type"];
          role: Database["public"]["Enums"]["member_role"];
          starts_at: string;
          status: Database["public"]["Enums"]["member_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          can_change_today_menu?: boolean;
          can_change_weekly_schedule?: boolean;
          can_edit_household_preferences?: boolean;
          can_invite_members?: boolean;
          can_manage_grocery_list?: boolean;
          can_remove_members?: boolean;
          can_suggest_meals?: boolean;
          can_view_plan?: boolean;
          created_at?: string;
          expires_at?: string | null;
          household_id: string;
          id?: string;
          invited_by_user_id?: string | null;
          joined_at?: string | null;
          membership_type?: Database["public"]["Enums"]["membership_type"];
          role?: Database["public"]["Enums"]["member_role"];
          starts_at?: string;
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          can_change_today_menu?: boolean;
          can_change_weekly_schedule?: boolean;
          can_edit_household_preferences?: boolean;
          can_invite_members?: boolean;
          can_manage_grocery_list?: boolean;
          can_remove_members?: boolean;
          can_suggest_meals?: boolean;
          can_view_plan?: boolean;
          created_at?: string;
          expires_at?: string | null;
          household_id?: string;
          id?: string;
          invited_by_user_id?: string | null;
          joined_at?: string | null;
          membership_type?: Database["public"]["Enums"]["membership_type"];
          role?: Database["public"]["Enums"]["member_role"];
          starts_at?: string;
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_members_invited_by_user_id_fkey";
            columns: ["invited_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      household_preferences: {
        Row: {
          adults_count: number;
          allow_leftovers: boolean;
          budget_preference: Database["public"]["Enums"]["budget_preference"];
          created_at: string;
          diet_type: Database["public"]["Enums"]["diet_type"];
          family_size: number;
          household_id: string;
          id: string;
          kids_count: number;
          meals_to_plan: string[];
          preferred_cuisines: string[];
          spice_level: Database["public"]["Enums"]["spice_level"];
          updated_at: string;
          variety_gap_days: number;
          weekday_cooking_time_minutes: number | null;
          weekend_cooking_time_minutes: number | null;
        };
        Insert: {
          adults_count?: number;
          allow_leftovers?: boolean;
          budget_preference?: Database["public"]["Enums"]["budget_preference"];
          created_at?: string;
          diet_type: Database["public"]["Enums"]["diet_type"];
          family_size: number;
          household_id: string;
          id?: string;
          kids_count?: number;
          meals_to_plan?: string[];
          preferred_cuisines?: string[];
          spice_level?: Database["public"]["Enums"]["spice_level"];
          updated_at?: string;
          variety_gap_days?: number;
          weekday_cooking_time_minutes?: number | null;
          weekend_cooking_time_minutes?: number | null;
        };
        Update: {
          adults_count?: number;
          allow_leftovers?: boolean;
          budget_preference?: Database["public"]["Enums"]["budget_preference"];
          created_at?: string;
          diet_type?: Database["public"]["Enums"]["diet_type"];
          family_size?: number;
          household_id?: string;
          id?: string;
          kids_count?: number;
          meals_to_plan?: string[];
          preferred_cuisines?: string[];
          spice_level?: Database["public"]["Enums"]["spice_level"];
          updated_at?: string;
          variety_gap_days?: number;
          weekday_cooking_time_minutes?: number | null;
          weekend_cooking_time_minutes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "household_preferences_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: true;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_profile_drafts: {
        Row: {
          completion_percentage: number;
          created_at: string;
          current_step: string;
          draft_data: Json;
          household_id: string | null;
          id: string;
          last_saved_at: string;
          status: Database["public"]["Enums"]["draft_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completion_percentage?: number;
          created_at?: string;
          current_step: string;
          draft_data?: Json;
          household_id?: string | null;
          id?: string;
          last_saved_at?: string;
          status?: Database["public"]["Enums"]["draft_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completion_percentage?: number;
          created_at?: string;
          current_step?: string;
          draft_data?: Json;
          household_id?: string | null;
          id?: string;
          last_saved_at?: string;
          status?: Database["public"]["Enums"]["draft_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_profile_drafts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_profile_drafts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          created_by_user_id: string;
          default_location_city: string | null;
          default_location_country: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by_user_id: string;
          default_location_city?: string | null;
          default_location_country?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string;
          default_location_city?: string | null;
          default_location_country?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "households_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredients: {
        Row: {
          allergen_type: string | null;
          category: string;
          common_names: string[];
          created_at: string;
          default_unit: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          allergen_type?: string | null;
          category: string;
          common_names?: string[];
          created_at?: string;
          default_unit: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          allergen_type?: string | null;
          category?: string;
          common_names?: string[];
          created_at?: string;
          default_unit?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      meal_feedback: {
        Row: {
          created_at: string;
          feedback_type: Database["public"]["Enums"]["feedback_type"];
          household_id: string;
          id: string;
          meal_plan_item_id: string;
          reason: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          feedback_type: Database["public"]["Enums"]["feedback_type"];
          household_id: string;
          id?: string;
          meal_plan_item_id: string;
          reason?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          feedback_type?: Database["public"]["Enums"]["feedback_type"];
          household_id?: string;
          id?: string;
          meal_plan_item_id?: string;
          reason?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_feedback_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_feedback_meal_plan_item_id_fkey";
            columns: ["meal_plan_item_id"];
            isOneToOne: false;
            referencedRelation: "meal_plan_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_feedback_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plan_items: {
        Row: {
          changed_by_user_id: string | null;
          created_at: string;
          date: string;
          dish_id: string | null;
          household_id: string;
          id: string;
          locked: boolean;
          meal_plan_id: string;
          meal_slot: Database["public"]["Enums"]["meal_slot"];
          reason: string | null;
          status: Database["public"]["Enums"]["meal_item_status"];
          updated_at: string;
        };
        Insert: {
          changed_by_user_id?: string | null;
          created_at?: string;
          date: string;
          dish_id?: string | null;
          household_id: string;
          id?: string;
          locked?: boolean;
          meal_plan_id: string;
          meal_slot: Database["public"]["Enums"]["meal_slot"];
          reason?: string | null;
          status?: Database["public"]["Enums"]["meal_item_status"];
          updated_at?: string;
        };
        Update: {
          changed_by_user_id?: string | null;
          created_at?: string;
          date?: string;
          dish_id?: string | null;
          household_id?: string;
          id?: string;
          locked?: boolean;
          meal_plan_id?: string;
          meal_slot?: Database["public"]["Enums"]["meal_slot"];
          reason?: string | null;
          status?: Database["public"]["Enums"]["meal_item_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plan_items_changed_by_user_id_fkey";
            columns: ["changed_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_plan_items_dish_id_fkey";
            columns: ["dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_plan_items_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_plan_items_meal_plan_id_fkey";
            columns: ["meal_plan_id"];
            isOneToOne: false;
            referencedRelation: "meal_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plans: {
        Row: {
          created_at: string;
          end_date: string;
          generated_by_user_id: string | null;
          household_id: string;
          id: string;
          start_date: string;
          status: Database["public"]["Enums"]["meal_plan_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          generated_by_user_id?: string | null;
          household_id: string;
          id?: string;
          start_date: string;
          status?: Database["public"]["Enums"]["meal_plan_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          generated_by_user_id?: string | null;
          household_id?: string;
          id?: string;
          start_date?: string;
          status?: Database["public"]["Enums"]["meal_plan_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plans_generated_by_user_id_fkey";
            columns: ["generated_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_plans_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          event_type: string;
          household_id: string;
          id: string;
          message: string;
          read_at: string | null;
          recipient_user_id: string;
          title: string;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type: string;
          household_id: string;
          id?: string;
          message: string;
          read_at?: string | null;
          recipient_user_id: string;
          title: string;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type?: string;
          household_id?: string;
          id?: string;
          message?: string;
          read_at?: string | null;
          recipient_user_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey";
            columns: ["recipient_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_food_preferences: {
        Row: {
          allergies: string[];
          created_at: string;
          diet_type: Database["public"]["Enums"]["diet_type"] | null;
          disliked_dishes: string[];
          disliked_ingredients: string[];
          health_preference_tags: string[];
          household_id: string;
          id: string;
          liked_dishes: string[];
          spice_preference: Database["public"]["Enums"]["spice_level"] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          allergies?: string[];
          created_at?: string;
          diet_type?: Database["public"]["Enums"]["diet_type"] | null;
          disliked_dishes?: string[];
          disliked_ingredients?: string[];
          health_preference_tags?: string[];
          household_id: string;
          id?: string;
          liked_dishes?: string[];
          spice_preference?: Database["public"]["Enums"]["spice_level"] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          allergies?: string[];
          created_at?: string;
          diet_type?: Database["public"]["Enums"]["diet_type"] | null;
          disliked_dishes?: string[];
          disliked_ingredients?: string[];
          health_preference_tags?: string[];
          household_id?: string;
          id?: string;
          liked_dishes?: string[];
          spice_preference?: Database["public"]["Enums"]["spice_level"] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_food_preferences_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_food_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          auth_provider: Database["public"]["Enums"]["auth_provider"];
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          auth_provider?: Database["public"]["Enums"]["auth_provider"];
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          auth_provider?: Database["public"]["Enums"]["auth_provider"];
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_household: { Args: { p_name: string }; Returns: string };
      has_permission: { Args: { h: string; perm: string }; Returns: boolean };
      is_active_member: { Args: { h: string }; Returns: boolean };
    };
    Enums: {
      auth_provider: "google" | "email" | "magic_link";
      budget_preference: "low" | "medium" | "high";
      diet_type:
        | "vegetarian"
        | "vegan"
        | "eggetarian"
        | "non_vegetarian"
        | "jain"
        | "pescatarian";
      difficulty_level: "easy" | "medium" | "hard";
      dish_status: "draft" | "active" | "archived";
      draft_status: "in_progress" | "completed" | "abandoned";
      feedback_type:
        | "liked"
        | "disliked"
        | "too_much_effort"
        | "ingredients_unavailable"
        | "kids_disliked"
        | "do_not_suggest_again"
        | "suggest_more_often";
      grocery_list_status: "draft" | "active" | "archived";
      invite_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled";
      meal_item_status:
        | "suggested"
        | "accepted"
        | "rejected"
        | "replaced"
        | "cooked"
        | "skipped"
        | "eating_out";
      meal_plan_status: "draft" | "active" | "archived";
      meal_slot: "breakfast" | "lunch" | "dinner" | "snack";
      member_role: "owner" | "admin" | "member" | "viewer";
      member_status:
        | "invited"
        | "active"
        | "declined"
        | "expired"
        | "removed"
        | "left";
      membership_type: "permanent" | "temporary_guest";
      pairing_type:
        | "main_side"
        | "rice_pairing"
        | "bread_pairing"
        | "condiment"
        | "beverage";
      spice_level: "mild" | "medium" | "spicy";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      auth_provider: ["google", "email", "magic_link"],
      budget_preference: ["low", "medium", "high"],
      diet_type: [
        "vegetarian",
        "vegan",
        "eggetarian",
        "non_vegetarian",
        "jain",
        "pescatarian",
      ],
      difficulty_level: ["easy", "medium", "hard"],
      dish_status: ["draft", "active", "archived"],
      draft_status: ["in_progress", "completed", "abandoned"],
      feedback_type: [
        "liked",
        "disliked",
        "too_much_effort",
        "ingredients_unavailable",
        "kids_disliked",
        "do_not_suggest_again",
        "suggest_more_often",
      ],
      grocery_list_status: ["draft", "active", "archived"],
      invite_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "cancelled",
      ],
      meal_item_status: [
        "suggested",
        "accepted",
        "rejected",
        "replaced",
        "cooked",
        "skipped",
        "eating_out",
      ],
      meal_plan_status: ["draft", "active", "archived"],
      meal_slot: ["breakfast", "lunch", "dinner", "snack"],
      member_role: ["owner", "admin", "member", "viewer"],
      member_status: [
        "invited",
        "active",
        "declined",
        "expired",
        "removed",
        "left",
      ],
      membership_type: ["permanent", "temporary_guest"],
      pairing_type: [
        "main_side",
        "rice_pairing",
        "bread_pairing",
        "condiment",
        "beverage",
      ],
      spice_level: ["mild", "medium", "spicy"],
    },
  },
} as const;
