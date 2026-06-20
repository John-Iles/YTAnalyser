export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_ACCESS_CODE: string;
  MODEL?: string;
  APP_ORIGIN?: string;
}

const CORS_HEADERS = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigin = env.APP_ORIGIN ?? 'https://john-iles.github.io';
    const origin = request.headers.get('Origin') ?? '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      if (origin === allowedOrigin) {
        return new Response(null, { status: 204, headers: CORS_HEADERS(allowedOrigin) });
      }
      return new Response('Forbidden', { status: 403 });
    }

    const corsHeaders = origin === allowedOrigin ? CORS_HEADERS(allowedOrigin) : {};

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // All other routes must have correct origin (non-browser direct calls lack Origin header,
    // but we still gate /ask via access code)
    if (url.pathname === '/ask') {
      // Placeholder — full implementation in Phase 3
      return new Response(JSON.stringify({ error: 'Not yet implemented' }), {
        status: 501,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};
