import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Paths that don't require auth or household membership
  const publicPaths = [
    "/login",
    "/auth/callback",
    "/access-denied",
    "/invite",
    "/setup",
    "/api/invite",
  ];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  // --- Unauthenticated ---
  if (!user) {
    if (!isPublicPath) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      // Preserve invite token in redirect so the login page can pick it up
      return NextResponse.redirect(loginUrl);
    }
    return supabaseResponse;
  }

  // --- Authenticated: check email allowlist ---
  // ALLOWED_EMAILS is a server-side env var — never NEXT_PUBLIC_.
  // If set, only listed addresses may use the app.
  const allowedEmails = process.env.ALLOWED_EMAILS;
  if (allowedEmails) {
    const allowed = allowedEmails.split(",").map((e) => e.trim().toLowerCase());
    if (!user.email || !allowed.includes(user.email.toLowerCase())) {
      await supabase.auth.signOut();
      const deniedUrl = request.nextUrl.clone();
      deniedUrl.pathname = "/access-denied";
      return NextResponse.redirect(deniedUrl);
    }
  }

  // --- Authenticated: already on a public/setup path ---
  if (isPublicPath) {
    // After login, /auth/callback handles the redirect — don't interfere.
    // For /login, /setup, /invite: let them through (they'll self-redirect if
    // the user already has a household).
    return supabaseResponse;
  }

  // --- Authenticated: check household membership ---
  const { data: household } = await supabase
    .from("households")
    .select("id")
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .maybeSingle();

  if (!household) {
    // User is signed in but not in a household yet — send to onboarding
    const setupUrl = request.nextUrl.clone();
    setupUrl.pathname = "/setup";
    return NextResponse.redirect(setupUrl);
  }

  return supabaseResponse;
}
