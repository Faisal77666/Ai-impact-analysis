const env = require('../config/env');

const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}: ${err.message}`);

  const statusCode = err.statusCode || 500;
  const payload = {
    success: false,
    message: err.message || 'Internal Server Error',
    details: err.details || null
  };

  if (env.NODE_ENV === 'development' && err.stack) {
    payload.details = payload.details || err.stack;
  }

  res.status(statusCode).json(payload);
};

module.exports = errorHandler;
