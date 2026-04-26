const express = require('express');
const { getHistory, deleteHistoryItem, bulkDeleteHistory } = require('../controllers/history.controller');

const router = express.Router();

router.get('/', getHistory);
router.delete('/:id', deleteHistoryItem);
router.delete('/', bulkDeleteHistory);

module.exports = router;
