const express = require("express");
const router = express.Router();
const emailAuthController = require("../controllers/emailAuthController");

router.post("/send-code", emailAuthController.sendVerificationCode);
router.post("/verify-code", emailAuthController.verifyCode);

module.exports = router;
