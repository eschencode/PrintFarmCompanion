/**
 * Transactional email transport (Resend HTTP API).
 *
 * Workers/Pages can't open raw SMTP, so we POST to Resend's REST API. Needs:
 *   - RESEND_API_KEY  — secret (Pages: Settings → Variables & Secrets; local: .dev.vars)
 *   - EMAIL_FROM       — sender address on a domain verified in Resend
 * The sender domain's SPF/DKIM DNS records (provided by Resend) must live in
 * Cloudflare DNS, or Resend rejects the send.
 *
 * When the key or sender isn't configured (local dev), we log the message
 * instead of sending so auth flows stay testable without credentials.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailOpts extends EmailContent {
  to: string;
}

export async function sendEmail(
  env: EmailEnv | undefined,
  opts: SendEmailOpts,
): Promise<void> {
  const apiKey = env?.RESEND_API_KEY;
  const fromAddr = env?.EMAIL_FROM;

  if (!apiKey || !fromAddr) {
    // Not configured — surface the content so local flows are testable. The
    // reset/verify links live in the text body.
    console.warn(
      `[email] transport not configured; would send:\n` +
        `  to: ${opts.to}\n` +
        `  subject: ${opts.subject}\n` +
        `  ${opts.text.replace(/\n/g, "\n  ")}`,
    );
    return;
  }

  const name = env?.EMAIL_FROM_NAME;
  const from = name ? `${name} <${fromAddr}>` : fromAddr;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    // Surface Resend's error body — callers (better-auth) translate a throw
    // into a user-facing "couldn't send" without leaking the detail.
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }
}

// ---- Templates ------------------------------------------------------------

function shell(heading: string, body: string, cta: { url: string; label: string }): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;color:#18181b">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${heading}</h1>
  <p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 24px">${body}</p>
  <a href="${cta.url}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px">${cta.label}</a>
  <p style="font-size:12px;line-height:1.6;color:#a1a1aa;margin:24px 0 0">Or paste this link into your browser:<br><span style="color:#71717a;word-break:break-all">${cta.url}</span></p>
</div>`;
}

export function resetPasswordEmail(url: string): EmailContent {
  return {
    subject: "Reset your Print Farm password",
    html: shell(
      "Reset your password",
      "We received a request to reset your password. This link expires in 1 hour. If you didn't ask for this, you can ignore this email.",
      { url, label: "Reset password" },
    ),
    text: `Reset your Print Farm password.\n\nOpen this link (expires in 1 hour):\n${url}\n\nIf you didn't request this, ignore this email.`,
  };
}

export function verifyEmail(url: string): EmailContent {
  return {
    subject: "Verify your Print Farm email",
    html: shell(
      "Verify your email",
      "Confirm your email address to finish setting up your Print Farm workspace.",
      { url, label: "Verify email" },
    ),
    text: `Verify your Print Farm email.\n\nOpen this link to confirm your address:\n${url}`,
  };
}
