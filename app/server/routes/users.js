const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { requireAuth, requireSelfParam } = require("../middleware/auth");

// Public: this is the Google sign-in exchange itself. The caller proves who it
// is with a Firebase ID token and gets a session token back.
router.post("/auth", userController.createOrGetUser);

// Everything below acts on an account, so it must be your own account.
// requireSelfParam has to sit on each route rather than in a router.use():
// route params are not populated until the route pattern itself matches.
router.use(requireAuth);

router.get("/:userId", requireSelfParam, userController.getUser);

router.patch("/:userId/balance", requireSelfParam, userController.updateBalance);

router.post("/:userId/setup-account", requireSelfParam, userController.setupAccount);

router.post("/:userId/reset-trading", requireSelfParam, userController.resetTradingAccount);
router.post("/:userId/reset-full", requireSelfParam, userController.resetFullAccount);
router.patch("/:userId/tour-complete", requireSelfParam, userController.markTourComplete);
router.delete("/:userId", requireSelfParam, userController.deleteAccount);

module.exports = router;
