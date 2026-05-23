const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');

router.get('/', transactionController.getAll);
router.post('/', transactionController.create);

module.exports = router;
