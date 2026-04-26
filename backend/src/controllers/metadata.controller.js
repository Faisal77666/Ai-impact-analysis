const {
  getTableByFQN,
  searchEntities,
  getDashboards,
  getPipelines,
  getMlModels
} = require('../services/openmetadata.service');

const getMetadata = async (req, res, next) => {
  const { entityType, fqn } = req.params;

  try {
    const normalizedType = String(entityType || '').toLowerCase();
    let data;

    if (normalizedType === 'table') {
      data = await getTableByFQN(fqn);
    } else if (normalizedType === 'dashboard') {
      const dashboards = await getDashboards();
      data = dashboards.find((item) => item.name === fqn || item.fqn === fqn);
    } else if (normalizedType === 'pipeline') {
      const pipelines = await getPipelines();
      data = pipelines.find((item) => item.name === fqn || item.fqn === fqn);
    } else if (normalizedType === 'mlmodel') {
      const models = await getMlModels();
      data = models.find((item) => item.name === fqn || item.fqn === fqn);
    } else {
      const hits = await searchEntities(fqn);
      data = hits[0] || null;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: `No metadata found for ${entityType}:${fqn}`,
        details: null
      });
    }

    return res.status(200).json({ success: true, message: 'ok', details: { entityType: normalizedType, data } });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.message = `Failed to fetch metadata: ${error.message}`;
    return next(error);
  }
};

module.exports = {
  getMetadata
};
