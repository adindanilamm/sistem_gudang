const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/', userController.getAll);
router.post('/', userController.create);
router.put('/:username', userController.update);
router.delete('/:username', userController.delete);

module.exports = router;
