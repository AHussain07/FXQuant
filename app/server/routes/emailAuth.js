const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const router = express.Router();
const emailAuthController = require("../controllers/emailAuthController");

/**
 * Both endpoints are unauthenticated by nature -- they are how you get a
 * session in the first place -- so throttling is the only thing standing
 * between them and abuse. Limits are keyed by IP *and* by the target email, so
 * neither rotating IPs nor rotating addresses gets you a fresh budget.
 *
 * ipKeyGenerator rather than a raw req.ip: a single IPv6 user is typically
 * handed a whole /64, so keying on the bare address would let them walk through
 * addresses and get a fresh budget each time. The helper collapses the block.
 */
const keyByIpAndEmail = (req) =>
  `${ipKeyGenerator(req.ip)}:${(req.body?.email || "").toLowerCase()}`;

// Sending mail costs money and lands in someone else's inbox, so this is the
// tighter of the two: without it anyone can email-bomb an arbitrary address.
const sendCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: keyByIpAndEmail,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many code requests. Please try again later." },
});

// Backstop against brute-forcing the code itself. The per-code attempt cap in
// the controller is the real defence; this stops a distributed guess-fest from
// churning through codes faster than the cap can burn them.
const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: keyByIpAndEmail,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts. Please try again later." },
});

router.post("/send-code", sendCodeLimiter, emailAuthController.sendVerificationCode);
router.post("/verify-code", verifyCodeLimiter, emailAuthController.verifyCode);

module.exports = router;
