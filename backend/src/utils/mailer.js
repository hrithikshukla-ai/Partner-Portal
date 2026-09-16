const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

// Sends an email via SMTP when SMTP_HOST is configured in .env; otherwise logs
// the message so every flow that depends on email keeps working in dev without
// a mail provider on hand.
async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured — would send to ${to}: "${subject}"\n${html}`);
    return { delivered: false };
  }
  await t.sendMail({ from: process.env.SMTP_FROM || 'no-reply@academia-portal.local', to, subject, html });
  return { delivered: true };
}

module.exports = { sendMail };
