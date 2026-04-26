const mongoose = require('mongoose');

const querySchema = new mongoose.Schema(
  {
    queryText: {
      type: String,
      required: true,
      trim: true
    },
    parsedIntent: {
      entity: { type: String, default: '' },
      action: { type: String, default: '' },
      entityType: { type: String, default: 'table' },
      confidence: { type: Number, default: 0 }
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Query', querySchema);
