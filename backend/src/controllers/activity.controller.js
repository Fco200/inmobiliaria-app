'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { ActivityLog } = require('../models');

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
  const filter = {};

  if (req.query.entityType) filter.entityType = req.query.entityType;
  if (req.query.entityId) filter.entityId = req.query.entityId;
  if (req.query.user) filter.user = req.query.user;

  const query = ActivityLog.find(filter).populate('user', 'name photo');
  const [total, items] = await Promise.all([
    ActivityLog.countDocuments(filter),
    query.skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { list };
