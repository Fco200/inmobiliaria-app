'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Property } = require('../models');

const PUBLIC_FIELDS =
  '_id type operationType price ticketValue address zone city state description characteristics photos status createdAt';

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(24, parseInt(req.query.limit, 10) || 12);

  const filter = {
    isPublished: true,
    status: { $ne: 'inactiva' },
    price: { $gt: 0 },
  };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.operationType) filter.operationType = req.query.operationType;
  if (req.query.city) filter.city = req.query.city;
  if (req.query.zone) filter.zone = req.query.zone;
  if (req.query.minPrice) filter.price = { ...filter.price, $gte: Number(req.query.minPrice) };
  if (req.query.maxPrice) filter.price = { ...filter.price, $lte: Number(req.query.maxPrice) };
  if (req.query.q) {
    filter.$or = [
      { address: new RegExp(req.query.q, 'i') },
      { zone: new RegExp(req.query.q, 'i') },
      { city: new RegExp(req.query.q, 'i') },
      { state: new RegExp(req.query.q, 'i') },
      { description: new RegExp(req.query.q, 'i') },
    ];
  }

  const [total, items] = await Promise.all([
    Property.countDocuments(filter),
    Property.find(filter)
      .select(PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  const cities = await Property.distinct('city', { isPublished: true, city: { $ne: '' } });

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit), cities },
  });
});

const get = asyncHandler(async (req, res) => {
  const property = await Property.findOne({
    _id: req.params.id,
    isPublished: true,
    status: { $ne: 'inactiva' },
  }).select(PUBLIC_FIELDS);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Propiedad no disponible' });
  }
  res.json({ success: true, data: property });
});

module.exports = { list, get };
