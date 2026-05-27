import { Router, type IRouter } from "express";
import { db, emailSubscribersTable } from "@workspace/db";
import { EmailSubscribeBody } from "@workspace/api-zod";
import { Resend } from "resend";
import { z } from "zod/v4";

const router: IRouter = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

router.post("/email/subscribe", async (req, res): Promise<void> => {
  const parsed = EmailSubscribeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email } = parsed.data;

  await db
    .insert(emailSubscribersTable)
    .values({ email, subscribed: true })
    .onConflictDoUpdate({
      target: emailSubscribersTable.email,
      set: { subscribed: true },
    });

  res.json({ success: true, message: "Subscribed successfully" });
});

const ContactBody = z.object({
  name: z.string().min(1).max(200),
  email: z.email(),
  message: z.string().min(1).max(5000),
});

router.post("/contact", async (req, res): Promise<void> => {
  const parsed = ContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  const { name, email, message } = parsed.data;

  try {
    await resend.emails.send({
      from: "Thursday Drop <hello@thursdaydrop.ca>",
      to: "hello@thursdaydrop.ca",
      replyTo: email,
      subject: `Contact form: ${name}`,
      html: `
        <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Contact form send failed");
    res.status(500).json({ error: "Failed to send message. Please try emailing us directly." });
  }
});

export default router;
