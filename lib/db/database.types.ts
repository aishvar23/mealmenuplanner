/**
 * Generated database types — PLACEHOLDER.
 *
 * This file is overwritten by `npm run db:types`
 * (`supabase gen types typescript --local --schema public`) once the schema
 * migrations (P0-5..P0-12) exist and the local stack is running.
 *
 * Until then it provides an empty but well-formed `Database` type so the
 * Supabase client factories are still strongly typed and the project compiles.
 * Do not hand-edit beyond this stub — regenerate instead.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
