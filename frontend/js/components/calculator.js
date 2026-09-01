'use strict';

// Calculadora de negocio inmobiliario con dos pestañas:
//  - Hipoteca: mensualidad a partir del precio, enganche (%), plazo (años) y tasa (%).
//  - Comisión: utilidad de la operación según el % de comisión de la agencia.
// Se abre desde el botón de la barra superior (window.Calculator.open) y no
// requiere conexión a la API.
window.Calculator = (() => {
  function money(value) {
    return window.Format ? Format.currency(Number(value) || 0) : String(Number(value) || 0);
  }

  function hipoteca(price, enganchePct, years, ratePct) {
    const P = Math.max(0, (Number(price) || 0) - (Number(price) || 0) * (Number(enganchePct) || 0) / 100);
    const n = (Number(years) || 0) * 12;
    const i = (Number(ratePct) || 0) / 100 / 12;
    if (!n) return { monto: P, mensualidad: 0, total: P };
    const m = i > 0
      ? P * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1)
      : P / n;
    return { monto: P, mensualidad: m, total: m * n };
  }

  function open() {
    const modal = UI.openModal({
      title: '&#128200; Calculadora de negocio',
      size: 640,
      body: `
        <div class="process-tabs" role="tablist" aria-label="Calculadora">
          <button class="process-tab active" type="button" data-tab="hipoteca">Hipoteca</button>
          <button class="process-tab" type="button" data-tab="comision">Comisión</button>
        </div>
        <div data-pane="hipoteca" style="margin-top:16px;">
          <div class="form-group">
            <label>Precio de la propiedad</label>
            <input class="form-control" type="number" min="0" step="any" data-price placeholder="Ej. 2500000">
          </div>
          <div class="grid grid-2">
            <div class="form-group">
              <label>Enganche (%)</label>
              <input class="form-control" type="number" min="0" max="100" step="any" data-enganche value="20">
            </div>
            <div class="form-group">
              <label>Plazo (años)</label>
              <input class="form-control" type="number" min="1" max="40" step="1" data-years value="20">
            </div>
          </div>
          <div class="form-group">
            <label>Tasa anual (%)</label>
            <input class="form-control" type="number" min="0" step="any" data-rate value="10.5">
          </div>
          <div class="calc-result" data-result-hipoteca style="display:none;margin-top:8px;">
            <div class="grid grid-2">
              <div class="stat-card"><div class="stat-label">Monto a financiar</div><div class="stat-value" data-out-monto>—</div></div>
              <div class="stat-card"><div class="stat-label">Mensualidad aprox.</div><div class="stat-value" data-out-mensualidad>—</div></div>
              <div class="stat-card"><div class="stat-label">Pago total estimado</div><div class="stat-value" data-out-total>—</div></div>
            </div>
          </div>
        </div>
        <div data-pane="comision" style="margin-top:16px;display:none;">
          <div class="form-group">
            <label>Precio de la propiedad</label>
            <input class="form-control" type="number" min="0" step="any" data-cprice placeholder="Ej. 2500000">
          </div>
          <div class="grid grid-2">
            <div class="form-group">
              <label>Comisión de la agencia (%)</label>
              <input class="form-control" type="number" min="0" max="100" step="any" data-commission value="3">
            </div>
            <div class="form-group">
              <label>Parte del asesor (%)</label>
              <input class="form-control" type="number" min="0" max="100" step="any" data-asesor value="50">
            </div>
          </div>
          <div class="calc-result" data-result-comision style="display:none;margin-top:8px;">
            <div class="grid grid-2">
              <div class="stat-card"><div class="stat-label">Comisión de la agencia</div><div class="stat-value" data-out-agenciacom>—</div></div>
              <div class="stat-card"><div class="stat-label">Utilidad del asesor</div><div class="stat-value" data-out-asesorcom>—</div></div>
              <div class="stat-card"><div class="stat-label">Total de la operación</div><div class="stat-value" data-out-totalcom>—</div></div>
            </div>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" type="button" data-calc-close>Cerrar</button>
      `,
    });

    const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
    if (!overlay) return;

    const closeBtn = overlay.querySelector('[data-calc-close]');
    if (closeBtn) closeBtn.addEventListener('click', () => UI.closeModal());

    const tabs = overlay.querySelectorAll('[data-tab]');
    const panes = {
      hipoteca: overlay.querySelector('[data-pane="hipoteca"]'),
      comision: overlay.querySelector('[data-pane="comision"]'),
    };
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const key = tab.dataset.tab;
        panes.hipoteca.style.display = key === 'hipoteca' ? 'block' : 'none';
        panes.comision.style.display = key === 'comision' ? 'block' : 'none';
      });
    });

    const hipResult = overlay.querySelector('[data-result-hipoteca]');
    const recomputeHip = () => {
      const price = Number(overlay.querySelector('[data-price]').value) || 0;
      if (!price) { hipResult.style.display = 'none'; return; }
      const r = hipoteca(price, overlay.querySelector('[data-enganche]').value, overlay.querySelector('[data-years]').value, overlay.querySelector('[data-rate]').value);
      overlay.querySelector('[data-out-monto]').textContent = money(r.monto);
      overlay.querySelector('[data-out-mensualidad]').textContent = money(r.mensualidad);
      overlay.querySelector('[data-out-total]').textContent = money(r.total);
      hipResult.style.display = 'block';
    };
    overlay.querySelectorAll('[data-pane="hipoteca"] input').forEach((i) => i.addEventListener('input', recomputeHip));

    const comResult = overlay.querySelector('[data-result-comision]');
    const recomputeCom = () => {
      const price = Number(overlay.querySelector('[data-cprice]').value) || 0;
      if (!price) { comResult.style.display = 'none'; return; }
      const agency = price * (Number(overlay.querySelector('[data-commission]').value) || 0) / 100;
      const asesor = agency * (Number(overlay.querySelector('[data-asesor]').value) || 0) / 100;
      overlay.querySelector('[data-out-agenciacom]').textContent = money(agency);
      overlay.querySelector('[data-out-asesorcom]').textContent = money(asesor);
      overlay.querySelector('[data-out-totalcom]').textContent = money(price + agency);
      comResult.style.display = 'block';
    };
    overlay.querySelectorAll('[data-pane="comision"] input').forEach((i) => i.addEventListener('input', recomputeCom));
  }

  return { open };
})();