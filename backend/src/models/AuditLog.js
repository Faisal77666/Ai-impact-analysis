const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, default: '' },
    endpoint: { type: String, required: true },
    requestPayload: { type: Object, default: {} },
    responseStatus: { type: Number, required: true },
    durationMs: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
