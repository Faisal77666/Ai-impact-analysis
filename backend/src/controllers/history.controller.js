const Query = require('../models/Query');
const AnalysisResult = require('../models/AnalysisResult');
const mongoose = require('mongoose');

const getHistory = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const risk = String(req.query.risk || '').trim().toUpperCase();
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    const queryFilter = {};
    if (from || to) {
      queryFilter.createdAt = {};
      if (from && !Number.isNaN(from.getTime())) queryFilter.createdAt.$gte = from;
      if (to && !Number.isNaN(to.getTime())) queryFilter.createdAt.$lte = to;
    }

    const queries = await Query.find(queryFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const queryIds = queries.map((item) => item._id);
    const resultFilter = { queryId: { $in: queryIds } };
    if (risk && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk)) {
      resultFilter.riskScore = risk;
    }
    const results = await AnalysisResult.find(resultFilter).lean();

    const resultByQueryId = new Map(results.map((result) => [String(result.queryId), result]));

    const history = queries
      .map((query) => ({
      ...query,
      result: resultByQueryId.get(String(query._id)) || null
      }))
      .filter((item) => !risk || item.result);

    return res.status(200).json({
      success: true,
      limit,
      skip,
      count: history.length,
      history
    });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.message = `Failed to fetch history: ${error.message}`;
    return next(error);
  }
};

const deleteHistoryItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid history id', details: null });
    }

    const query = await Query.findById(id);
    if (!query) {
      return res.status(404).json({ success: false, message: 'History item not found', details: null });
    }

    await AnalysisResult.deleteMany({ queryId: query._id });
    await Query.deleteOne({ _id: query._id });

    return res.status(200).json({ success: true, message: 'History item deleted', details: { id } });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.message = `Failed to delete history item: ${error.message}`;
    return next(error);
  }
};

const bulkDeleteHistory = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => mongoose.isValidObjectId(id)) : [];

    if (!ids.length) {
      await AnalysisResult.deleteMany({});
      const deletedQueries = await Query.deleteMany({});

      return res.status(200).json({
        success: true,
        message: 'All history deleted',
        details: { deletedCount: deletedQueries.deletedCount || 0 }
      });
    }

    await AnalysisResult.deleteMany({ queryId: { $in: ids } });
    const deletedQueries = await Query.deleteMany({ _id: { $in: ids } });

    return res.status(200).json({
      success: true,
      message: 'Selected history deleted',
      details: { deletedCount: deletedQueries.deletedCount || 0 }
    });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.message = `Failed to bulk delete history: ${error.message}`;
    return next(error);
  }
};

module.exports = {
  getHistory,
  deleteHistoryItem,
  bulkDeleteHistory
};
