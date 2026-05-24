const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

router.get('/', itemController.getAll);
router.get('/:kode', itemController.getByKode);
router.post('/', itemController.create);
router.delete('/:kode', itemController.delete);

module.exports = router;
