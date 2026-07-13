const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');
const { requireAuth, requireSelfParam } = require('../middleware/auth');

// Your dashboard summarises your own trades, so it is private to you.
router.get('/:userId', requireAuth, requireSelfParam, getDashboardStats);

module.exports = router;
