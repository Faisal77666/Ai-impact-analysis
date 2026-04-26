const express = require('express');
const { getMetadata } = require('../controllers/metadata.controller');

const router = express.Router();

router.get('/:entityType/:fqn', getMetadata);

module.exports = router;
