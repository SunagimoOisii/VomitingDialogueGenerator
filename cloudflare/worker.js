export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === 'POST' && path === '/event') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return new Response('bad request', { status: 400, headers: corsHeaders });
      }
      const event = String(payload?.event || '').slice(0, 64);
      if (!event) return new Response('bad request', { status: 400, headers: corsHeaders });

      // IPベースの簡易レート制限（1分あたり60件）
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ts = Date.now();
      const minute = Math.floor(ts / 60000);
      const rateKey = `rl:${ip}:${minute}`;
      const countRaw = await env.ANALYTICS.get(rateKey);
      const count = parseInt(countRaw || '0', 10) + 1;
      if (count > 60) {
        return new Response('rate limited', { status: 429, headers: corsHeaders });
      }
      await env.ANALYTICS.put(rateKey, String(count), { expirationTtl: 120 });

      const day = new Date().toISOString().slice(0, 10);
      const key = `day:${day}:${event}`;
      const totalKey = `total:${event}`;

      const [dayCount, totalCount] = await Promise.all([
        env.ANALYTICS.get(key),
        env.ANALYTICS.get(totalKey),
      ]);

      const nextDay = (parseInt(dayCount || '0', 10) + 1).toString();
      const nextTotal = (parseInt(totalCount || '0', 10) + 1).toString();

      await Promise.all([
        env.ANALYTICS.put(key, nextDay),
        env.ANALYTICS.put(totalKey, nextTotal),
      ]);

      return new Response('ok', { status: 200, headers: corsHeaders });
    }

    if (request.method === 'GET' && path === '/stats') {
      const today = new Date().toISOString().slice(0, 10);
      const keys = await env.ANALYTICS.list({ prefix: `day:${today}:` });
      const stats = {};
      for (const item of keys.keys) {
        const val = await env.ANALYTICS.get(item.name);
        const event = item.name.replace(`day:${today}:`, '');
        stats[event] = parseInt(val || '0', 10);
      }
      return Response.json({ day: today, stats }, { headers: corsHeaders });
    }

    return new Response('not found', { status: 404, headers: corsHeaders });
  },
};
