const Query = require('../models/Query');
const AnalysisResult = require('../models/AnalysisResult');
const { parseUserQuery, generateRecommendations } = require('../services/llm.service');
const { runImpactAnalysis } = require('../services/impact.service');

const runAnalysis = async (req, res, next) => {
  const startedAt = Date.now();
  const queryText = req.body?.query;

  if (!queryText || typeof queryText !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Request body must include a non-empty "query" string.',
      details: null
    });
  }

  let queryDoc;

  try {
    queryDoc = await Query.create({ queryText, status: 'processing' });

    const parsedIntent = await parseUserQuery(queryText);
    queryDoc.parsedIntent = parsedIntent;
    await queryDoc.save();

    const impactReport = await runImpactAnalysis(parsedIntent);
    const recommendations = impactReport.recommendations?.length
      ? impactReport.recommendations
      : await generateRecommendations(impactReport);

    const resultDoc = await AnalysisResult.create({
      queryId: queryDoc._id,
      riskScore: impactReport.riskLevel === 'UNKNOWN' ? 'LOW' : impactReport.riskLevel,
      riskScoreValue: impactReport.riskScore,
      affectedAssets: impactReport.affectedAssets,
      recommendations,
      suggestedFixes: impactReport.suggestedFixes || impactReport.output?.suggestedFixes || [],
      lineageData: impactReport.lineageData,
      scoreReasons: impactReport.scoreReasons || [],
      target: impactReport.target,
      action: impactReport.action,
      executionTimeMs: Date.now() - startedAt
    });

    queryDoc.status = 'completed';
    await queryDoc.save();

    return res.status(201).json({
      query: queryDoc,
      result: resultDoc,
      impactReport: {
        ...impactReport,
        recommendations,
        suggestedFixes: impactReport.suggestedFixes || impactReport.output?.suggestedFixes || []
      }
    });
  } catch (error) {
    if (queryDoc) {
      try {
        queryDoc.status = 'failed';
        await queryDoc.save();
      } catch (saveError) {
        console.error(`Failed to update query status to failed: ${saveError.message}`);
      }
    }

    error.statusCode = error.statusCode || 500;
    error.message = `Analysis request failed: ${error.message}`;
    return next(error);
  }
};

const simulateImpactAnalysis = async (req, res, next) => {
  const queryText = req.body?.query;
  const debug = String(req.query?.debug || req.body?.debug || 'false').toLowerCase() === 'true';

  if (!queryText || typeof queryText !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Request body must include a non-empty "query" string.',
      details: null
    });
  }

  try {
    const parsedIntent = await parseUserQuery(queryText);
    const impactReport = await runImpactAnalysis(parsedIntent, { debug });
    const recommendations = impactReport.recommendations?.length
      ? impactReport.recommendations
      : await generateRecommendations(impactReport);

    return res.status(200).json({
      riskScore: impactReport.output.riskScore,
      riskLevel: impactReport.output.riskLevel,
      confidenceScore: impactReport.output.confidenceScore,
      graphStatus: impactReport.output.graphStatus,
      warning: impactReport.output.warning,
      reason: impactReport.output.reason,
      impactedAssets: impactReport.output.impactedAssets,
      dependencyPath: impactReport.output.dependencyPath,
      affectedAssets: impactReport.output.affectedAssets,
      dependencyAssets: impactReport.output.dependencyAssets,
      recommendations,
      suggestedFixes: impactReport.suggestedFixes || impactReport.output?.suggestedFixes || [],
      explainability: impactReport.output.explainability,
      reasonBreakdown: impactReport.output.reasonBreakdown,
      lineageSummary: impactReport.output.lineageSummary,
      graph: impactReport.output.graph,
      ...(impactReport.output.debug ? { debug: impactReport.output.debug } : {})
    });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.message = `Impact simulation failed: ${error.message}`;
    return next(error);
  }
};

module.exports = {
  runAnalysis,
  simulateImpactAnalysis
};
