/**
 * Cloudflare Worker — Contact Form Handler
 * Fixed: CORS headers on ALL responses
 */

const RATE_LIMIT_WINDOW = 3600;   // 1 hour
const MAX_REQUESTS_PER_IP = 5;    // 5 submissions per IP per hour

// CORS headers on EVERY response — this fixes the network error
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {

    // Handle preflight OPTIONS request (browser sends this before POST)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    try {
      // Rate limiting via KV
      const clientIP =
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For') ||
        'unknown';

      const rateLimitKey = `ratelimit:${clientIP}`;
      const currentCount = await env.CONTACT_KV.get(rateLimitKey);

      if (currentCount && parseInt(currentCount) >= MAX_REQUESTS_PER_IP) {
        return new Response(JSON.stringify({ error: 'Too many submissions. Please try again later.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      // Parse body
      let formData;
      try {
        formData = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      const { name, email, subject, message } = formData;

      // Validate
      if (!name || !email || !message) {
        return new Response(JSON.stringify({ error: 'Missing required fields.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ error: 'Invalid email address.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      if (message.trim().length < 20) {
        return new Response(JSON.stringify({ error: 'Message must be at least 20 characters.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      // Sanitize
      const clean = {
        name:    name.substring(0, 100),
        email:   email,
        subject: subject ? subject.substring(0, 200) : 'General Inquiry',
        message: message.substring(0, 5000),
        ip:      clientIP,
        time:    new Date().toISOString(),
      };

      // Store in KV
      const key = `submission:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      await env.CONTACT_KV.put(key, JSON.stringify(clean), { expirationTtl: 2592000 });

      // Update rate limit
      const newCount = currentCount ? parseInt(currentCount) + 1 : 1;
      await env.CONTACT_KV.put(rateLimitKey, newCount.toString(), { expirationTtl: RATE_LIMIT_WINDOW });

      // Send email via Resend
      if (env.RESEND_API_KEY) {
        await sendEmail(env, clean);
      }

      return new Response(JSON.stringify({
        success: true,
        message: "Message received! I'll get back to you within 24 hours.",
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Server error. Please try again later.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  },
};

/**
 * Send email via Resend (free tier: 3,000 emails/month)
 * Set secrets: wrangler secret put RESEND_API_KEY
 *              wrangler secret put TO_EMAIL
 */
async function sendEmail(env, data) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;border-left:4px solid #2563a8;padding-left:1.5rem">
      <h2 style="color:#2563a8;margin-bottom:0.25rem">New Portfolio Message</h2>
      <p style="color:#888;font-size:0.8rem;margin-top:0">${data.time}</p>
      <table style="width:100%;font-size:0.9rem;margin:1rem 0;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#555;width:80px">Name</td><td><strong>${data.name}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#555">Email</td><td><a href="mailto:${data.email}">${data.email}</a></td></tr>
        <tr><td style="padding:6px 0;color:#555">Subject</td><td>${data.subject}</td></tr>
      </table>
      <div style="background:#f5f5f5;padding:1rem;white-space:pre-wrap;font-size:0.9rem;line-height:1.6">${data.message}</div>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [env.TO_EMAIL || 'Seankeith.labios-22@cpu.edu.ph'],
        reply_to: data.email,
        subject: `[Portfolio] ${data.subject} — from ${data.name}`,
        html,
      }),
    });

    if (!res.ok) {
      console.error('Resend error:', await res.text());
    }
  } catch (err) {
    console.error('Email error:', err);
  }
}