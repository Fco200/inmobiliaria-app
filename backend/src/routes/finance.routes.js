'use strict';

const { Router } = require('express');
const goalController = require('../controllers/goal.controller');
const expenseController = require('../controllers/expense.controller');
const { protect } = require('../middlewares/auth');
const { goalRules, expenseRules, idParam } = require('../validators/finance.validators');

const goalRouter = Router();
const expenseRouter = Router();

goalRouter.use(protect);
expenseRouter.use(protect);

goalRouter.get('/', goalController.list);
goalRouter.post('/sync-auto', goalController.syncAuto);
goalRouter.post('/', goalRules, goalController.create);
goalRouter.get('/:id', idParam, goalController.get);
goalRouter.put('/:id', idParam, goalRules, goalController.update);
goalRouter.delete('/:id', idParam, goalController.remove);

expenseRouter.get('/', expenseController.list);
expenseRouter.post('/', expenseRules, expenseController.create);
expenseRouter.get('/:id', idParam, expenseController.get);
expenseRouter.put('/:id', idParam, expenseRules, expenseController.update);
expenseRouter.delete('/:id', idParam, expenseController.remove);

module.exports = { goalRouter, expenseRouter };
