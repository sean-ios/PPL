# Cloudflare Contact Form Integration Guide

## Setup Instructions

### Step 1: Create a KV Namespace (for rate limiting & storage)

```bash
wrangler kv:namespace create "CONTACT_KV"
wrangler kv:namespace create "CONTACT_KV" --preview
```

Copy the namespace IDs and paste them into `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CONTACT_KV"
id = "YOUR_KV_NAMESPACE_ID"
preview_id = "YOUR_PREVIEW_KV_NAMESPACE_ID"
```

### Step 2: Update Configuration

Edit `wrangler.toml`:
- Replace `yourdomain.com` with your actual domain
- Replace `your-email@example.com` with your email

### Step 3: (Optional) Setup Email Notifications with SendGrid

1. Create a SendGrid account at https://sendgrid.com
2. Get your API key from SendGrid dashboard
3. Add the secret:
```bash
wrangler secret put SENDGRID_API_KEY
```
(Paste your SendGrid API key when prompted)

4. Update the `FROM` email in `worker.js` to match your SendGrid verified sender

### Step 4: Deploy the Worker

```bash
# Install wrangler globally (if not already installed)
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy to production
wrangler publish --env production
```

### Step 5: Connect Your Domain

In your Cloudflare dashboard:
1. Go to Workers > Routes
2. Create a route: `yourdomain.com/api/contact`
3. Assign it to the `portfolio-contact` worker

### Step 6: Update HTML (Optional)

If your worker is at a different URL, update the fetch endpoint in `index.html`:
```javascript
const res = await fetch("YOUR_WORKER_URL", {
  // ... rest of code
```

## Features

✅ **Rate Limiting** - Max 5 submissions per IP per hour
✅ **Input Validation** - Checks required fields, email format, message length
✅ **Security** - Sanitizes inputs, prevents injection attacks
✅ **Email Notifications** - SendGrid integration (optional)
✅ **Submission Storage** - Stores all submissions in KV for 30 days
✅ **Error Handling** - User-friendly error messages
✅ **Development Mode** - Works locally without a live worker

## Local Testing

The form already includes a development mode fallback. When running locally:
- The form will show: "[DEV] Form works! Connect your Cloudflare Worker to go live."
- This is purely for testing UI/UX

## Production Checklist

- [ ] Created KV namespaces and updated wrangler.toml
- [ ] Updated your email address in wrangler.toml
- [ ] (Optional) Set up SendGrid and added API key
- [ ] Deployed worker with `wrangler publish --env production`
- [ ] Connected route in Cloudflare dashboard
- [ ] Tested form submission on live domain

## Viewing Submissions

To view stored submissions in KV:

```bash
wrangler kv:key list --binding=CONTACT_KV --limit 100
```

To fetch a specific submission:
```bash
wrangler kv:key get "submission:TIMESTAMP:ID" --binding=CONTACT_KV
```

## Troubleshooting

**Form says "Network error"**
- Check that your route is correctly set in Cloudflare dashboard
- Verify worker is deployed: `wrangler publish`

**Emails not received**
- Verify SendGrid API key is set: `wrangler secret list`
- Check SendGrid sender email is verified
- Look at worker logs: `wrangler tail`

**Rate limit blocking submissions**
- KV store auto-resets limits after 1 hour
- Can be adjusted in `worker.js` (RATE_LIMIT_WINDOW, MAX_REQUESTS_PER_IP)

## Next Steps (Advanced)

- Add webhook to Discord for real-time notifications
- Integrate with Google Sheets to auto-log submissions
- Add CAPTCHA verification for spam protection
- Set up daily digest emails of submissions
