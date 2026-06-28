const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.post("/auth", userController.createOrGetUser);

router.get("/:userId", userController.getUser);

router.patch("/:userId/balance", userController.updateBalance);

router.post("/:userId/setup-account", userController.setupAccount);

router.post("/:userId/reset-trading", userController.resetTradingAccount);
router.post("/:userId/reset-full", userController.resetFullAccount);
router.patch("/:userId/tour-complete", userController.markTourComplete);
router.delete("/:userId", userController.deleteAccount);

module.exports = router;
