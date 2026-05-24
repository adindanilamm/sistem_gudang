const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/', dashboardController.getStats);
router.get('/stock', dashboardController.getStockStats);
router.get('/stock-report', dashboardController.getStockReport);

module.exports = router;
