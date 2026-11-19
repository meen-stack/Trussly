import "server-only";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/** Sends an email through Resend when configured; otherwise logs it so local dev works without keys. */
export async function sendEmail(to: string, subject: string, text: string) {
  if (!resend) {
    console.log(`[email] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  try {
    await resend.emails.send({ from: process.env.EMAIL_FROM ?? "BuildTrace <onboarding@resend.dev>", to, subject, text });
  } catch (err) {
    console.error("[email] send failed", err);
  }
}

export function appUrl(path: string) {
  return `${process.env.APP_URL ?? "http://localhost:3000"}${path}`;
}
