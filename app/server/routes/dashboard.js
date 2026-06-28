const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');

router.get('/:userId', getDashboardStats);

module.exports = router;