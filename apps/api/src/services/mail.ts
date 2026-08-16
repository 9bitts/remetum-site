import { config } from "../config.js";

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ sent: boolean }> {
  const from = config.mail.from;

  if (config.mail.resendApiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.mail.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Falha ao enviar e-mail (${res.status}): ${body.slice(0, 200)}`);
    }
    return { sent: true };
  }

  if (config.mail.smtpUrl) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport(config.mail.smtpUrl);
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { sent: true };
  }

  console.info("[mail] not configured; message logged", {
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
  return { sent: false };
}

export function mailConfigured() {
  return Boolean(config.mail.resendApiKey || config.mail.smtpUrl);
}
