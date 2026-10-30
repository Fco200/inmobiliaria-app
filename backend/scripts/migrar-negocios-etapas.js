'use strict';
const connectDB = require('../src/config/db');
const { Business, BusinessStage } = require('../src/models');
const MAP = {
  nuevo: 'INTEGRACION', prospecto: 'INTEGRACION', contactado: 'INTEGRACION', seguimiento: 'INTEGRACION', cita: 'INTEGRACION',
  negociacion: 'INTEGRACION', contrato: 'INTEGRACION', captacion: 'INTEGRACION', integracion_expedientes: 'INTEGRACION',
  promesa: 'AVALUO', integracion: 'INTEGRACION', avaluo: 'AVALUO', revision: 'REVISION_AVALUO', notarias: 'INSCRIPCION',
  firma: 'FIRMA', pago: 'PAGO', entrega: 'ENTREGA', postventa: 'ENTREGA', PAUSA: 'PAUSA', CANCELADO_DEFINITIVO: 'CANCELADO_DEFINITIVO'
};
async function migrar(){
  const conn = await connectDB();
  if(!conn){ console.error('sin'); return false; }
  const neg = await Business.find({}).select('_id currentStage');
  let u = 0;
  for(const b of neg){
    const o = b.currentStage;
    if(!o || o==='concluido' || o==='cancelado' || o==='PAUSA' || o==='CANCELADO_DEFINITIVO') continue;
    if(MAP[o]){ b.currentStage = MAP[o]; await b.save(); u++; continue; }
    if(['INTEGRACION','AVALUO','REVISION_AVALUO','INSCRIPCION','DICTAMEN','FIRMA','PAGO','ENTREGA'].includes(o)) continue;
    b.currentStage = 'INTEGRACION'; await b.save(); u++;
  }
  console.log('neg', u);
  const est = await BusinessStage.find({});
  for(const s of est){
    const o = s.stageCode;
    if(!o || o==='concluido' || o==='cancelado' || o==='PAUSA' || o==='CANCELADO_DEFINITIVO') continue;
    if(MAP[o]){
      s.stageCode = MAP[o];
      if(s.stageCode==='REVISION_AVALUO') s.name='Revisión avalúo';
      if(s.stageCode==='INTEGRACION') s.name='Integración';
      if(s.stageCode==='AVALUO') s.name='Avalúo';
      if(s.stageCode==='INSCRIPCION') s.name='Inscripción';
      if(s.stageCode==='DICTAMEN') s.name='Dictamen';
      if(s.stageCode==='FIRMA') s.name='Firma';
      if(s.stageCode==='PAGO') s.name='Pago';
      if(s.stageCode==='ENTREGA') s.name='Entrega';
      await s.save();
    }else if(!['INTEGRACION','AVALUO','REVISION_AVALUO','INSCRIPCION','DICTAMEN','FIRMA','PAGO','ENTREGA'].includes(o)){
      s.stageCode='INTEGRACION'; s.name='Integración'; await s.save();
    }
  }
  console.log('ok');
  await conn.close();
  return true;
}
if(require.main===module){ migrar().then(x=>process.exit(x?0:1)); }
module.exports={migrar};
