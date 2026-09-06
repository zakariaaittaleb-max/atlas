import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { readSecurityConfig } from '@/lib/security-config';

/**
 * ATLAS — proxy (anciennement « middleware », renommé en Next.js 16).
 *
 * Deux responsabilités, une seule invoquée à chaque requête et l'autre selon
 * la configuration `security_config` :
 *
 *  1. Rafraîchir le cookie de session Supabase. Un Server Component ne peut
 *     PAS écrire de cookie (voir le `catch` dans `lib/supabase/server.ts`) ;
 *     sans ce relais, un jeton expiré ne se renouvelle jamais et l'utilisateur
 *     est déconnecté sans préavis en pleine séance.
 *  2. Si `strict_auth` est activé, refuser tout ce qui n'a AUCUNE session
 *     Supabase (même anonyme) — un filtre grossier contre le scraping à froid
 *     (curl, robot sans navigateur), pas un contrôle d'autorisation fin : ça
 *     reste le rôle de la DAL (`lib/dal.ts`), revérifié à chaque Server
 *     Function comme documenté dans le guide Next.js sur la sécurité des
 *     données. Un visiteur qui exécute vraiment le flux de connexion (même
 *     anonyme) obtient une session comme n'importe quel participant légitime.
 */

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

const PUBLIC_PATHS = new Set(['/', '/login']);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/auth/');
}

// Compteur en mémoire, par instance de fonction Vercel : suffisant pour
// écrêter un scraping naïf, pas une limite exacte partagée entre instances.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_MAP_MAX_ENTRIES = 5_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();

  if (hits.size > RATE_LIMIT_MAP_MAX_ENTRIES) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function applySecurityHeaders(response: NextResponse, supabaseUrl: string): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  response.headers.set('Cache-Control', 'no-store, must-revalidate');

  const supabaseHost = (() => {
    try {
      return new URL(supabaseUrl).host;
    } catch {
      return '';
    }
  })();

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const securityConfig = await readSecurityConfig();

  if (securityConfig.rate_limit_api && pathname.startsWith('/api/')) {
    const { allowed, retryAfterSec } = checkRateLimit(clientIp(request));
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      );
    }
  }

  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (securityConfig.strict_auth && !isPublicPath(pathname) && !user) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  if (securityConfig.security_headers) {
    applySecurityHeaders(response, supabaseUrl ?? '');
  }

  return response;
}
