'use strict';

const { ActivityLog, AuditLog } = require('../models');

async function logActivity({ entityType, entityId, user, action, message = '', data = null }) {
  try {
    await ActivityLog.create({ entityType, entityId, user, action, message, data });
  } catch (error) {
    console.error('No se pudo registrar actividad:', error.message);
  }
}

async function logAudit({ user, action, entity, entityId, field = null, previousValue = null, newValue = null, ip = '' }) {
  try {
    await AuditLog.create({ user, action, entity, entityId, field, previousValue, newValue, ip });
  } catch (error) {
    console.error('No se pudo registrar auditoría:', error.message);
  }
}

module.exports = { logActivity, logAudit };
