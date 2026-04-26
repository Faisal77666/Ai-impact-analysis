const mongoose = require('mongoose');

const affectedAssetSchema = new mongoose.Schema(
  {
    assetType: { type: String },
    type: { type: String },
    name: { type: String, required: true },
    fqn: { type: String, default: '' },
    owner: { type: String, default: 'unknown' },
    impact: { type: String, default: 'unknown' },
    impactType: {
      type: String,
      enum: ['HARD_BREAK', 'SOFT_IMPACT', 'NO_IMPACT'],
      default: 'SOFT_IMPACT'
    }
  },
  { _id: false }
);

const scoreReasonSchema = new mongoose.Schema(
  {
    asset: { type: String, default: '' },
    reason: { type: String, required: true },
    points: { type: Number, required: true }
  },
  { _id: false }
);

const analysisResultSchema = new mongoose.Schema(
  {
    queryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Query',
      required: true
    },
    riskScore: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true
    },
    riskScoreValue: {
      type: Number,
      min: 0,
      max: 100,
      required: true
    },
    affectedAssets: [affectedAssetSchema],
    recommendations: [{ type: String }],
    suggestedFixes: [{ type: Object }],
    lineageData: { type: Object, default: {} },
    scoreReasons: [scoreReasonSchema],
    target: { type: String, default: '' },
    action: { type: String, default: '' },
    executionTimeMs: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AnalysisResult', analysisResultSchema);
