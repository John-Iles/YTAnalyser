export default {
  async fetch(request, env) {
    const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || "";
    const MODEL = env.MODEL || "claude-sonnet-4-6";

    // Shared CORS headers — only ever reflect the one allowed origin.
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    const json = (obj, status) =>
      new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });

    // 1. CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    // 2. Reject any origin that isn't the allow-listed one.
    const origin = request.headers.get("Origin");
    if (origin && ALLOWED_ORIGIN && origin !== ALLOWED_ORIGIN) {
      return json({ error: "Forbidden origin" }, 403);
    }

    // 3. Access-code gate. Accept it from a header or the JSON body.
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const providedCode =
      request.headers.get("X-Access-Code") || body.accessCode || "";
    if (!env.APP_ACCESS_CODE || providedCode !== env.APP_ACCESS_CODE) {
      return json({ error: "Unauthorized" }, 401);
    }

    // 4. Validate / cap input.
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return json({ error: "Missing question" }, 400);
    }
    if (question.length > 2000) {
      return json({ error: "Question too long" }, 413);
    }

    const contexts = Array.isArray(body.contexts) ? body.contexts.slice(0, 12) : [];

    // Build the grounded context block from the retrieved snippets.
    const contextBlock = contexts
      .map((c, i) => {
        const title = String(c.title || "Untitled");
        const link = String(c.url || "");
        const published = String(c.published || "");
        const snippets = Array.isArray(c.snippets) ? c.snippets : [];
        const body = snippets.map((s) => "- " + String(s)).join("\n");
        return `[${i + 1}] ${title} (${published})\n${link}\n${body}`;
      })
      .join("\n\n")
      .slice(0, 24000);

    const systemPrompt =
      "Answer using ONLY the transcript excerpts provided. Cite every claim " +
      "with the video title and link it. If the excerpts don't contain the " +
      "answer, say so plainly — never guess or use outside knowledge. Never " +
      "invent timestamps; the source has none. Quote sparingly and accurately. " +
      "Flag conflicts or ambiguity.";

    const userContent =
      `Question: ${question}\n\n` +
      `Transcript excerpts:\n\n${contextBlock || "(no excerpts retrieved)"}`;

    // 5. Call the Anthropic Messages API with streaming on.
    let anthropicResp;
    try {
      anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          temperature: 0.2,
          stream: true,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      });
    } catch (e) {
      return json({ error: "Upstream request failed" }, 502);
    }

    if (!anthropicResp.ok || !anthropicResp.body) {
      const detail = await anthropicResp.text().catch(() => "");
      return json(
        { error: "Anthropic API error", status: anthropicResp.status, detail: detail.slice(0, 500) },
        502
      );
    }

    // 6. Stream the SSE response straight back to the browser.
    return new Response(anthropicResp.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        ...corsHeaders,
      },
    });
  },
};
