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

function sender() {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  return smtp ? `Trussly <${process.env.SMTP_USER}>` : "Trussly <onboarding@resend.dev>";
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

/** Sends an email by SMTP or Resend when configured, otherwise logs it. Never throws. */
export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  // Demo accounts aren't real inboxes.
  if (to.endsWith("@demo.trussly.app")) {
    console.log(`[email] demo to=${to} subject="${subject}"`);
    return { sent: false, reason: "demo account" };
  }
  if (!smtp && !resend) {
    console.log(`[email] not configured, to=${to} subject="${subject}"\n${text}`);
    return { sent: false, reason: "email isn't set up yet" };
  }
  try {
    if (smtp) {
      await smtp.sendMail({ from: sender(), to, subject, text });
    } else {
      // Resend reports failures in the result instead of throwing.
      const { error } = await resend!.emails.send({ from: sender(), to, subject, text });
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
