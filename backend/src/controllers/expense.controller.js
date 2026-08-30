'use strict';

const buildCrud = require('../utils/crud');
const { Expense } = require('../models');

const expenseCrud = buildCrud(Expense, {
  populate: ['user', 'business'],
  searchFields: ['concept', 'activity', 'observations'],
  ownerField: 'user',
});

module.exports = {
  list: expenseCrud.list,
  get: expenseCrud.get,
  create: expenseCrud.create,
  update: expenseCrud.update,
  remove: expenseCrud.remove,
};
