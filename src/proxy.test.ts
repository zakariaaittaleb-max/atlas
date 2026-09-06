import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from './proxy';

/**
 * `proxy.ts` lit Supabase (config + session) à chaque requête : on simule les
 * deux plutôt que de dépendre d'un projet réel, pour pouvoir tester les
 * combinaisons de bascules (y compris `rate_limit_api`, qui a besoin de
 * dizaines d'appels) sans jamais toucher au `security_config` de production —
 * cette table est partagée entre le dev local et Vercel.
 */

const { mockReadSecurityConfig } = vi.hoisted(() => ({
  mockReadSecurityConfig: vi.fn(),
}));

vi.mock('@/lib/security-config', () => ({
  readSecurityConfig: mockReadSecurityConfig,
}));

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const ALL_OFF = {
  strict_auth: false,
  security_headers: false,
  css_anti_selection: false,
  rate_limit_api: false,
};

function makeRequest(path: string, opts: { ip?: string } = {}) {
  const headers = new Headers();
  if (opts.ip) headers.set('x-forwarded-for', opts.ip);
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  mockReadSecurityConfig.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: null } });
});

describe('proxy', () => {
  it('laisse tout passer quand les quatre mesures sont désactivées', async () => {
    mockReadSecurityConfig.mockResolvedValue(ALL_OFF);
    const response = await proxy(makeRequest('/cockpit'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('Content-Security-Policy')).toBeNull();
    expect(response.status).toBeLessThan(300);
  });

  it('strict_auth redirige une page vers /login sans session', async () => {
    mockReadSecurityConfig.mockResolvedValue({ ...ALL_OFF, strict_auth: true });
    const response = await proxy(makeRequest('/cockpit'));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('strict_auth laisse /login accessible sans session', async () => {
    mockReadSecurityConfig.mockResolvedValue({ ...ALL_OFF, strict_auth: true });
    const response = await proxy(makeRequest('/login'));
    expect(response.headers.get('location')).toBeNull();
  });

  it('strict_auth renvoie 401 JSON pour /api/* sans session', async () => {
    mockReadSecurityConfig.mockResolvedValue({ ...ALL_OFF, strict_auth: true });
    const response = await proxy(makeRequest('/api/decisions'));
    expect(response.status).toBe(401);
  });

  it('strict_auth laisse passer un utilisateur authentifié (même anonyme)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockReadSecurityConfig.mockResolvedValue({ ...ALL_OFF, strict_auth: true });
    const response = await proxy(makeRequest('/cockpit'));
    expect(response.headers.get('location')).toBeNull();
  });

  it('security_headers ajoute Cache-Control, X-Robots-Tag, nosniff et une CSP', async () => {
    mockReadSecurityConfig.mockResolvedValue({ ...ALL_OFF, security_headers: true });
    const response = await proxy(makeRequest('/cockpit'));
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('example.supabase.co');
  });

  it('rate_limit_api bloque la 101e requête/minute pour la même IP', async () => {
    mockReadSecurityConfig.mockResolvedValue({ ...ALL_OFF, rate_limit_api: true });
    const ip = '203.0.113.42';

    for (let i = 0; i < 100; i++) {
      const response = await proxy(makeRequest('/api/decisions', { ip }));
      expect(response.status).not.toBe(429);
    }

    const blocked = await proxy(makeRequest('/api/decisions', { ip }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it("rate_limit_api n'affecte pas une IP distincte", async () => {
    mockReadSecurityConfig.mockResolvedValue({ ...ALL_OFF, rate_limit_api: true });
    const response = await proxy(makeRequest('/api/decisions', { ip: '198.51.100.7' }));
    expect(response.status).not.toBe(429);
  });

  it("rate_limit_api n'agit pas sur les pages hors /api", async () => {
    mockReadSecurityConfig.mockResolvedValue({ ...ALL_OFF, rate_limit_api: true });
    const ip = '203.0.113.99';
    for (let i = 0; i < 150; i++) {
      const response = await proxy(makeRequest('/cockpit', { ip }));
      expect(response.status).not.toBe(429);
    }
  });
});
