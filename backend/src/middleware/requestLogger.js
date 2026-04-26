const AuditLog = require('../models/AuditLog');

const requestLogger = (req, res, next) => {
  const start = Date.now();

  const summarizePayload = () => {
    if (!req.body || typeof req.body !== 'object') return {};

    const summary = {};
    if (typeof req.body.query === 'string') {
      summary.queryPreview = req.body.query.slice(0, 120);
      summary.queryLength = req.body.query.length;
    }
    if (req.body.debug !== undefined) summary.debug = Boolean(req.body.debug);

    return summary;
  };

  res.on('finish', async () => {
    const durationMs = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs}ms`);

    try {
      await AuditLog.create({
        action: `${req.method} ${req.path}`,
        endpoint: req.originalUrl,
        requestPayload: summarizePayload(),
        responseStatus: res.statusCode,
        durationMs
      });
    } catch (error) {
      console.error(`Audit log write failed: ${error.message}`);
    }
  });

  next();
};

module.exports = requestLogger;
