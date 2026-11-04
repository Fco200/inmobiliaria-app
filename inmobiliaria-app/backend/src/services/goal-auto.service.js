'use strict';

const { Goal, Business } = require('../models');

function inRange(date, start, end) {
  if (!date) return false;
  const t = new Date(date).getTime();
  return t >= new Date(start).getTime() && t <= new Date(end).getTime();
}

// Recalcula automáticamente el avance de las metas activas usando los negocios
// concluidos dentro de su periodo (monto de cierre, comisiones y número de tickets).
async function updateGoalsAuto() {
  const goals = await Goal.find({ status: 'activa' });
  const now = new Date();
  let updated = 0;

  for (const goal of goals) {
    const businesses = await Business.find({
      status: 'concluido',
      $or: [
        { mainAdvisor: goal.user },
        { partnerAdvisor: goal.user },
        { 'closing.participants.user': goal.user },
      ],
    });

    let amount = 0;
    let commission = 0;
    let count = 0;

    businesses.forEach((b) => {
      const closing = b.closing || {};
      if (!inRange(closing.closingDate, goal.startDate, goal.endDate)) return;
      const participants = closing.participants || [];
      const closingAmount = Number(closing.closingAmount) || 0;
      const closingCommission = Number(closing.commission) || 0;
      const isMain = String(b.mainAdvisor) === String(goal.user);

      if (participants.length) {
        const p = participants.find((x) => String(x.user) === String(goal.user));
        if (!p) return;
        const share = Number(p.share) || 0;
        amount += closingAmount * (share / 100);
        commission += closingCommission * (share / 100);
      } else if (isMain) {
        amount += closingAmount;
        commission += closingCommission;
      } else {
        return;
      }
      count += 1;
    });

    goal.currentResult = Math.round(amount);
    goal.ticketsGenerated = count;
    goal.ticketsCollected = Math.round(commission);

    if (goal.endDate && new Date(goal.endDate).getTime() < now.getTime()) {
      goal.status = goal.currentResult >= goal.objectiveAmount ? 'cumplida' : 'vencida';
    } else if (goal.currentResult >= goal.objectiveAmount) {
      goal.status = 'cumplida';
    }

    await goal.save();
    updated += 1;
  }

  return updated;
}

module.exports = { updateGoalsAuto };
