const express = require('express');
const router = express.Router();
const barcodeController = require('../controllers/barcodeController');

router.get('/:kode', barcodeController.generateBarcode);

module.exports = router;
