/**
 * Email-code authentication.
 *
 * Flow:
 *   1. Client POSTs an email to /send-code. We generate a short-lived 6-char
 *      hex code, store it in memory keyed by email, and mail it to the user.
 *   2. Client POSTs {email, code} to /verify. If the code matches and hasn't
 *      expired, we burn it and either create or return the corresponding user.
 *
 * The userId for an email-authenticated user is deterministic: a SHA-256 hash
 * of the lowercase email, prefixed with `email_`. That way re-logging in
 * always lands on the same account without needing a separate lookup.
 */

const nodemailer = require("nodemailer");
const crypto = require("crypto");
const User = require("../models/User");
const { signAppToken } = require("../utils/appToken");

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const CODE_BYTE_LENGTH = 3;

// A code is only as strong as the number of guesses you get at it. 6 hex chars
// is a small space, so the code is burned after this many wrong tries and the
// user has to request a new one.
const MAX_VERIFY_ATTEMPTS = 5;

// In-memory verification codes: { email: { code, expiresAt, attempts } }.
// TODO: This is per-process state — won't survive restarts and won't work
// behind multiple instances. Move to Redis or the DB if we scale out.
const verificationCodes = new Map();

// Nothing ever removed expired entries, so a stream of /send-code calls for
// addresses that never verify would grow this map without bound.
const purgeExpiredCodes = () => {
  const now = Date.now();
  for (const [email, entry] of verificationCodes) {
    if (now > entry.expiresAt) verificationCodes.delete(email);
  }
};

/** Compare in constant time so response latency can't leak the code. */
const codesMatch = (a, b) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

let transporter = null;

/** Lazily create and memoize the nodemailer transport so tests / imports are cheap. */
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
};

/** HTML body for the verification email. Extracted so the handler stays readable. */
const buildVerificationEmailHtml = (code) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0c; color: #ffffff; border-radius: 12px;">
    <h2 style="text-align: center; color: #3b82f6; margin-bottom: 24px;">FxQuant Trading</h2>
    <p style="text-align: center; color: #a1a1aa; font-size: 16px;">Your verification code is:</p>
    <div style="text-align: center; padding: 24px; margin: 16px 0; background: #18181b; border-radius: 8px; border: 1px solid #27272a;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #3b82f6;">${code}</span>
    </div>
    <p style="text-align: center; color: #a1a1aa; font-size: 14px;">This code expires in 10 minutes.</p>
    <p style="text-align: center; color: #71717a; font-size: 12px; margin-top: 24px;">If you didn't request this code, please ignore this email.</p>
  </div>
`;

/** Deterministic user id derived from the user's email address. */
const userIdFromEmail = (email) =>
  "email_" + crypto.createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 20);

/**
 * POST /api/email-auth/send-code
 * Generate a fresh code, store it with a 10-minute expiry, and mail it.
 */
const sendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    purgeExpiredCodes();

    const code = crypto.randomBytes(CODE_BYTE_LENGTH).toString("hex").toUpperCase();
    verificationCodes.set(email.toLowerCase(), {
      code,
      expiresAt: Date.now() + CODE_LIFETIME_MS,
      attempts: 0,
    });

    await getTransporter().sendMail({
      from: `"FxQuant Trading" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your FxQuant Verification Code",
      html: buildVerificationEmailHtml(code),
    });

    res.json({ message: "Verification code sent successfully" });
  } catch (error) {
    console.error("Send verification code error:", error);
    res.status(500).json({ message: "Failed to send verification code" });
  }
};

/**
 * POST /api/email-auth/verify
 * Validate the code, burn it, and return (creating on first login) the user.
 */
const verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const normalizedEmail = email.toLowerCase();
    const stored = verificationCodes.get(normalizedEmail);

    if (!stored) {
      return res.status(400).json({ message: "No verification code found. Please request a new one." });
    }
    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(normalizedEmail);
      return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
    }

    if (!codesMatch(stored.code, code.toUpperCase())) {
      stored.attempts += 1;
      if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
        verificationCodes.delete(normalizedEmail);
        return res.status(400).json({
          message: "Too many incorrect attempts. Please request a new code.",
        });
      }
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // One-shot code: consume on successful use.
    verificationCodes.delete(normalizedEmail);

    const userId = userIdFromEmail(normalizedEmail);
    let user = await User.findOne({ userId });
    const isNewUser = !user;

    if (!user) {
      user = await new User({ userId, gmail: normalizedEmail }).save();
    }

    res.json({
      user,
      isNewUser,
      token: signAppToken(userId),
      message: isNewUser ? "New user created successfully" : "User authenticated successfully",
    });
  } catch (error) {
    console.error("Verify code error:", error);
    res.status(500).json({ message: "Verification failed" });
  }
};

module.exports = {
  sendVerificationCode,
  verifyCode,
};
