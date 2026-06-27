const nodemailer = require('nodemailer');
require('dotenv').config();

const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || `"SBL Jewellery" <${smtpUser || 'no-reply@sribhagyalaxmijewellers.com'}>`;

const isConfigured = smtpUser && smtpPass;

let transporter = null;

if (isConfigured) {
    try {
        transporter = nodemailer.createTransport({
            host: smtpHost || 'smtp.gmail.com',
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });
        console.log("Nodemailer SMTP Transporter initialized successfully.");
    } catch (err) {
        console.error("Failed to initialize Nodemailer SMTP, falling back to mock logger:", err.message);
        transporter = null;
    }
} else {
    console.warn("\n==========================================================================");
    console.warn("WARNING: SMTP credentials (SMTP_USER, SMTP_PASS) are missing from .env!");
    console.warn("The application is running in LOCAL MOCK EMAIL FALLBACK mode.");
    console.warn("Emails will be logged to the server console instead of being sent.");
    console.warn("==========================================================================\n");
}

/**
 * Send an email notification.
 * Falls back to console logger if SMTP is not configured.
 */
async function sendEmail({ to, subject, text, html }) {
    if (!to) {
        throw new Error("Recipient address (to) is required.");
    }

    if (transporter) {
        const mailOptions = {
            from: smtpFrom,
            to,
            subject,
            text,
            html
        };
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`[SMTP] Email sent successfully to ${to}. MessageId: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (err) {
            console.error(`[SMTP ERROR] Failed to send email to ${to}:`, err.message);
            console.warn("Falling back to local console mock email logging due to SMTP error.");
            logMockEmail({ to, subject, text, html });
            return { success: true, error: err.message, mock: true };
        }
    } else {
        logMockEmail({ to, subject, text, html });
        return { success: true, mock: true };
    }
}

function logMockEmail({ to, subject, text, html }) {
    console.log("\n--- [SMTP MOCK EMAIL NOTIFICATION] ---");
    console.log(`Time:    ${new Date().toLocaleString()}`);
    console.log(`From:    ${smtpFrom}`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text:    ${text}`);
    if (html) {
        console.log("HTML:    Included");
    }
    console.log("---------------------------------------\n");
}

module.exports = { sendEmail, isConfigured };
