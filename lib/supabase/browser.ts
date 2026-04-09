/**
 * Browser-safe Supabase client singleton for use in client components.
 * Import this directly (not via dynamic import) to preserve TypeScript generic types.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function getSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
