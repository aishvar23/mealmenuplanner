// Generated database types — DO NOT hand-edit; regenerate instead.
//
// Source: cloud dev project `dultruvperqxtqtbochp` (the prod project does not
// exist yet — see supabase/README.md). Generated via the Supabase MCP
// `generate_typescript_types` rather than `npm run db:types` because that script
// uses `--local`, and the local stack can't run here (no Docker). When Docker is
// available, `npm run db:types` regenerates this file from the local stack.
//
// Reflects migrations P0-5..P0-13 + P1-5 + P1-8 + P2-6 + P2-7 + P4-1 + P6-2/3 +
// P6-5/8 + P6-9 + P7-1/3 + P7-6 + P9 image metadata + P10 meal combinations
// (meal_combinations, meal_combination_items, household_dish_preferences,
// household_dish_accompaniments tables; combination_status + meal_frequency enums;
// increment_combination_popularity / increment_dish_popularity /
// propose_meal_combination RPCs + complete_onboarding combination-prefs param) +
// P10-8 household_dish_preferences.suitable_meal_slots + P9
// notification_email_preferences (per-user email opt-ins) +
// get_event_email_recipients RPC + M3 device/event push tokens + P11 dish
// nutrition + P12 dish weight-loss flag + PMP-1/2/7(+7b) Meal Provider
// Workspace tenancy (provider_organizations, provider_memberships,
// provider_invites, provider_subscriptions tables; provider_membership_role/status
// + the other provider_* enums; is_active_provider_member / is_provider_owner /
// can_view_provider_identity RLS helpers) + PMP-0 (MP-A-015) workspace pointer
// (user_active_workspace table + set_active_workspace RPC).
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
      device_tokens: {
        Row: {
          created_at: string;
          id: string;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          platform: string;
          token: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
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
          calories_kcal: number | null;
          carbs_g: number | null;
          cook_time_minutes: number;
          created_at: string;
          cuisine: string | null;
          description: string | null;
          diabetic_friendly: boolean;
          diet_type: Database["public"]["Enums"]["diet_type"];
          difficulty: Database["public"]["Enums"]["difficulty_level"];
          fat_g: number | null;
          glycemic_index: number | null;
          high_protein: boolean;
          id: string;
          image_alt_text: string | null;
          image_status: Database["public"]["Enums"]["image_status"];
          image_url: string | null;
          image_verified: boolean;
          kid_friendly: boolean;
          leftover_friendly: boolean;
          low_carb: boolean;
          low_sodium: boolean;
          lunchbox_friendly: boolean;
          meal_role: Database["public"]["Enums"]["meal_role"];
          meal_slots: string[];
          name: string;
          popularity_count: number;
          prep_time_minutes: number;
          protein_g: number | null;
          region: string | null;
          serving_qty: number | null;
          serving_unit: Database["public"]["Enums"]["serving_unit"] | null;
          spice_level: Database["public"]["Enums"]["spice_level"];
          status: Database["public"]["Enums"]["dish_status"];
          total_time_minutes: number | null;
          updated_at: string;
          weight_loss: boolean;
        };
        Insert: {
          batch_cook_friendly?: boolean;
          calories_kcal?: number | null;
          carbs_g?: number | null;
          cook_time_minutes?: number;
          created_at?: string;
          cuisine?: string | null;
          description?: string | null;
          diabetic_friendly?: boolean;
          diet_type: Database["public"]["Enums"]["diet_type"];
          difficulty?: Database["public"]["Enums"]["difficulty_level"];
          fat_g?: number | null;
          glycemic_index?: number | null;
          high_protein?: boolean;
          id?: string;
          image_alt_text?: string | null;
          image_status?: Database["public"]["Enums"]["image_status"];
          image_url?: string | null;
          image_verified?: boolean;
          kid_friendly?: boolean;
          leftover_friendly?: boolean;
          low_carb?: boolean;
          low_sodium?: boolean;
          lunchbox_friendly?: boolean;
          meal_role?: Database["public"]["Enums"]["meal_role"];
          meal_slots?: string[];
          name: string;
          popularity_count?: number;
          prep_time_minutes?: number;
          protein_g?: number | null;
          region?: string | null;
          serving_qty?: number | null;
          serving_unit?: Database["public"]["Enums"]["serving_unit"] | null;
          spice_level?: Database["public"]["Enums"]["spice_level"];
          status?: Database["public"]["Enums"]["dish_status"];
          total_time_minutes?: number | null;
          updated_at?: string;
          weight_loss?: boolean;
        };
        Update: {
          batch_cook_friendly?: boolean;
          calories_kcal?: number | null;
          carbs_g?: number | null;
          cook_time_minutes?: number;
          created_at?: string;
          cuisine?: string | null;
          description?: string | null;
          diabetic_friendly?: boolean;
          diet_type?: Database["public"]["Enums"]["diet_type"];
          difficulty?: Database["public"]["Enums"]["difficulty_level"];
          fat_g?: number | null;
          glycemic_index?: number | null;
          high_protein?: boolean;
          id?: string;
          image_alt_text?: string | null;
          image_status?: Database["public"]["Enums"]["image_status"];
          image_url?: string | null;
          image_verified?: boolean;
          kid_friendly?: boolean;
          leftover_friendly?: boolean;
          low_carb?: boolean;
          low_sodium?: boolean;
          lunchbox_friendly?: boolean;
          meal_role?: Database["public"]["Enums"]["meal_role"];
          meal_slots?: string[];
          name?: string;
          popularity_count?: number;
          prep_time_minutes?: number;
          protein_g?: number | null;
          region?: string | null;
          serving_qty?: number | null;
          serving_unit?: Database["public"]["Enums"]["serving_unit"] | null;
          spice_level?: Database["public"]["Enums"]["spice_level"];
          status?: Database["public"]["Enums"]["dish_status"];
          total_time_minutes?: number | null;
          updated_at?: string;
          weight_loss?: boolean;
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
      household_dish_accompaniments: {
        Row: {
          accompaniment_dish_id: string;
          created_at: string;
          dish_id: string;
          household_id: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          accompaniment_dish_id: string;
          created_at?: string;
          dish_id: string;
          household_id: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          accompaniment_dish_id?: string;
          created_at?: string;
          dish_id?: string;
          household_id?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_dish_accompaniments_accompaniment_dish_id_fkey";
            columns: ["accompaniment_dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_dish_accompaniments_dish_id_fkey";
            columns: ["dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_dish_accompaniments_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_dish_preferences: {
        Row: {
          created_at: string;
          dish_id: string;
          frequency: Database["public"]["Enums"]["meal_frequency"];
          household_id: string;
          id: string;
          suitable_meal_slots: string[];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dish_id: string;
          frequency?: Database["public"]["Enums"]["meal_frequency"];
          household_id: string;
          id?: string;
          suitable_meal_slots?: string[];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dish_id?: string;
          frequency?: Database["public"]["Enums"]["meal_frequency"];
          household_id?: string;
          id?: string;
          suitable_meal_slots?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_dish_preferences_dish_id_fkey";
            columns: ["dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_dish_preferences_household_id_fkey";
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
          diet_type: Database["public"]["Enums"]["diet_type"] | null;
          diet_types: Database["public"]["Enums"]["diet_type"][];
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
          diet_type?: Database["public"]["Enums"]["diet_type"] | null;
          diet_types?: Database["public"]["Enums"]["diet_type"][];
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
          diet_type?: Database["public"]["Enums"]["diet_type"] | null;
          diet_types?: Database["public"]["Enums"]["diet_type"][];
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
      idempotency_keys: {
        Row: {
          created_at: string;
          endpoint: string;
          expires_at: string;
          household_id: string;
          id: string;
          idempotency_key: string;
          request_hash: string;
          response_body: Json;
          response_status: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          expires_at?: string;
          household_id: string;
          id?: string;
          idempotency_key: string;
          request_hash: string;
          response_body: Json;
          response_status: number;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          expires_at?: string;
          household_id?: string;
          id?: string;
          idempotency_key?: string;
          request_hash?: string;
          response_body?: Json;
          response_status?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "idempotency_keys_user_id_fkey";
            columns: ["user_id"];
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
          image_alt_text: string | null;
          image_status: Database["public"]["Enums"]["image_status"];
          image_url: string | null;
          image_verified: boolean;
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
          image_alt_text?: string | null;
          image_status?: Database["public"]["Enums"]["image_status"];
          image_url?: string | null;
          image_verified?: boolean;
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
          image_alt_text?: string | null;
          image_status?: Database["public"]["Enums"]["image_status"];
          image_url?: string | null;
          image_verified?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      meal_combination_items: {
        Row: {
          combination_id: string;
          created_at: string;
          dish_id: string;
          id: string;
          role_in_combo: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          combination_id: string;
          created_at?: string;
          dish_id: string;
          id?: string;
          role_in_combo?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          combination_id?: string;
          created_at?: string;
          dish_id?: string;
          id?: string;
          role_in_combo?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_combination_items_combination_id_fkey";
            columns: ["combination_id"];
            isOneToOne: false;
            referencedRelation: "meal_combinations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_combination_items_dish_id_fkey";
            columns: ["dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_combinations: {
        Row: {
          created_at: string;
          cuisine: string | null;
          description: string | null;
          diet_type: Database["public"]["Enums"]["diet_type"];
          id: string;
          name: string;
          popularity_count: number;
          proposed_by_household_id: string | null;
          proposed_by_user_id: string | null;
          region: string | null;
          source: string;
          status: Database["public"]["Enums"]["combination_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          cuisine?: string | null;
          description?: string | null;
          diet_type: Database["public"]["Enums"]["diet_type"];
          id?: string;
          name: string;
          popularity_count?: number;
          proposed_by_household_id?: string | null;
          proposed_by_user_id?: string | null;
          region?: string | null;
          source?: string;
          status?: Database["public"]["Enums"]["combination_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          cuisine?: string | null;
          description?: string | null;
          diet_type?: Database["public"]["Enums"]["diet_type"];
          id?: string;
          name?: string;
          popularity_count?: number;
          proposed_by_household_id?: string | null;
          proposed_by_user_id?: string | null;
          region?: string | null;
          source?: string;
          status?: Database["public"]["Enums"]["combination_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_combinations_proposed_by_household_id_fkey";
            columns: ["proposed_by_household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_combinations_proposed_by_user_id_fkey";
            columns: ["proposed_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
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
          eating_out_note: string | null;
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
          eating_out_note?: string | null;
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
          eating_out_note?: string | null;
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
      notification_email_preferences: {
        Row: {
          created_at: string;
          enabled: boolean;
          event_category: string;
          household_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          event_category: string;
          household_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          event_category?: string;
          household_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_email_preferences_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_email_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
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
      provider_catalog_items: {
        Row: {
          allergy_warning: string | null;
          canonical_unit: string;
          component_group: Database["public"]["Enums"]["provider_component_group"];
          created_at: string;
          default_quantity: number;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          provider_id: string;
          source_dish_id: string | null;
          supports_salt_level: boolean;
          supports_spice_level: boolean;
          updated_at: string;
        };
        Insert: {
          allergy_warning?: string | null;
          canonical_unit: string;
          component_group: Database["public"]["Enums"]["provider_component_group"];
          created_at?: string;
          default_quantity: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          provider_id: string;
          source_dish_id?: string | null;
          supports_salt_level?: boolean;
          supports_spice_level?: boolean;
          updated_at?: string;
        };
        Update: {
          allergy_warning?: string | null;
          canonical_unit?: string;
          component_group?: Database["public"]["Enums"]["provider_component_group"];
          created_at?: string;
          default_quantity?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          provider_id?: string;
          source_dish_id?: string | null;
          supports_salt_level?: boolean;
          supports_spice_level?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_catalog_items_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_catalog_items_source_dish_id_fkey";
            columns: ["source_dish_id"];
            isOneToOne: false;
            referencedRelation: "dishes";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_invites: {
        Row: {
          accepted_at: string | null;
          accepted_by_user_id: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          invited_by_user_id: string;
          invited_email: string | null;
          invited_phone: string | null;
          provider_id: string;
          status: string;
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          invited_by_user_id: string;
          invited_email?: string | null;
          invited_phone?: string | null;
          provider_id: string;
          status: string;
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invited_by_user_id?: string;
          invited_email?: string | null;
          invited_phone?: string | null;
          provider_id?: string;
          status?: string;
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_invites_accepted_by_user_id_fkey";
            columns: ["accepted_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_invites_invited_by_user_id_fkey";
            columns: ["invited_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_invites_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_memberships: {
        Row: {
          allergy_ack_at: string | null;
          approved_at: string | null;
          approved_by_user_id: string | null;
          created_at: string;
          default_spice_level:
            | Database["public"]["Enums"]["provider_spice_level"]
            | null;
          id: string;
          invited_by_user_id: string | null;
          joined_at: string | null;
          member_display_name: string | null;
          member_phone: string | null;
          onboarding_completed_at: string | null;
          provider_id: string;
          removed_at: string | null;
          role: Database["public"]["Enums"]["provider_membership_role"];
          status: Database["public"]["Enums"]["provider_membership_status"];
          terms_ack_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          allergy_ack_at?: string | null;
          approved_at?: string | null;
          approved_by_user_id?: string | null;
          created_at?: string;
          default_spice_level?:
            | Database["public"]["Enums"]["provider_spice_level"]
            | null;
          id?: string;
          invited_by_user_id?: string | null;
          joined_at?: string | null;
          member_display_name?: string | null;
          member_phone?: string | null;
          onboarding_completed_at?: string | null;
          provider_id: string;
          removed_at?: string | null;
          role: Database["public"]["Enums"]["provider_membership_role"];
          status: Database["public"]["Enums"]["provider_membership_status"];
          terms_ack_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          allergy_ack_at?: string | null;
          approved_at?: string | null;
          approved_by_user_id?: string | null;
          created_at?: string;
          default_spice_level?:
            | Database["public"]["Enums"]["provider_spice_level"]
            | null;
          id?: string;
          invited_by_user_id?: string | null;
          joined_at?: string | null;
          member_display_name?: string | null;
          member_phone?: string | null;
          onboarding_completed_at?: string | null;
          provider_id?: string;
          removed_at?: string | null;
          role?: Database["public"]["Enums"]["provider_membership_role"];
          status?: Database["public"]["Enums"]["provider_membership_status"];
          terms_ack_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_memberships_approved_by_user_id_fkey";
            columns: ["approved_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_memberships_invited_by_user_id_fkey";
            columns: ["invited_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_memberships_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_organizations: {
        Row: {
          city: string | null;
          country: string | null;
          created_at: string;
          default_cutoff_local_time: string | null;
          email: string | null;
          id: string;
          name: string;
          owner_user_id: string;
          phone: string | null;
          state: string | null;
          status: string;
          summary_email_recipients: string[];
          timezone: string;
          updated_at: string;
        };
        Insert: {
          city?: string | null;
          country?: string | null;
          created_at?: string;
          default_cutoff_local_time?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          owner_user_id: string;
          phone?: string | null;
          state?: string | null;
          status: string;
          summary_email_recipients?: string[];
          timezone: string;
          updated_at?: string;
        };
        Update: {
          city?: string | null;
          country?: string | null;
          created_at?: string;
          default_cutoff_local_time?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          owner_user_id?: string;
          phone?: string | null;
          state?: string | null;
          status?: string;
          summary_email_recipients?: string[];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_organizations_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_subscriptions: {
        Row: {
          auto_accept_consented_at: string | null;
          auto_accept_enabled: boolean;
          created_at: string;
          customer_user_id: string;
          id: string;
          provider_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          auto_accept_consented_at?: string | null;
          auto_accept_enabled?: boolean;
          created_at?: string;
          customer_user_id: string;
          id?: string;
          provider_id: string;
          status: string;
          updated_at?: string;
        };
        Update: {
          auto_accept_consented_at?: string | null;
          auto_accept_enabled?: boolean;
          created_at?: string;
          customer_user_id?: string;
          id?: string;
          provider_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_subscriptions_customer_user_id_fkey";
            columns: ["customer_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_subscriptions_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_weekly_menus: {
        Row: {
          created_at: string;
          created_by_user_id: string;
          id: string;
          provider_id: string;
          published_at: string | null;
          status: Database["public"]["Enums"]["provider_menu_status"];
          updated_at: string;
          week_end_date: string;
          week_start_date: string;
        };
        Insert: {
          created_at?: string;
          created_by_user_id: string;
          id?: string;
          provider_id: string;
          published_at?: string | null;
          status?: Database["public"]["Enums"]["provider_menu_status"];
          updated_at?: string;
          week_end_date: string;
          week_start_date: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string;
          id?: string;
          provider_id?: string;
          published_at?: string | null;
          status?: Database["public"]["Enums"]["provider_menu_status"];
          updated_at?: string;
          week_end_date?: string;
          week_start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_weekly_menus_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_weekly_menus_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_menu_days: {
        Row: {
          created_at: string;
          cutoff_at: string;
          cutoff_failure_count: number;
          cutoff_last_error: string | null;
          id: string;
          locked_at: string | null;
          menu_date: string;
          note: string | null;
          provider_id: string;
          published_at: string | null;
          status: Database["public"]["Enums"]["provider_menu_status"];
          updated_at: string;
          weekly_menu_id: string;
        };
        Insert: {
          created_at?: string;
          cutoff_at: string;
          cutoff_failure_count?: number;
          cutoff_last_error?: string | null;
          id?: string;
          locked_at?: string | null;
          menu_date: string;
          note?: string | null;
          provider_id: string;
          published_at?: string | null;
          status?: Database["public"]["Enums"]["provider_menu_status"];
          updated_at?: string;
          weekly_menu_id: string;
        };
        Update: {
          created_at?: string;
          cutoff_at?: string;
          cutoff_failure_count?: number;
          cutoff_last_error?: string | null;
          id?: string;
          locked_at?: string | null;
          menu_date?: string;
          note?: string | null;
          provider_id?: string;
          published_at?: string | null;
          status?: Database["public"]["Enums"]["provider_menu_status"];
          updated_at?: string;
          weekly_menu_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_menu_days_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_menu_days_weekly_menu_id_fkey";
            columns: ["weekly_menu_id"];
            isOneToOne: false;
            referencedRelation: "provider_weekly_menus";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_menu_components: {
        Row: {
          canonical_unit: string;
          component_group: Database["public"]["Enums"]["provider_component_group"];
          created_at: string;
          default_catalog_item_id: string;
          default_item_name: string;
          default_quantity: number;
          id: string;
          is_required: boolean;
          menu_day_id: string;
          sort_order: number;
          supports_salt_level: boolean;
          supports_spice_level: boolean;
          updated_at: string;
        };
        Insert: {
          canonical_unit: string;
          component_group: Database["public"]["Enums"]["provider_component_group"];
          created_at?: string;
          default_catalog_item_id: string;
          default_item_name: string;
          default_quantity: number;
          id?: string;
          is_required?: boolean;
          menu_day_id: string;
          sort_order?: number;
          supports_salt_level?: boolean;
          supports_spice_level?: boolean;
          updated_at?: string;
        };
        Update: {
          canonical_unit?: string;
          component_group?: Database["public"]["Enums"]["provider_component_group"];
          created_at?: string;
          default_catalog_item_id?: string;
          default_item_name?: string;
          default_quantity?: number;
          id?: string;
          is_required?: boolean;
          menu_day_id?: string;
          sort_order?: number;
          supports_salt_level?: boolean;
          supports_spice_level?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_menu_components_default_catalog_item_id_fkey";
            columns: ["default_catalog_item_id"];
            isOneToOne: false;
            referencedRelation: "provider_catalog_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_menu_components_menu_day_id_fkey";
            columns: ["menu_day_id"];
            isOneToOne: false;
            referencedRelation: "provider_menu_days";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_menu_alternatives: {
        Row: {
          canonical_unit: string;
          catalog_item_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          item_name: string;
          menu_component_id: string;
          quantity: number;
          updated_at: string;
        };
        Insert: {
          canonical_unit: string;
          catalog_item_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          item_name: string;
          menu_component_id: string;
          quantity: number;
          updated_at?: string;
        };
        Update: {
          canonical_unit?: string;
          catalog_item_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          item_name?: string;
          menu_component_id?: string;
          quantity?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_menu_alternatives_catalog_item_id_fkey";
            columns: ["catalog_item_id"];
            isOneToOne: false;
            referencedRelation: "provider_catalog_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_menu_alternatives_menu_component_id_fkey";
            columns: ["menu_component_id"];
            isOneToOne: false;
            referencedRelation: "provider_menu_components";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_customization_groups: {
        Row: {
          created_at: string;
          customization_type: Database["public"]["Enums"]["provider_customization_type"];
          id: string;
          included_in_price: boolean;
          is_required: boolean;
          maximum_selections: number | null;
          menu_component_id: string;
          minimum_selections: number;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          customization_type: Database["public"]["Enums"]["provider_customization_type"];
          id?: string;
          included_in_price?: boolean;
          is_required?: boolean;
          maximum_selections?: number | null;
          menu_component_id: string;
          minimum_selections?: number;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customization_type?: Database["public"]["Enums"]["provider_customization_type"];
          id?: string;
          included_in_price?: boolean;
          is_required?: boolean;
          maximum_selections?: number | null;
          menu_component_id?: string;
          minimum_selections?: number;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_customization_groups_menu_component_id_fkey";
            columns: ["menu_component_id"];
            isOneToOne: false;
            referencedRelation: "provider_menu_components";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_customization_options: {
        Row: {
          canonical_unit: string | null;
          code: string;
          created_at: string;
          customization_group_id: string;
          external_price_label: string | null;
          id: string;
          is_active: boolean;
          label: string;
          maximum_quantity: number | null;
          minimum_quantity: number | null;
          quantity_delta: number | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          canonical_unit?: string | null;
          code: string;
          created_at?: string;
          customization_group_id: string;
          external_price_label?: string | null;
          id?: string;
          is_active?: boolean;
          label: string;
          maximum_quantity?: number | null;
          minimum_quantity?: number | null;
          quantity_delta?: number | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          canonical_unit?: string | null;
          code?: string;
          created_at?: string;
          customization_group_id?: string;
          external_price_label?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string;
          maximum_quantity?: number | null;
          minimum_quantity?: number | null;
          quantity_delta?: number | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_customization_options_customization_group_id_fkey";
            columns: ["customization_group_id"];
            isOneToOne: false;
            referencedRelation: "provider_customization_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_member_responses: {
        Row: {
          auto_accepted: boolean;
          cancelled_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          id: string;
          locked_at: string | null;
          member_note: string | null;
          member_user_id: string;
          menu_day_id: string;
          provider_id: string;
          provider_overridden: boolean;
          provider_override_reason: string | null;
          status: Database["public"]["Enums"]["provider_response_status"];
          updated_at: string;
          version: number;
        };
        Insert: {
          auto_accepted?: boolean;
          cancelled_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          id?: string;
          locked_at?: string | null;
          member_note?: string | null;
          member_user_id: string;
          menu_day_id: string;
          provider_id: string;
          provider_overridden?: boolean;
          provider_override_reason?: string | null;
          status?: Database["public"]["Enums"]["provider_response_status"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          auto_accepted?: boolean;
          cancelled_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          id?: string;
          locked_at?: string | null;
          member_note?: string | null;
          member_user_id?: string;
          menu_day_id?: string;
          provider_id?: string;
          provider_overridden?: boolean;
          provider_override_reason?: string | null;
          status?: Database["public"]["Enums"]["provider_response_status"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "provider_member_responses_member_user_id_fkey";
            columns: ["member_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_member_responses_menu_day_id_fkey";
            columns: ["menu_day_id"];
            isOneToOne: false;
            referencedRelation: "provider_menu_days";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_member_responses_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_member_response_items: {
        Row: {
          canonical_unit: string;
          created_at: string;
          id: string;
          menu_component_id: string;
          quantity: number;
          response_id: string;
          salt_level: Database["public"]["Enums"]["provider_salt_level"] | null;
          selected_catalog_item_id: string;
          spice_level:
            | Database["public"]["Enums"]["provider_spice_level"]
            | null;
          updated_at: string;
        };
        Insert: {
          canonical_unit: string;
          created_at?: string;
          id?: string;
          menu_component_id: string;
          quantity: number;
          response_id: string;
          salt_level?:
            | Database["public"]["Enums"]["provider_salt_level"]
            | null;
          selected_catalog_item_id: string;
          spice_level?:
            | Database["public"]["Enums"]["provider_spice_level"]
            | null;
          updated_at?: string;
        };
        Update: {
          canonical_unit?: string;
          created_at?: string;
          id?: string;
          menu_component_id?: string;
          quantity?: number;
          response_id?: string;
          salt_level?:
            | Database["public"]["Enums"]["provider_salt_level"]
            | null;
          selected_catalog_item_id?: string;
          spice_level?:
            | Database["public"]["Enums"]["provider_spice_level"]
            | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_member_response_items_menu_component_id_fkey";
            columns: ["menu_component_id"];
            isOneToOne: false;
            referencedRelation: "provider_menu_components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_member_response_items_response_id_fkey";
            columns: ["response_id"];
            isOneToOne: false;
            referencedRelation: "provider_member_responses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_member_response_items_selected_catalog_item_id_fkey";
            columns: ["selected_catalog_item_id"];
            isOneToOne: false;
            referencedRelation: "provider_catalog_items";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_member_response_customizations: {
        Row: {
          created_at: string;
          customization_option_id: string;
          id: string;
          quantity: number | null;
          response_item_id: string;
        };
        Insert: {
          created_at?: string;
          customization_option_id: string;
          id?: string;
          quantity?: number | null;
          response_item_id: string;
        };
        Update: {
          created_at?: string;
          customization_option_id?: string;
          id?: string;
          quantity?: number | null;
          response_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_member_response_customiza_customization_option_id_fkey";
            columns: ["customization_option_id"];
            isOneToOne: false;
            referencedRelation: "provider_customization_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_member_response_customizations_response_item_id_fkey";
            columns: ["response_item_id"];
            isOneToOne: false;
            referencedRelation: "provider_member_response_items";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_meal_suggestions: {
        Row: {
          created_at: string;
          id: string;
          member_user_id: string;
          menu_day_id: string;
          provider_id: string;
          provider_response: string | null;
          status: Database["public"]["Enums"]["provider_suggestion_status"];
          suggestion_text: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          member_user_id: string;
          menu_day_id: string;
          provider_id: string;
          provider_response?: string | null;
          status?: Database["public"]["Enums"]["provider_suggestion_status"];
          suggestion_text: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          member_user_id?: string;
          menu_day_id?: string;
          provider_id?: string;
          provider_response?: string | null;
          status?: Database["public"]["Enums"]["provider_suggestion_status"];
          suggestion_text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_meal_suggestions_member_user_id_fkey";
            columns: ["member_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_meal_suggestions_menu_day_id_fkey";
            columns: ["menu_day_id"];
            isOneToOne: false;
            referencedRelation: "provider_menu_days";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_meal_suggestions_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_preparation_batches: {
        Row: {
          created_at: string;
          email_status: string | null;
          generated_at: string;
          id: string;
          menu_day_id: string;
          provider_id: string;
          revision: number;
          source_response_watermark: string | null;
          status: string;
          total_auto_accepted: number;
          total_cancelled: number;
          total_confirmed: number;
          total_no_response: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email_status?: string | null;
          generated_at?: string;
          id?: string;
          menu_day_id: string;
          provider_id: string;
          revision: number;
          source_response_watermark?: string | null;
          status: string;
          total_auto_accepted?: number;
          total_cancelled?: number;
          total_confirmed?: number;
          total_no_response?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email_status?: string | null;
          generated_at?: string;
          id?: string;
          menu_day_id?: string;
          provider_id?: string;
          revision?: number;
          source_response_watermark?: string | null;
          status?: string;
          total_auto_accepted?: number;
          total_cancelled?: number;
          total_confirmed?: number;
          total_no_response?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_preparation_batches_menu_day_id_fkey";
            columns: ["menu_day_id"];
            isOneToOne: false;
            referencedRelation: "provider_menu_days";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_preparation_batches_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_preparation_batch_lines: {
        Row: {
          batch_id: string;
          canonical_unit: string;
          catalog_item_id: string;
          created_at: string;
          extra_quantity: number;
          id: string;
          included_quantity: number;
          salt_level: Database["public"]["Enums"]["provider_salt_level"] | null;
          spice_level:
            | Database["public"]["Enums"]["provider_spice_level"]
            | null;
          total_quantity: number;
        };
        Insert: {
          batch_id: string;
          canonical_unit: string;
          catalog_item_id: string;
          created_at?: string;
          extra_quantity?: number;
          id?: string;
          included_quantity?: number;
          salt_level?:
            | Database["public"]["Enums"]["provider_salt_level"]
            | null;
          spice_level?:
            | Database["public"]["Enums"]["provider_spice_level"]
            | null;
          total_quantity: number;
        };
        Update: {
          batch_id?: string;
          canonical_unit?: string;
          catalog_item_id?: string;
          created_at?: string;
          extra_quantity?: number;
          id?: string;
          included_quantity?: number;
          salt_level?:
            | Database["public"]["Enums"]["provider_salt_level"]
            | null;
          spice_level?:
            | Database["public"]["Enums"]["provider_spice_level"]
            | null;
          total_quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "provider_preparation_batch_lines_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "provider_preparation_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_preparation_batch_lines_catalog_item_id_fkey";
            columns: ["catalog_item_id"];
            isOneToOne: false;
            referencedRelation: "provider_catalog_items";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_activity_events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          event_type: string;
          id: string;
          new_value: Json | null;
          old_value: Json | null;
          provider_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          event_type: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          provider_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          event_type?: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          provider_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_activity_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_activity_events_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_notifications: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          message: string;
          provider_id: string;
          read_at: string | null;
          recipient_user_id: string;
          title: string;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          message: string;
          provider_id: string;
          read_at?: string | null;
          recipient_user_id: string;
          title: string;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          message?: string;
          provider_id?: string;
          read_at?: string | null;
          recipient_user_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_notifications_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_notifications_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "provider_organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_notifications_recipient_user_id_fkey";
            columns: ["recipient_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_active_workspace: {
        Row: {
          updated_at: string;
          user_id: string;
          workspace_id: string;
          workspace_type: string;
        };
        Insert: {
          updated_at?: string;
          user_id: string;
          workspace_id: string;
          workspace_type: string;
        };
        Update: {
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
          workspace_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_active_workspace_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
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
          active_household_id: string | null;
          auth_provider: Database["public"]["Enums"]["auth_provider"];
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
          phone: string | null;
          preferred_household_id: string | null;
          updated_at: string;
        };
        Insert: {
          active_household_id?: string | null;
          auth_provider?: Database["public"]["Enums"]["auth_provider"];
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
          phone?: string | null;
          preferred_household_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active_household_id?: string | null;
          auth_provider?: Database["public"]["Enums"]["auth_provider"];
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string;
          id?: string;
          phone?: string | null;
          preferred_household_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_active_household_id_fkey";
            columns: ["active_household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "users_preferred_household_id_fkey";
            columns: ["preferred_household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      provider_of_menu_day: { Args: { d: string }; Returns: string };
      can_read_provider_menu_day: { Args: { d: string }; Returns: boolean };
      provider_of_menu_component: { Args: { c: string }; Returns: string };
      can_read_provider_menu_component: {
        Args: { c: string };
        Returns: boolean;
      };
      provider_of_customization_group: { Args: { g: string }; Returns: string };
      can_read_provider_customization_group: {
        Args: { g: string };
        Returns: boolean;
      };
      can_read_provider_response: { Args: { r: string }; Returns: boolean };
      can_read_provider_response_item: {
        Args: { i: string };
        Returns: boolean;
      };
      can_read_provider_batch: { Args: { b: string }; Returns: boolean };
      abandon_stale_drafts: { Args: never; Returns: number };
      accept_invite: { Args: { p_token_hash: string }; Returns: Json };
      can_view_provider_identity: { Args: { p: string }; Returns: boolean };
      complete_onboarding: {
        Args: {
          p_combination_prefs?: Json;
          p_draft_id: string;
          p_food_preferences?: Json;
          p_household: Json;
          p_preferences: Json;
        };
        Returns: Json;
      };
      complete_provider_onboarding: {
        Args: { p_provider_id: string };
        Returns: undefined;
      };
      create_household: { Args: { p_name: string }; Returns: string };
      create_provider_draft: { Args: { p_name: string }; Returns: string };
      accept_provider_invite: {
        Args: { p_token_hash: string };
        Returns: Json;
      };
      approve_provider_member: {
        Args: { p_member_id: string; p_provider_id: string };
        Returns: undefined;
      };
      reject_provider_member: {
        Args: { p_member_id: string; p_provider_id: string };
        Returns: undefined;
      };
      remove_provider_member: {
        Args: { p_member_id: string; p_provider_id: string };
        Returns: undefined;
      };
      complete_member_onboarding: {
        // p_display_name / p_phone / p_default_spice_level are hand-adjusted to
        // `| null`: the generator does not emit argument nullability, but the
        // member-onboarding service passes explicit nulls for the optional fields.
        Args: {
          p_allergy_ack: boolean;
          p_auto_accept_consent: boolean;
          p_default_spice_level: string | null;
          p_display_name: string | null;
          p_phone: string | null;
          p_provider_id: string;
          p_terms_ack: boolean;
        };
        Returns: undefined;
      };
      save_provider_response: {
        // p_expected_version / p_member_note are hand-adjusted to `| null`: the
        // generator does not emit argument nullability, but the response-write
        // service passes null for a first save (no version) and an absent note.
        Args: {
          p_expected_version: number | null;
          p_items: Json;
          p_member_note: string | null;
          p_menu_day_id: string;
        };
        Returns: string;
      };
      confirm_provider_response: {
        Args: { p_response_id: string };
        Returns: string;
      };
      cancel_provider_response: {
        Args: { p_response_id: string };
        Returns: string;
      };
      census_provider_responses: {
        // Internal SECURITY DEFINER helper (pmp_16, #38): the shared active-customer
        // census for a menu day, called by process_provider_cutoff and
        // regenerate_provider_batch. service_role-only; not invoked from app code.
        Args: { p_provider_id: string; p_menu_day_id: string };
        Returns: {
          active_customers: number;
          auto_accepted: number;
          cancelled: number;
          confirmed: number;
          no_response: number;
        }[];
      };
      derive_provider_response_items: {
        // Internal SECURITY DEFINER helper (pmp_16, #38): the shared §11.6 response
        // item/customization derivation loop, called by save_provider_response and
        // provider_override_response. service_role-only; not invoked from app code.
        Args: {
          p_response_id: string;
          p_menu_day_id: string;
          p_items: Json | null;
        };
        Returns: undefined;
      };
      process_provider_cutoff: {
        // Returns the menu day's current batch id, or null when the day is not a
        // cutoff candidate (not published / cutoff not yet reached) — a safe no-op.
        Args: { p_menu_day_id: string };
        Returns: string | null;
      };
      create_provider_menu_day: {
        // MP-A-121 authoring writer (pmp_19): owner-gates, then creates a DRAFT menu
        // day + its full component tree from one structured builder payload,
        // denormalizing name/quantity/unit/spice-salt off the owner-private catalog.
        // Returns the new menu day's id; the service reads it back via getMenuDay.
        // Custom SQLSTATEs MAOWN/MADUP/MAINC are mapped in menu-authoring.ts.
        Args: { p_provider_id: string; p_payload: Json };
        Returns: string;
      };
      publish_provider_menu_day: {
        // MP-A-121 fresh-publish writer (pmp_18): owner-gates + draft-gates, enforces
        // DB-context menu completeness (active+owned catalog refs) AND the future-cutoff
        // structural backstop, flips the day + its weekly container to published, and
        // fans out provider_menu_published. Returns the day's published_at timestamp
        // (the existing one on an idempotent no-op) so the service patches its already-
        // read DTO. Custom SQLSTATEs PMOWN/PMNDR/PMINC are mapped in menu-publish.ts.
        Args: { p_menu_day_id: string };
        Returns: string;
      };
      run_provider_cutoffs: { Args: never; Returns: number };
      provider_override_response: {
        // p_items is `| null` (hand-adjusted, like save_provider_response): the
        // generator does not emit argument nullability. Returns a jsonb result
        // ({ responseId, menuDayId, status, staleBatchId }) the route serves directly.
        Args: { p_response_id: string; p_reason: string; p_items: Json | null };
        Returns: Json;
      };
      regenerate_provider_batch: {
        // Returns a jsonb batch summary ({ batchId, menuDayId, revision, status,
        // generatedAt, emailStatus, totals }) the route serves directly.
        Args: { p_batch_id: string };
        Returns: Json;
      };
      get_provider_batch: {
        // Owner-gated batch detail (pmp_13, MP-A-160): a jsonb BatchDto + print
        // context ({ providerName, menuDate, cutoffAt }) — aggregate roster from
        // the persisted lines, per-member roster rebuilt from locked responses.
        Args: { p_batch_id: string };
        Returns: Json;
      };
      insert_provider_batch_lines: {
        // service_role-only aggregation helper (regenerate writer); not user-callable.
        // Sums provider_member_breakdown_lines across members (pmp_13 single-source).
        Args: { p_batch_id: string; p_menu_day_id: string };
        Returns: undefined;
      };
      provider_member_breakdown_lines: {
        // service_role-only per-member roster (pmp_13, MP-A-160): the single source
        // of the active-customer eligibility + included/extra rule the persisted
        // aggregate and the batch read both derive from. Not user-callable.
        Args: { p_menu_day_id: string };
        Returns: {
          member_user_id: string;
          catalog_item_id: string;
          canonical_unit: string;
          spice_level: Database["public"]["Enums"]["provider_spice_level"];
          salt_level: Database["public"]["Enums"]["provider_salt_level"];
          included_quantity: number;
          extra_quantity: number;
          total_quantity: number;
        }[];
      };
      get_provider_invite_preview: {
        Args: { p_token_hash: string };
        Returns: {
          provider_name: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["provider_membership_role"];
          expires_at: string;
        }[];
      };
      list_provider_members: {
        Args: { p_provider_id: string };
        Returns: {
          member_id: string;
          user_id: string;
          display_name: string | null;
          email: string | null;
          phone: string | null;
          role: Database["public"]["Enums"]["provider_membership_role"];
          status: Database["public"]["Enums"]["provider_membership_status"];
          approved_at: string | null;
          joined_at: string | null;
        }[];
      };
      get_provider_member: {
        Args: { p_provider_id: string; p_member_id: string };
        Returns: {
          member_id: string;
          user_id: string;
          display_name: string | null;
          email: string | null;
          phone: string | null;
          role: Database["public"]["Enums"]["provider_membership_role"];
          status: Database["public"]["Enums"]["provider_membership_status"];
          approved_at: string | null;
          joined_at: string | null;
        }[];
      };
      decline_invite: { Args: { p_token_hash: string }; Returns: Json };
      delete_household: { Args: { h: string }; Returns: undefined };
      emit_household_event: {
        // Nullable args (`| null`) are hand-adjusted: Supabase's type generator
        // does not emit nullability for function arguments, but the emit writer
        // passes explicit nulls for entity / value / extra-recipient fields.
        Args: {
          p_entity_id: string | null;
          p_entity_type: string;
          p_event_type: string;
          p_extra_recipient_ids: string[] | null;
          p_household_id: string;
          p_message: string;
          p_new_value: Json | null;
          p_old_value: Json | null;
          p_title: string;
        };
        Returns: Json;
      };
      emit_provider_event: {
        // Nullable args (`| null`) are hand-adjusted (see emit_household_event):
        // the generator omits function-arg nullability, but the provider emit path
        // passes explicit nulls for entity / value / title / message (audit-only
        // events) and recipient ids.
        Args: {
          p_entity_id: string | null;
          p_entity_type: string;
          p_event_type: string;
          p_message: string | null;
          p_new_value: Json | null;
          p_old_value: Json | null;
          p_provider_id: string;
          p_recipient_user_ids: string[] | null;
          p_title: string | null;
        };
        Returns: Json;
      };
      expire_guests: { Args: never; Returns: number };
      expire_invites: { Args: never; Returns: number };
      get_event_email_recipients: {
        // p_extra_recipient_ids is hand-adjusted to `| null` (the email fan-out
        // passes null when there are no extra recipients); Supabase's type
        // generator does not emit nullability for function arguments.
        Args: {
          p_event_category: string;
          p_extra_recipient_ids: string[] | null;
          p_household_id: string;
        };
        Returns: {
          display_name: string;
          email: string;
          user_id: string;
        }[];
      };
      get_event_push_tokens: {
        // p_extra_recipient_ids hand-adjusted to `| null` (the push fan-out passes
        // null when there are no extra recipients), matching the email recipients fn.
        Args: {
          p_extra_recipient_ids: string[] | null;
          p_household_id: string;
        };
        Returns: {
          platform: string;
          token: string;
          user_id: string;
        }[];
      };
      get_invite_preview: {
        Args: { p_token_hash: string };
        Returns: {
          expires_at: string;
          household_name: string;
          invited_by: string;
          membership_type: Database["public"]["Enums"]["membership_type"];
          role: Database["public"]["Enums"]["member_role"];
        }[];
      };
      has_permission: { Args: { h: string; perm: string }; Returns: boolean };
      increment_combination_popularity: {
        Args: { p_combination_id: string };
        Returns: undefined;
      };
      increment_dish_popularity: {
        Args: { p_dish_id: string };
        Returns: undefined;
      };
      is_active_member: { Args: { h: string }; Returns: boolean };
      is_active_provider_member: { Args: { p: string }; Returns: boolean };
      is_provider_owner: { Args: { p: string }; Returns: boolean };
      list_household_food_preferences: {
        Args: { p_household_id: string };
        Returns: {
          allergies: string[];
          diet_type: Database["public"]["Enums"]["diet_type"];
          disliked_dishes: string[];
          disliked_ingredients: string[];
          health_preference_tags: string[];
          liked_dishes: string[];
          spice_preference: Database["public"]["Enums"]["spice_level"];
          user_id: string;
        }[];
      };
      list_household_members: {
        Args: { p_household_id: string };
        Returns: {
          can_change_today_menu: boolean;
          can_change_weekly_schedule: boolean;
          can_edit_household_preferences: boolean;
          can_invite_members: boolean;
          can_manage_grocery_list: boolean;
          can_remove_members: boolean;
          can_suggest_meals: boolean;
          can_view_plan: boolean;
          display_name: string;
          expires_at: string;
          joined_at: string;
          member_id: string;
          membership_type: Database["public"]["Enums"]["membership_type"];
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["member_status"];
          user_id: string;
        }[];
      };
      prep_reminders: { Args: never; Returns: number };
      propose_meal_combination: {
        Args: {
          p_cuisine?: string;
          p_diet_type: Database["public"]["Enums"]["diet_type"];
          p_dish_ids: string[];
          p_household_id: string;
          p_name: string;
        };
        Returns: string;
      };
      register_device_token: {
        Args: { p_platform: string; p_token: string };
        Returns: string;
      };
      replace_grocery_list: {
        Args: { p_items: Json; p_meal_plan_id: string };
        Returns: string;
      };
      set_active_household: { Args: { h: string }; Returns: undefined };
      set_active_workspace: {
        Args: { p_workspace_id: string; p_workspace_type: string };
        Returns: undefined;
      };
      set_preferred_household: { Args: { h: string }; Returns: undefined };
      set_provider_batch_email_status: {
        Args: { p_batch_id: string; p_status: string };
        Returns: undefined;
      };
      transfer_ownership: {
        Args: { p_household_id: string; p_target_member_id: string };
        Returns: Json;
      };
    };
    Enums: {
      auth_provider: "google" | "email" | "magic_link";
      budget_preference: "low" | "medium" | "high";
      combination_status: "proposed" | "active" | "archived" | "rejected";
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
      image_status: "verified" | "missing" | "broken" | "placeholder";
      invite_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled";
      meal_frequency: "daily" | "once_a_week" | "once_in_a_while";
      meal_item_status:
        | "suggested"
        | "accepted"
        | "rejected"
        | "replaced"
        | "cooked"
        | "skipped"
        | "eating_out";
      meal_plan_status: "draft" | "active" | "archived";
      meal_role:
        | "complete_meal"
        | "main_component"
        | "rice_component"
        | "bread_component"
        | "side"
        | "condiment"
        | "beverage";
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
      provider_component_group:
        | "main"
        | "dal_or_legume"
        | "sabzi"
        | "bread"
        | "rice"
        | "side"
        | "add_on";
      provider_customization_type:
        | "single_select"
        | "multi_select"
        | "quantity_increment"
        | "boolean"
        | "text_note";
      provider_membership_role: "owner" | "customer";
      provider_membership_status:
        | "invited"
        | "awaiting_approval"
        | "active"
        | "rejected"
        | "removed";
      provider_menu_status:
        | "draft"
        | "published"
        | "locked"
        | "archived"
        | "cancelled";
      provider_response_status:
        | "no_response"
        | "draft"
        | "confirmed"
        | "cancelled"
        | "auto_accepted"
        | "locked"
        | "provider_overridden";
      provider_salt_level: "low_salt" | "regular_salt" | "high_salt";
      provider_spice_level: "non_spicy" | "mild" | "regular" | "spicy";
      provider_suggestion_status:
        | "pending"
        | "accepted_as_option"
        | "rejected"
        | "deferred";
      serving_unit: "cup" | "bowl" | "plate" | "glass" | "piece";
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
      combination_status: ["proposed", "active", "archived", "rejected"],
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
      image_status: ["verified", "missing", "broken", "placeholder"],
      invite_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "cancelled",
      ],
      meal_frequency: ["daily", "once_a_week", "once_in_a_while"],
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
      meal_role: [
        "complete_meal",
        "main_component",
        "rice_component",
        "bread_component",
        "side",
        "condiment",
        "beverage",
      ],
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
      provider_component_group: [
        "main",
        "dal_or_legume",
        "sabzi",
        "bread",
        "rice",
        "side",
        "add_on",
      ],
      provider_customization_type: [
        "single_select",
        "multi_select",
        "quantity_increment",
        "boolean",
        "text_note",
      ],
      provider_membership_role: ["owner", "customer"],
      provider_membership_status: [
        "invited",
        "awaiting_approval",
        "active",
        "rejected",
        "removed",
      ],
      provider_menu_status: [
        "draft",
        "published",
        "locked",
        "archived",
        "cancelled",
      ],
      provider_response_status: [
        "no_response",
        "draft",
        "confirmed",
        "cancelled",
        "auto_accepted",
        "locked",
        "provider_overridden",
      ],
      provider_salt_level: ["low_salt", "regular_salt", "high_salt"],
      provider_spice_level: ["non_spicy", "mild", "regular", "spicy"],
      provider_suggestion_status: [
        "pending",
        "accepted_as_option",
        "rejected",
        "deferred",
      ],
      serving_unit: ["cup", "bowl", "plate", "glass", "piece"],
      spice_level: ["mild", "medium", "spicy"],
    },
  },
} as const;
