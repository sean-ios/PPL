/**
 * Cloudflare Worker for portfolio contact form
 * Handles form submissions with rate limiting and validation
 */

const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const MAX_REQUESTS_PER_IP = 5; // Max 5 submissions per IP per hour
const YOUR_EMAIL = "your-email@example.com"; // Update with your email

export default {
  async fetch(request, env) {
    // Only accept POST requests
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      // Get client IP
      const clientIP =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For") ||
        "unknown";

      // Check rate limit using KV storage
      const rateLimitKey = `ratelimit:${clientIP}`;
      const currentCount = await env.CONTACT_KV.get(rateLimitKey);

      if (currentCount && parseInt(currentCount) >= MAX_REQUESTS_PER_IP) {
        return new Response(
          JSON.stringify({
            error: "Too many submissions. Please try again later.",
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Parse form data
      const formData = await request.json();
      const { name, email, subject, message } = formData;

      // Validate required fields
      if (!name || !email || !message) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ error: "Invalid email address" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Sanitize message (basic protection against injection)
      const sanitizedMessage = message.substring(0, 5000); // Limit to 5000 chars
      const sanitizedName = name.substring(0, 100);
      const sanitizedSubject = subject ? subject.substring(0, 200) : "General Inquiry";

      // Send email via SendGrid or alternative email service
      // Option 1: Using Cloudflare Email Routing (requires setup)
      // Option 2: Using a webhook or email API

      // For now, we'll store in KV and log submission
      const submissionData = {
        timestamp: new Date().toISOString(),
        name: sanitizedName,
        email: email,
        subject: sanitizedSubject,
        message: sanitizedMessage,
        ip: clientIP,
      };

      // Store submission in KV
      const submissionKey = `submission:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      await env.CONTACT_KV.put(submissionKey, JSON.stringify(submissionData), {
        expirationTtl: 2592000, // 30 days
      });

      // Update rate limit counter
      const newCount = currentCount ? parseInt(currentCount) + 1 : 1;
      await env.CONTACT_KV.put(rateLimitKey, newCount.toString(), {
        expirationTtl: RATE_LIMIT_WINDOW,
      });

      // Send email notification (Option: SendGrid)
      if (env.SENDGRID_API_KEY) {
        await sendEmailViaSendGrid(env, submissionData);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Thank you! Your message has been received. I'll get back to you within 24 hours.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } catch (error) {
      console.error("Error processing form:", error);
      return new Response(
        JSON.stringify({ error: "Server error. Please try again later." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};

/**
 * Send email via SendGrid API
 * Requires SENDGRID_API_KEY in Cloudflare environment
 */
async function sendEmailViaSendGrid(env, submissionData) {
  const emailBody = `
New Contact Form Submission

Name: ${submissionData.name}
Email: ${submissionData.email}
Subject: ${submissionData.subject}
---

${submissionData.message}

---
Submitted at: ${submissionData.timestamp}
IP: ${submissionData.ip}
  `.trim();

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: env.YOUR_EMAIL || "your-email@example.com" }],
          },
        ],
        from: { email: "noreply@yourdomain.com", name: "Portfolio Contact" },
        subject: `New Contact: ${submissionData.subject}`,
        content: [
          {
            type: "text/plain",
            value: emailBody,
          },
        ],
        reply_to: {
          email: submissionData.email,
          name: submissionData.name,
        },
      }),
    });

    if (!response.ok) {
      console.error("SendGrid error:", await response.text());
    }
  } catch (error) {
    console.error("Email sending error:", error);
  }
}
