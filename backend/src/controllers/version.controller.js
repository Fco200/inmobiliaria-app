'use strict';

// Controller de versión/actualizaciones de la aplicación.
//   GET /api/config/version  → versión actual + changelog (público).

const asyncHandler = require('../middlewares/asyncHandler');
const versionService = require('../services/version.service');

const getVersion = asyncHandler(async (req, res) => {
  const data = await versionService.getVersion();
  res.json({ success: true, data });
});

module.exports = { getVersion };
