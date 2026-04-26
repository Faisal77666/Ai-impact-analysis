const express = require('express');
const { runAnalysis, simulateImpactAnalysis } = require('../controllers/analysis.controller');
const validate = require('../middleware/validate');
const { analyzeSchema } = require('../validation/analysis.validation');

const router = express.Router();

router.post('/', validate(analyzeSchema), runAnalysis);
router.post('/simulate', validate(analyzeSchema), simulateImpactAnalysis);

module.exports = router;
