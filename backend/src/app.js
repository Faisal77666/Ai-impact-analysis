const express = require('express');
const cors = require('cors');

const analysisRoutes = require('./routes/analysis.routes');
const metadataRoutes = require('./routes/metadata.routes');
const historyRoutes = require('./routes/history.routes');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'ok', details: null });
});

app.use('/api/analyze', analysisRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/history', historyRoutes);

app.use(errorHandler);

module.exports = app;
