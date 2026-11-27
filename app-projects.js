let curObjId = null, curStageId = null, curEstType = 'prelim', projFilter = 'all';
let workMode = 'piece', recStream = null, recTimer = null, lastReceiptQR = '';

function renderProjectsMod() {
  if (!document.getElementById('p-view-list').classList.contains('hidden')) renderProjList();
  else if (!document.getElementById('p-view-stages').classList.contains('hidden')) renderObjStages();
  else if (!document.getElementById('p-view-stage-detail').classList.contains('hidden')) renderStageDetail();
}

function setProjFilter(f) {
  projFilter = f;
  renderProjList();
}

function backToObjList() {
  curObjId = null; curStageId = null;
  stopReceiptCam();
  document.getElementById('p-view-list').classList.remove('hidden');
  document.getElementById('p-view-stages').classList.add('hidden');
  document.getElementById('p-view-stage-detail').classList.add('hidden');
  renderProjList();
}

function getObjStatus(oid) {
  const st = stages.filter(s => s.object_id === oid);
  if (!st.length) return 'work';
  if (st.some(s => s.status === 'work')) return 'work';
  if (st.some(s => s.status === 'wait_pay')) return 'wait_pay';
  return 'done';
}

function renderProjList() {
  const stNames = { work: 'В работе', wait_pay: 'Ожидает оплаты', done: 'Завершён' };
  const list = objs.filter(o => o.id !== 1).filter(o => projFilter === 'all' || getObjStatus(o.id) === projFilter);
  document.getElementById('p-list').innerHTML = list.map(o => {
    const st = getObjStatus(o.id);
    const oStages = stages.filter(s => s.object_id === o.id);
    return `<div class="card" onclick="openObj(${o.id})" style="cursor:pointer;">
      <div class="row" style="justify-content:space-between;">
        <strong>🏗️ ${o.name}</strong>
        <span class="badge ${st}">${stNames[st]}</span>
      </div>
      <div style="font-size:12px;color:#64748b;margin-top:6px;">Этапов: ${oStages.length}</div>
    </div>`;
  }).join('') || '<div class="card" style="text-align:center;color:#94a3b8;">Нет объектов по выбранному фильтру</div>';
}

function openObj(oid) {
  curObjId = oid; curStageId = null;
  stopReceiptCam();
  document.getElementById('p-view-list').classList.add('hidden');
  document.getElementById('p-view-stage-detail').classList.add('hidden');
  document.getElementById('p-view-stages').classList.remove('hidden');
  renderObjStages();
}

function renderObjStages() {
  const o = objs.find(x => x.id === curObjId);
  if (!o) return backToObjList();
  const isWorker = user.role === 'worker';
  const stNames = { work: 'В работе', wait_pay: 'Ожидает оплаты', done: 'Завершён' };
  const oStages = stages.filter(s => s.object_id === curObjId);

  let html = `<div class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:8px;">
      <h3>🏗️ ${o.name}</h3>
      <button onclick="backToObjList()" class="btn-sm btn-dark">← Объекты</button>
    </div>
    ${!isWorker ? `<div class="row"><input id="new-stage-name" placeholder="Новый этап (напр. Черновой монтаж)" style="margin:0;"><button onclick="addStage()" class="btn-sm btn-green" style="padding:10px 14px;">+ Этап</button></div>` : ''}
  </div>`;

  html += oStages.map(s => {
    const factSum = stageItems.filter(i => i.stage_id === s.id && i.estimate_type === 'fact').reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
    return `<div class="card" onclick="openStage(${s.id})" style="cursor:pointer;">
      <div class="row" style="justify-content:space-between;">
        <strong>${s.name}</strong>
        <span class="badge ${s.status}">${stNames[s.status] || s.status}</span>
      </div>
      <div style="font-size:12px;color:#64748b;margin-top:6px;">
        Создан: ${new Date(s.created_at).toLocaleDateString('ru-RU')}
        ${s.end_date ? ' · Завершён: ' + new Date(s.end_date).toLocaleDateString('ru-RU') : ''}
        ${!isWorker ? `<br>Сумма (отчёт): <strong>${factSum.toLocaleString('ru-RU')} ₽</strong>` : ''}
      </div>
    </div>`;
  }).join('') || '<div class="card" style="text-align:center;color:#94a3b8;">Этапы пока не добавлены</div>';

  document.getElementById('p-view-stages').innerHTML = html;
}

async function addStage() {
  const name = document.getElementById('new-stage-name').value.trim();
  if (!name) return;
  await api('project_stages', 'POST', { object_id: curObjId, name, status: 'work' });
  await refresh();
}
function openStage(sid) {
  curStageId = sid;
  stopReceiptCam();
  curEstType = (user.role === 'worker') ? 'fact' : 'prelim';
  document.getElementById('p-view-stages').classList.add('hidden');
  document.getElementById('p-view-stage-detail').classList.remove('hidden');
  renderStageDetail();
}

function setEstTab(t) {
  if (user.role === 'worker') t = 'fact';
  curEstType = t;
  renderStageDetail();
}

function renderStageDetail() {
  const s = stages.find(x => x.id === curStageId);
  const o = objs.find(x => x.id === curObjId);
  if (!s || !o) return backToObjList();

  const isWorker = user.role === 'worker';
  const isAdmin = user.role === 'admin';
  const items = stageItems.filter(i => i.stage_id === s.id && i.estimate_type === curEstType);
  const pays = stagePays.filter(p => p.stage_id === s.id);
  const totalClient = items.reduce((a, b) => a + Number(b.qty || 0) * Number(b.client_price || 0), 0);
  const totalWorker = items.filter(i => i.item_kind === 'work').reduce((a, b) => a + Number(b.qty || 0) * Number(b.cost_price || 0), 0);
  const paidSum = pays.reduce((a, b) => a + Number(b.amount || 0), 0);
  const debt = Math.max(0, totalClient - paidSum);

  let html = `<div class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:6px;">
      <div><small style="color:#64748b;">${o.name}</small><h3>${s.name}</h3></div>
      <button onclick="openObj(${curObjId})" class="btn-sm btn-dark">← Этапы</button>
    </div>
    ${!isWorker ? `
      <div class="row" style="margin-bottom:8px;">
        <button onclick="setEstTab('prelim')" class="btn-sm ${curEstType === 'prelim' ? '' : 'btn-dark'}" style="flex:1;opacity:${curEstType === 'prelim' ? 1 : 0.7}">📋 КП (предвар.)</button>
        <button onclick="setEstTab('fact')" class="btn-sm ${curEstType === 'fact' ? 'btn-green' : 'btn-dark'}" style="flex:1;opacity:${curEstType === 'fact' ? 1 : 0.7}">📑 Отчёт (факт)</button>
      </div>
      <div class="row" style="margin-bottom:8px;">
        <button onclick="exportStagePDF('prelim')" class="btn-sm btn-amber" style="flex:1;">📄 КП в PDF</button>
        <button onclick="exportStagePDF('fact')" class="btn-sm btn-purple" style="flex:1;">📄 Отчёт в PDF</button>
      </div>
      <div style="font-size:13px;background:#f8fafc;padding:8px;border-radius:10px;">
        Итого для заказчика: <strong>${totalClient.toLocaleString('ru-RU')} ₽</strong> ·
        Оплачено: <strong style="color:#059669;">${paidSum.toLocaleString('ru-RU')} ₽</strong> ·
        Остаток: <strong style="color:#e11d48;">${debt.toLocaleString('ru-RU')} ₽</strong>
      </div>
    ` : `<div style="font-size:13px;background:#f0fdf4;padding:8px;border-radius:10px;color:#065f46;">📑 Фактически выполненные работы и материалы (ваша ЗП по работам: <strong>${totalWorker.toLocaleString('ru-RU')} ₽</strong>)</div>`}
  </div>`;

  html += `<div class="card">
    <h4>➕ Добавить работу из прайса</h4>
    <select id="si-wt"></select>
    <div class="row"><input id="si-wt-qty" type="number" step="any" value="1" placeholder="Кол-во"><button onclick="addStageWorkItem()" class="btn-sm btn-green" style="padding:10px 14px;">Добавить</button></div>
    <hr style="margin:10px 0;border:none;border-top:1px solid #e2e8f0;">
    <h4>➕ Добавить материал / расход</h4>
    <input id="si-m-name" placeholder="Наименование материала">
    <div class="row">
      <input id="si-m-qty" type="number" step="any" placeholder="Кол-во">
      <select id="si-m-unit" style="max-width:110px;">
        <option value="шт">шт</option><option value="м">м</option><option value="кв.м">кв.м</option>
        <option value="комплекс">комплекс</option><option value="услуга">услуга</option>
      </select>
    </div>
    <div class="row">
      <input id="si-m-cost" type="number" step="any" placeholder="${isWorker ? 'Ваша ставка/сумма, ₽' : 'Закупка, ₽'}">
      ${!isWorker ? `<input id="si-m-client" type="number" step="any" placeholder="Цена клиенту, ₽">` : ''}
    </div>
    <button onclick="addStageMatItem()" class="btn-green">Сохранить позицию</button>
    ${curEstType === 'fact' ? `
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #cbd5e1;">
        <button onclick="toggleReceiptScan()" class="btn-amber">📷 Сканировать QR чека (добавить материал)</button>
        <div id="rec-scan-box" class="hidden" style="margin-top:8px;">
          <video id="rec-video" style="width:100%;border-radius:10px;margin-bottom:6px;"></video>
          <input id="rec-qr-txt" placeholder="Данные QR чека (или введите вручную)">
          <input id="rec-sum" type="number" step="any" placeholder="Сумма по чеку, ₽">
          <button onclick="saveReceiptItem()" class="btn-green">Добавить материал по чеку</button>
        </div>
      </div>
    ` : ''}
  </div>`;

  html += `<div class="card"><h4>📋 Позиции (${curEstType === 'prelim' ? 'КП' : 'Отчёт'})</h4>` + (items.map(it => {
    const lineClient = Number(it.qty || 0) * Number(it.client_price || 0);
    const lineCost = Number(it.qty || 0) * Number(it.cost_price || 0);
    return `<div class="list-row">
      <div>
        <strong>${it.name}</strong> <span class="badge stock">${it.item_kind === 'work' ? 'Работа' : 'Материал'}</span><br>
        <small style="color:#64748b;">Кол-во: ${Number(it.qty)} ${it.unit || 'шт'}${isWorker ? (it.item_kind === 'work' ? ` · ЗП: ${lineCost.toLocaleString('ru-RU')} ₽` : '') : ` · Клиенту: ${lineClient.toLocaleString('ru-RU')} ₽`}</small>
      </div>
      <button onclick="delStageItem(${it.id})" class="btn-sm btn-red">✕</button>
    </div>`;
  }).join('') || '<div style="font-size:12px;color:#94a3b8;">Позиций пока нет</div>') + `</div>`;

  if (!isWorker) {
    html += `<div class="card">
      <h4>💳 Оплаты от заказчика по этапу</h4>
      <div class="row"><input id="spay-amt" type="number" placeholder="Сумма, ₽"><input id="spay-note" placeholder="Комментарий"></div>
      <button onclick="addStagePay()" class="btn-green">Внести оплату</button>
      <div style="margin-top:8px;">` + (pays.map(p => `
        <div class="list-row">
          <div><strong>+${Number(p.amount).toLocaleString('ru-RU')} ₽</strong> <small style="color:#64748b;">${new Date(p.created_at).toLocaleDateString('ru-RU')} ${p.comment ? '· ' + p.comment : ''}</small></div>
          <div class="row">
            <button onclick="editStagePayModal(${p.id})" class="btn-sm">✏️</button>
            <button onclick="delStagePay(${p.id})" class="btn-sm btn-red">✕</button>
          </div>
        </div>`).join('') || '<div style="font-size:12px;color:#94a3b8;">Оплат по этапу пока нет</div>') + `</div>
      ${isAdmin && s.status !== 'done' ? `<button onclick="completeStage(${s.id})" class="btn-dark" style="margin-top:10px;">✅ Завершить этап и вернуть остатки на склад</button>` : ''}
    </div>`;
  }

  document.getElementById('p-view-stage-detail').innerHTML = html;
  document.getElementById('si-wt').innerHTML = wTypes.map(w => {
    const priceLabel = isWorker ? `${w.rate} ₽/${w.unit}` : `${w.client_rate} ₽/${w.unit}`;
    return `<option value="${w.id}">${w.name} — ${priceLabel}</option>`;
  }).join('');
}
async function addStageWorkItem() {
  const wt = wTypes.find(x => x.id === Number(document.getElementById('si-wt').value));
  const qty = Number(document.getElementById('si-wt-qty').value) || 0;
  if (!wt || qty <= 0) return;
  await api('stage_items', 'POST', {
    stage_id: curStageId, estimate_type: curEstType, item_kind: 'work',
    name: wt.name, unit: wt.unit || 'шт', qty,
    cost_price: Number(wt.rate || 0), client_price: Number(wt.client_rate || 0)
  });
  await refresh();
}

async function addStageMatItem() {
  const name = document.getElementById('si-m-name').value.trim();
  const qty = Number(document.getElementById('si-m-qty').value) || 0;
  const unit = document.getElementById('si-m-unit').value;
  const cost = Number(document.getElementById('si-m-cost').value) || 0;
  const clientInp = document.getElementById('si-m-client');
  const client = clientInp ? (Number(clientInp.value) || cost) : cost;
  if (!name || qty <= 0) return alert('Укажите название и количество');
  await api('stage_items', 'POST', {
    stage_id: curStageId, estimate_type: curEstType, item_kind: 'mat',
    name, unit, qty, cost_price: cost, client_price: client
  });
  await refresh();
}

async function delStageItem(id) {
  await api('stage_items?id=eq.' + id, 'DELETE');
  await refresh();
}

async function addStagePay() {
  const amount = Number(document.getElementById('spay-amt').value) || 0;
  const comment = document.getElementById('spay-note').value.trim();
  if (amount <= 0) return alert('Укажите сумму оплаты');
  await api('stage_payments', 'POST', { stage_id: curStageId, object_id: curObjId, amount, comment });

  const s = stages.find(x => x.id === curStageId);
  const factTotal = stageItems.filter(i => i.stage_id === curStageId && i.estimate_type === 'fact').reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
  const paidAfter = stagePays.filter(p => p.stage_id === curStageId).reduce((a, b) => a + Number(b.amount), 0) + amount;
  if (s && s.status === 'work' && paidAfter > 0 && paidAfter < factTotal) {
    await api('project_stages?id=eq.' + curStageId, 'PATCH', { status: 'wait_pay' });
  }
  await refresh();
}

function editStagePayModal(id) {
  const p = stagePays.find(x => x.id === id);
  if (!p) return;
  openModal(`
    <h3>✏️ Редактировать оплату</h3>
    <input id="ed-spay-amt" type="number" value="${Number(p.amount)}">
    <input id="ed-spay-note" value="${p.comment || ''}" placeholder="Комментарий">
    <div class="row"><button onclick="saveStagePay(${id})" class="btn-green">Сохранить</button><button onclick="closeModal()" class="btn-red">Отмена</button></div>
  `);
}

async function saveStagePay(id) {
  await api('stage_payments?id=eq.' + id, 'PATCH', {
    amount: Number(document.getElementById('ed-spay-amt').value) || 0,
    comment: document.getElementById('ed-spay-note').value.trim()
  });
  closeModal();
  await refresh();
}

async function delStagePay(id) {
  if (!confirm('Удалить эту оплату?')) return;
  await api('stage_payments?id=eq.' + id, 'DELETE');
  await refresh();
}

async function completeStage(sid) {
  if (!confirm('Завершить этап? Если в КП материала было больше, чем в отчёте, остаток вернётся на склад.')) return;
  const prelimMats = stageItems.filter(i => i.stage_id === sid && i.estimate_type === 'prelim' && i.item_kind === 'mat');
  const factMats = stageItems.filter(i => i.stage_id === sid && i.estimate_type === 'fact' && i.item_kind === 'mat');

  for (const pm of prelimMats) {
    const used = factMats.filter(fm => fm.name.toLowerCase() === pm.name.toLowerCase()).reduce((a, b) => a + Number(b.qty), 0);
    const left = Number(pm.qty) - used;
    if (left > 0) {
      const existing = cons.find(c => c.name.toLowerCase() === pm.name.toLowerCase());
      if (existing) {
        await api('consumables?id=eq.' + existing.id, 'PATCH', { qty: Number(existing.qty) + left });
      } else {
        await api('consumables', 'POST', { name: pm.name, qty: left, unit: pm.unit || 'шт' });
      }
      await api('tool_logs', 'POST', { action: `Возврат остатка со стройки: ${pm.name} (+${left} ${pm.unit || 'шт'})`, user_name: user.name });
    }
  }

  await api('project_stages?id=eq.' + sid, 'PATCH', { status: 'done', end_date: new Date().toISOString() });
  await refresh();
}
function toggleReceiptScan() {
  const box = document.getElementById('rec-scan-box');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) startReceiptCam();
  else stopReceiptCam();
}

async function startReceiptCam() {
  try {
    const vid = document.getElementById('rec-video');
    recStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    vid.srcObject = recStream;
    await vid.play();
    const cvs = document.createElement('canvas'), ctx = cvs.getContext('2d');
    recTimer = setInterval(() => {
      if (vid.readyState === vid.HAVE_ENOUGH_DATA && typeof jsQR !== 'undefined') {
        cvs.width = vid.videoWidth; cvs.height = vid.videoHeight;
        ctx.drawImage(vid, 0, 0);
        const code = jsQR(ctx.getImageData(0, 0, cvs.width, cvs.height).data, cvs.width, cvs.height);
        if (code && code.data) {
          lastReceiptQR = code.data;
          document.getElementById('rec-qr-txt').value = code.data;
          const m = code.data.match(/s=([0-9.]+)/);
          if (m) document.getElementById('rec-sum').value = m.at(1);
          stopReceiptCam();
        }
      }
    }, 300);
  } catch (e) {}
}

function stopReceiptCam() {
  if (recTimer) { clearInterval(recTimer); recTimer = null; }
  if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }
}

async function saveReceiptItem() {
  const qr = document.getElementById('rec-qr-txt').value.trim();
  const sum = Number(document.getElementById('rec-sum').value) || 0;
  if (sum <= 0) return alert('Укажите сумму по чеку');
  await api('stage_items', 'POST', {
    stage_id: curStageId, estimate_type: 'fact', item_kind: 'mat',
    name: qr ? `Материалы по чеку (${qr.slice(0, 24)}...)` : 'Материалы по чеку',
    unit: 'комплекс', qty: 1, cost_price: sum, client_price: sum
  });
  await refresh();
}

function exportStagePDF(type) {
  if (typeof html2pdf === 'undefined') return alert('Библиотека PDF ещё загружается');
  const s = stages.find(x => x.id === curStageId);
  const o = objs.find(x => x.id === curObjId);
  if (!s || !o) return;

  const items = stageItems.filter(i => i.stage_id === s.id && i.estimate_type === type);
  const works = items.filter(i => i.item_kind === 'work');
  const mats = items.filter(i => i.item_kind === 'mat');
  const wSum = works.reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
  const mSum = mats.reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
  const totalAll = wSum + mSum;

  const title = type === 'prelim' ? 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ' : 'ОТЧЁТ О ВЫПОЛНЕННЫХ РАБОТАХ И МАТЕРИАЛАХ';
  const prefix = type === 'prelim' ? 'КП' : 'Отчет';

  const makeRows = arr => arr.map((x, idx) => `
    <tr>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center;">${idx + 1}</td>
      <td style="border:1px solid #94a3b8;padding:6px;">${x.name}</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center;">${x.unit || 'шт'}</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center;">${Number(x.qty)}</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:right;">${Number(x.client_price).toLocaleString('ru-RU')} ₽</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:right;font-weight:bold;">${(Number(x.qty) * Number(x.client_price)).toLocaleString('ru-RU')} ₽</td>
    </tr>`).join('');

  const tableHead = `<tr style="background:#f1f5f9;">
    <th style="border:1px solid #94a3b8;padding:6px;width:36px;">№</th>
    <th style="border:1px solid #94a3b8;padding:6px;text-align:left;">Наименование</th>
    <th style="border:1px solid #94a3b8;padding:6px;width:65px;">Ед. изм.</th>
    <th style="border:1px solid #94a3b8;padding:6px;width:65px;">Кол-во</th>
    <th style="border:1px solid #94a3b8;padding:6px;width:95px;text-align:right;">Цена</th>
    <th style="border:1px solid #94a3b8;padding:6px;width:105px;text-align:right;">Сумма</th>
  </tr>`;

  const box = document.getElementById('pdf-render-box');
  box.innerHTML = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;width:680px;">
      <h2 style="margin-bottom:6px;font-size:18px;">${title}</h2>
      <p style="font-size:13px;color:#334155;margin-bottom:14px;">Объект: <strong>${o.name}</strong> · Этап: <strong>${s.name}</strong> · Дата: ${new Date().toLocaleDateString('ru-RU')}</p>
      ${works.length ? `<h4 style="margin:10px 0 6px;font-size:14px;">1. Работы</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;">${tableHead}${makeRows(works)}</table>
        <p style="text-align:right;font-size:13px;margin-bottom:12px;">Итого по работам: <strong>${wSum.toLocaleString('ru-RU')} ₽</strong></p>` : ''}
      ${mats.length ? `<h4 style="margin:10px 0 6px;font-size:14px;">2. Материалы и комплектующие</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;">${tableHead}${makeRows(mats)}</table>
        <p style="text-align:right;font-size:13px;margin-bottom:12px;">Итого по материалам: <strong>${mSum.toLocaleString('ru-RU')} ₽</strong></p>` : ''}
      <div style="margin-top:14px;padding:12px;background:#f8fafc;border:1px solid #94a3b8;text-align:right;font-size:16px;">
        Итого по смете: <strong>${totalAll.toLocaleString('ru-RU')} ₽</strong>
      </div>
    </div>`;

  const cleanName = `${prefix}_${o.name}_${s.name}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
  html2pdf().from(box.firstElementChild).set({
    margin: 10,
    filename: cleanName,
    html2canvas: { scale: 2, scrollX: 0, scrollY: 0, windowWidth: 800 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).save();
}
function renderSalaryMod() {
  const isWorker = user.role === 'worker';
  const isForeman = user.role === 'foreman';
  const isAdmin = user.role === 'admin';

  document.getElementById('s-worker-form').classList.toggle('hidden', !isWorker && !isForeman);
  document.getElementById('s-approve-box').classList.toggle('hidden', !isAdmin && !isForeman);
  document.getElementById('s-admin-box').classList.toggle('hidden', !isAdmin);

  if (isWorker || isForeman) {
    const objSel = document.getElementById('sw-obj');
    objSel.innerHTML = objs.filter(o => o.id !== 1 && o.status !== 'done').map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    fillWorkStages();
    document.getElementById('sw-type').innerHTML = wTypes.map(w => `<option value="${w.id}">${w.name} (${w.rate} ₽/${w.unit || 'шт'})</option>`).join('');
    setWorkMode(workMode);
  }

  if (isAdmin || isForeman) {
    const pend = wLogs.filter(w => w.status === 'pending');
    document.getElementById('s-pending-list').innerHTML = pend.map(w => {
      const emp = emps.find(e => e.id === w.employee_id);
      const st = stages.find(s => s.id === w.stage_id);
      const ob = objs.find(o => o.id === w.object_id);
      return `<div class="list-row">
        <div>
          <strong>${emp ? emp.name : 'Сотрудник'}</strong> · <strong>${Number(w.total).toLocaleString('ru-RU')} ₽</strong><br>
          <small style="color:#64748b;">${w.work_name} (${w.qty} ${w.unit || 'шт'}) · ${ob ? ob.name : ''} ${st ? '· ' + st.name : ''}${w.comment ? ' · ' + w.comment : ''}</small>
        </div>
        <div class="row">
          <button onclick="approveWork(${w.id})" class="btn-sm btn-green">✓</button>
          <button onclick="rejectWork(${w.id})" class="btn-sm btn-red">✕</button>
        </div>
      </div>`;
    }).join('') || '<div style="font-size:12px;color:#94a3b8;">Нет работ на проверке</div>';
  }

  if (isAdmin) {
    document.getElementById('sp-emp').innerHTML = emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    if (!document.getElementById('sp-date').value) {
      document.getElementById('sp-date').value = new Date().toISOString().slice(0, 10);
    }

    document.getElementById('s-debt-list').innerHTML = emps.map(e => {
      const earned = wLogs.filter(w => w.employee_id === e.id && w.status === 'approved').reduce((s, w) => s + Number(w.total || 0), 0);
      const paid = salPays.filter(p => p.employee_id === e.id).reduce((s, p) => s + Number(p.amount || 0), 0);
      const debt = earned - paid;
      return `<div class="list-row">
        <div>
          <strong>${e.name}</strong><br>
          <small style="color:#64748b;">Начислено: ${earned.toLocaleString('ru-RU')} ₽ · Выплачено: ${paid.toLocaleString('ru-RU')} ₽</small>
        </div>
        <strong style="color:${debt > 0 ? '#e11d48' : '#059669'};">${debt.toLocaleString('ru-RU')} ₽</strong>
      </div>`;
    }).join('');

    document.getElementById('s-pay-history').innerHTML = salPays.map(p => {
      const e = emps.find(x => x.id === p.employee_id);
      return `<div class="list-row">
        <div>
          <strong>${e ? e.name : 'Сотрудник'}</strong> · <strong>${Number(p.amount).toLocaleString('ru-RU')} ₽</strong><br>
          <small style="color:#64748b;">${p.pay_date || new Date(p.created_at).toLocaleDateString('ru-RU')} ${p.comment ? '· ' + p.comment : ''}</small>
        </div>
        <div class="row">
          <button onclick="editPayModal(${p.id})" class="btn-sm">✏️</button>
          <button onclick="delPay(${p.id})" class="btn-sm btn-red">✕</button>
        </div>
      </div>`;
    }).join('') || '<div style="font-size:12px;color:#94a3b8;">Выплат пока нет</div>';
  }
}
function fillWorkStages() {
  const oid = Number(document.getElementById('sw-obj').value);
  const list = stages.filter(s => s.object_id === oid);
  document.getElementById('sw-stage').innerHTML = list.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

function setWorkMode(mode) {
  workMode = mode;
  document.getElementById('sw-piece-box').classList.toggle('hidden', mode !== 'piece');
  document.getElementById('sw-shift-box').classList.toggle('hidden', mode !== 'shift');
  calcWorkSum();
}

function calcWorkSum() {
  const info = document.getElementById('sw-calc-info');
  if (workMode === 'shift') {
    const days = Number(document.getElementById('sw-days').value) || 0;
    const dayRate = user.salary_type === 'day' ? Number(user.base_salary || 0) : 0;
    const sum = days * dayRate;
    info.textContent = `К начислению за смену: ${sum.toLocaleString('ru-RU')} ₽ (ставка: ${dayRate.toLocaleString('ru-RU')} ₽/день)`;
    return sum;
  }
  const wt = wTypes.find(x => x.id === Number(document.getElementById('sw-type').value));
  const qty = Number(document.getElementById('sw-qty').value) || 0;
  const sum = wt ? qty * Number(wt.rate || 0) : 0;
  info.textContent = `К начислению: ${sum.toLocaleString('ru-RU')} ₽`;
  return sum;
}

async function submitWork() {
  const object_id = Number(document.getElementById('sw-obj').value);
  const stage_id = Number(document.getElementById('sw-stage').value) || null;
  const comment = document.getElementById('sw-note').value.trim();
  if (!object_id) return alert('Выберите объект');

  if (workMode === 'shift') {
    const days = Number(document.getElementById('sw-days').value) || 0;
    if (days <= 0) return alert('Укажите количество смен');
    const rate = user.salary_type === 'day' ? Number(user.base_salary || 0) : 0;
    const total = days * rate;
    await api('work_logs', 'POST', {
      employee_id: user.id, object_id, stage_id,
      work_name: 'Смена (оклад за день)', unit: 'смена',
      qty: days, rate, total, comment, status: 'pending'
    });
    document.getElementById('sw-note').value = '';
    await refresh();
    return;
  }

  const wt = wTypes.find(x => x.id === Number(document.getElementById('sw-type').value));
  const qty = Number(document.getElementById('sw-qty').value) || 0;
  if (!wt || qty <= 0) return alert('Выберите работу и укажите количество');
  const rate = Number(wt.rate || 0);
  await api('work_logs', 'POST', {
    employee_id: user.id, object_id, stage_id,
    work_name: wt.name, unit: wt.unit || 'шт',
    qty, rate, total: qty * rate, comment, status: 'pending'
  });
  document.getElementById('sw-qty').value = '';
  document.getElementById('sw-note').value = '';
  await refresh();
}
async function approveWork(id) {
  const w = wLogs.find(x => x.id === id);
  await api('work_logs?id=eq.' + id, 'PATCH', { status: 'approved' });
  if (w && w.stage_id && w.unit !== 'смена') {
    const wt = wTypes.find(x => x.name === w.work_name);
    await api('stage_items', 'POST', {
      stage_id: w.stage_id, estimate_type: 'fact', item_kind: 'work',
      name: w.work_name, unit: w.unit || 'шт', qty: Number(w.qty),
      cost_price: Number(w.rate), client_price: wt ? Number(wt.client_rate || 0) : 0
    });
  }
  await refresh();
}

async function rejectWork(id) {
  await api('work_logs?id=eq.' + id, 'DELETE');
  await refresh();
}

async function addPayment() {
  const employee_id = Number(document.getElementById('sp-emp').value);
  const amount = Number(document.getElementById('sp-amount').value) || 0;
  const pay_date = document.getElementById('sp-date').value || new Date().toISOString().slice(0, 10);
  const comment = document.getElementById('sp-note').value.trim();
  if (!employee_id || amount <= 0) return alert('Укажите сотрудника и сумму');
  await api('salary_payments', 'POST', { employee_id, amount, pay_date, comment });
  document.getElementById('sp-amount').value = '';
  document.getElementById('sp-note').value = '';
  await refresh();
}

function editPayModal(id) {
  const p = salPays.find(x => x.id === id);
  if (!p) return;
  openModal(`
    <h3>✏️ Редактировать выплату</h3>
    <input id="ed-pay-amt" type="number" value="${Number(p.amount)}">
    <input id="ed-pay-date" type="date" value="${p.pay_date || ''}">
    <input id="ed-pay-note" value="${p.comment || ''}" placeholder="Комментарий">
    <div class="row"><button onclick="savePay(${id})" class="btn-green">Сохранить</button><button onclick="closeModal()" class="btn-red">Отмена</button></div>
  `);
}

async function savePay(id) {
  await api('salary_payments?id=eq.' + id, 'PATCH', {
    amount: Number(document.getElementById('ed-pay-amt').value) || 0,
    pay_date: document.getElementById('ed-pay-date').value,
    comment: document.getElementById('ed-pay-note').value.trim()
  });
  closeModal();
  await refresh();
}

async function delPay(id) {
  if (!confirm('Удалить запись о выплате?')) return;
  await api('salary_payments?id=eq.' + id, 'DELETE');
  await refresh();
}
function renderOverheads() {
  if (!document.getElementById('oh-date').value) {
    document.getElementById('oh-date').value = new Date().toISOString().slice(0, 10);
  }
  const cats = ['Бензин/ГСМ', 'Аренда гаража', 'Расходы на авто', 'Спецодежда', 'Ремонт инструмента', 'Прочее'];
  const colors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#e11d48', '#475569'];
  const totals = cats.map(c => overheads.filter(o => o.category === c).reduce((s, o) => s + Number(o.amount || 0), 0));
  const maxVal = Math.max(...totals, 1);

  document.getElementById('oh-chart').innerHTML = cats.map((c, i) => {
    const pct = Math.round((totals[i] / maxVal) * 100);
    return `<div style="margin-bottom:8px;">
      <div class="row" style="justify-content:space-between;font-size:12px;"><span>${c}</span><strong>${totals[i].toLocaleString('ru-RU')} ₽</strong></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${colors[i]};"></div></div>
    </div>`;
  }).join('');

  const q = (document.getElementById('oh-search')?.value || '').trim().toLowerCase();
  const filtered = overheads.filter(o => !q || (o.category || '').toLowerCase().includes(q) || (o.comment || '').toLowerCase().includes(q));
  document.getElementById('oh-list').innerHTML = filtered.map(o => `
    <div class="list-row">
      <div>
        <strong>${o.category}</strong> · <strong>${Number(o.amount).toLocaleString('ru-RU')} ₽</strong><br>
        <small style="color:#64748b;">${o.expense_date || ''} ${o.comment ? '· ' + o.comment : ''}</small>
      </div>
      <div class="row">
        <button onclick="editOverheadModal(${o.id})" class="btn-sm">✏️</button>
        <button onclick="delOverhead(${o.id})" class="btn-sm btn-red">✕</button>
      </div>
    </div>`).join('') || '<div style="font-size:12px;color:#94a3b8;">Расходов не найдено</div>';
}

async function addOverhead() {
  const category = document.getElementById('oh-cat').value;
  const amount = Number(document.getElementById('oh-amount').value) || 0;
  const expense_date = document.getElementById('oh-date').value || new Date().toISOString().slice(0, 10);
  const comment = document.getElementById('oh-note').value.trim();
  if (amount <= 0) return alert('Укажите сумму расхода');
  await api('overhead_expenses', 'POST', { category, amount, expense_date, comment });
  document.getElementById('oh-amount').value = '';
  document.getElementById('oh-note').value = '';
  await refresh();
}

function editOverheadModal(id) {
  const o = overheads.find(x => x.id === id);
  if (!o) return;
  const cats = ['Бензин/ГСМ', 'Аренда гаража', 'Расходы на авто', 'Спецодежда', 'Ремонт инструмента', 'Прочее'];
  openModal(`
    <h3>✏️ Редактировать расход</h3>
    <select id="ed-oh-cat">${cats.map(c => `<option value="${c}" ${o.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <input id="ed-oh-amt" type="number" value="${Number(o.amount)}">
    <input id="ed-oh-date" type="date" value="${o.expense_date || ''}">
    <input id="ed-oh-note" value="${o.comment || ''}" placeholder="Комментарий">
    <div class="row"><button onclick="saveOverhead(${id})" class="btn-green">Сохранить</button><button onclick="closeModal()" class="btn-red">Отмена</button></div>
  `);
}

async function saveOverhead(id) {
  await api('overhead_expenses?id=eq.' + id, 'PATCH', {
    category: document.getElementById('ed-oh-cat').value,
    amount: Number(document.getElementById('ed-oh-amt').value) || 0,
    expense_date: document.getElementById('ed-oh-date').value,
    comment: document.getElementById('ed-oh-note').value.trim()
  });
  closeModal();
  await refresh();
}

async function delOverhead(id) {
  if (!confirm('Удалить запись о расходе?')) return;
  await api('overhead_expenses?id=eq.' + id, 'DELETE');
  await refresh();
}

function initReports() {
  document.getElementById('rep-obj').innerHTML = '<option value="all">Все объекты</option>' + objs.filter(o => o.id !== 1).map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  document.getElementById('rep-emp').innerHTML = '<option value="all">Все сотрудники</option>' + emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  renderReports();
}

function getFilteredReportData() {
  const from = document.getElementById('rep-from').value;
  const to = document.getElementById('rep-to').value;
  const oid = document.getElementById('rep-obj').value;
  const eid = document.getElementById('rep-emp').value;
  const inRange = d => {
    if (!d) return true;
    const day = String(d).slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };
  const pays = stagePays.filter(p => inRange(p.created_at) && (oid === 'all' || Number(p.object_id) === Number(oid)));
  const works = wLogs.filter(w => w.status === 'approved' && inRange(w.created_at) && (oid === 'all' || Number(w.object_id) === Number(oid)) && (eid === 'all' || Number(w.employee_id) === Number(eid)));
  const oh = overheads.filter(o => inRange(o.expense_date));
  return { pays, works, oh };
}

function renderReports() {
  const { pays, works, oh } = getFilteredReportData();
  const inc = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const wSum = works.reduce((s, w) => s + Number(w.total || 0), 0);
  const ohSum = oh.reduce((s, o) => s + Number(o.amount || 0), 0);
  const bal = inc - wSum - ohSum;

  document.getElementById('rep-summary').innerHTML = `
    <h3>📈 Финансовая сводка</h3>
    <div class="list-row"><span>Поступило от заказчиков:</span><strong style="color:#059669;">${inc.toLocaleString('ru-RU')} ₽</strong></div>
    <div class="list-row"><span>Подтверждённая ЗП работникам:</span><strong>${wSum.toLocaleString('ru-RU')} ₽</strong></div>
    <div class="list-row"><span>Накладные расходы:</span><strong>${ohSum.toLocaleString('ru-RU')} ₽</strong></div>
    <div class="list-row"><span>Итоговый баланс за период:</span><strong style="color:${bal >= 0 ? '#059669' : '#e11d48'};">${bal.toLocaleString('ru-RU')} ₽</strong></div>
  `;
}

function exportReportExcel() {
  if (typeof XLSX === 'undefined') return alert('Excel библиотека не загружена');
  const { pays, works, oh } = getFilteredReportData();
  const inc = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const wSum = works.reduce((s, w) => s + Number(w.total || 0), 0);
  const ohSum = oh.reduce((s, o) => s + Number(o.amount || 0), 0);
  const ws = XLSX.utils.aoa_to_sheet([
    ['Показатель', 'Сумма, ₽'],
    ['Поступило от заказчиков', inc],
    ['Подтверждённая ЗП работникам', wSum],
    ['Накладные расходы', ohSum],
    ['Итоговый баланс', inc - wSum - ohSum]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Отчёт');
  XLSX.writeFile(wb, 'Финансовый_отчет.xlsx');
}
