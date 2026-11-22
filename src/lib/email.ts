import "server-only";
import { Resend } from "resend";
import nodemailer from "nodemailer";

export type EmailResult = { sent: true } | { sent: false; reason: string };

// Two ways to send, checked in this order:
// 1. SMTP, such as a Gmail address with an app password. Works without owning a domain.
// 2. Resend, which needs a verified domain to email anyone but the account owner.
const smtp =
  process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: Number(process.env.SMTP_PORT ?? 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const emailConfigured = Boolean(smtp || resend);

/** From line: the company's name on Trussly's address, so people see who it's from. */
function sender(brand?: EmailBrand) {
  const label = (brand?.name ? `${brand.name} via Trussly` : "Trussly").replace(/["<>]/g, "");
  if (process.env.EMAIL_FROM) {
    const address = process.env.EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? process.env.EMAIL_FROM;
    return `"${label}" <${address}>`;
  }
  return smtp ? `"${label}" <${process.env.SMTP_USER}>` : `"${label}" <onboarding@resend.dev>`;
}

/** Plain-language reason for a failed send, shown to the person who triggered it. */
function explain(message: string) {
  if (/only send testing emails|verify a domain/i.test(message)) {
    return "Resend only delivers to your own address until you verify a domain";
  }
  if (/api key is invalid|invalid.*key|unauthori[sz]ed|EAUTH|Username and Password not accepted/i.test(message)) {
    return "the email login or API key was refused";
  }
  return message.slice(0, 160);
}

export type EmailBrand = { name: string; logoUrl?: string | null };
export type EmailOptions = { brand?: EmailBrand; action?: { label: string; url: string } };

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Makes a stored path absolute so mail apps can load it. */
function absolute(url: string) {
  return /^https?:\/\//.test(url) ? url : appUrl(url.startsWith("/") ? url : `/${url}`);
}

/** Branded HTML version: the company's logo (or Trussly's), the message, and a yellow button. Tables and inline styles for mail apps. */
export function emailHtml(subject: string, text: string, { brand, action }: EmailOptions = {}) {
  const logo = absolute(brand?.logoUrl || "/brand/trussly-logo.png");
  const name = escape(brand?.name ?? "Trussly");
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:22px;color:#16181d">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr><td style="background:#ffc107;border-radius:10px">
<a href="${escape(action.url)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#111111;text-decoration:none">${escape(action.label)}</a></td></tr></table>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e2dc;border-radius:16px">
<tr><td style="padding:24px 28px 8px"><img src="${escape(logo)}" alt="${name}" height="56" style="display:block;height:56px;max-width:200px;border-radius:10px"></td></tr>
<tr><td style="padding:8px 28px 24px">
<h1 style="margin:0 0 14px;font-size:20px;line-height:26px;color:#16181d">${escape(subject)}</h1>
${paragraphs}${button}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#5d6470">${name} · sent with Trussly</p>
</td></tr></table></body></html>`;
}

/** Sends an email by SMTP or Resend when configured, otherwise logs it. Never throws. */
export async function sendEmail(to: string, subject: string, text: string, options: EmailOptions = {}): Promise<EmailResult> {
  // Plain text keeps the link for mail apps that don't show HTML.
  const plain = options.action ? `${text}\n\n${options.action.label}: ${options.action.url}` : text;
  const html = emailHtml(subject, text, options);
  // Demo accounts aren't real inboxes.
  if (to.endsWith("@demo.trussly.app")) {
    console.log(`[email] demo to=${to} subject="${subject}"`);
    return { sent: false, reason: "demo account" };
  }
  if (!smtp && !resend) {
    console.log(`[email] not configured, to=${to} subject="${subject}"\n${plain}`);
    return { sent: false, reason: "email isn't set up yet" };
  }
  try {
    if (smtp) {
      await smtp.sendMail({ from: sender(options.brand), to, subject, text: plain, html });
    } else {
      // Resend reports failures in the result instead of throwing.
      const { error } = await resend!.emails.send({ from: sender(options.brand), to, subject, text: plain, html });
      if (error) throw new Error(error.message);
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] send failed", to, message);
    return { sent: false, reason: explain(message) };
  }
}

export function appUrl(path: string) {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = process.env.APP_URL ?? (vercel ? `https://${vercel}` : "http://localhost:3000");
  return `${base}${path}`;
}
