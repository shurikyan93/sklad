let curObjId = null, curStageId = null, curEstType = 'prelim', projFilter = 'all';
let workMode = 'piece', recStream = null, recTimer = null, lastReceiptQR = '';

function renderProjectsMod() {
  if (!document.getElementById('p-view-list').classList.contains('hidden')) renderProjList();
  else if (!document.getElementById('p-view-stages').classList.contains('hidden')) renderObjStages();
  else if (!document.getElementById('p-view-stage-detail').classList.contains('hidden')) renderStageDetail();
}

function setProjFilter(f) { projFilter = f; renderProjList(); }

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
      <div class="row" style="justify-content:space-between;"><strong>🏗️ ${o.name}</strong><span class="badge ${st}">${stNames[st]}</span></div>
      <div style="font-size:12px;color:#64748b;margin-top:6px;">Этапов: ${oStages.length}</div>
    </div>`;
  }).join('') || '<div class="card" style="text-align:center;color:#94a3b8;">Нет объектов по фильтру</div>';
}

function openObj(oid) {
  curObjId = oid; curStageId = null; stopReceiptCam();
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

  let html = `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px;"><h3>🏗️ ${o.name}</h3><button onclick="backToObjList()" class="btn-sm btn-dark">← Объекты</button></div>${!isWorker ? `<div class="row"><input id="new-stage-name" placeholder="Новый этап (напр. Черновой монтаж)" style="margin:0;"><button onclick="addStage()" class="btn-sm btn-green" style="padding:10px 14px;">+ Этап</button></div>` : ''}</div>`;

  html += oStages.map(s => {
    const factSum = stageItems.filter(i => i.stage_id === s.id && i.estimate_type === 'fact').reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
    return `<div class="card" onclick="openStage(${s.id})" style="cursor:pointer;"><div class="row" style="justify-content:space-between;"><strong>${s.name}</strong><span class="badge ${s.status}">${stNames[s.status] || s.status}</span></div><div style="font-size:12px;color:#64748b;margin-top:6px;">Создан: ${new Date(s.created_at).toLocaleDateString('ru-RU')}${s.end_date ? ' · Завершён: ' + new Date(s.end_date).toLocaleDateString('ru-RU') : ''}${!isWorker ? `<br>Сумма (отчёт): <strong>${factSum.toLocaleString('ru-RU')} ₽</strong>` : ''}</div></div>`;
  }).join('') || '<div class="card" style="text-align:center;color:#94a3b8;">Этапы пока не добавлены</div>';

  document.getElementById('p-view-stages').innerHTML = html;
}

async function addStage() {
  const name = document.getElementById('new-stage-name').value.trim();
  if (!name) return;
  await api('object_stages', 'POST', { object_id: curObjId, name, status: 'work' });
  await refresh();
}
function openStage(sid) {
  curStageId = sid; stopReceiptCam();
  curEstType = (user.role === 'worker') ? 'fact' : 'prelim';
  document.getElementById('p-view-stages').classList.add('hidden');
  document.getElementById('p-view-stage-detail').classList.remove('hidden');
  renderStageDetail();
}

function setEstTab(t) { if (user.role === 'worker') t = 'fact'; curEstType = t; renderStageDetail(); }

function renderStageDetail() {
  const s = stages.find(x => x.id === curStageId), o = objs.find(x => x.id === curObjId);
  if (!s || !o) return backToObjList();
  const isWorker = user.role === 'worker', isAdmin = user.role === 'admin';
  const items = stageItems.filter(i => i.stage_id === s.id && i.estimate_type === curEstType);
  const pays = stagePays.filter(p => p.stage_id === s.id);
  const totalClient = items.reduce((a, b) => a + Number(b.qty || 0) * Number(b.client_price || 0), 0);
  const totalWorker = items.filter(i => i.item_kind === 'work').reduce((a, b) => a + Number(b.qty || 0) * Number(b.cost_price || 0), 0);
  const paidSum = pays.reduce((a, b) => a + Number(b.amount || 0), 0);
  const debt = Math.max(0, totalClient - paidSum);

  let html = `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px;"><div><small style="color:#64748b;">${o.name}</small><h3>${s.name}</h3></div><button onclick="openObj(${curObjId})" class="btn-sm btn-dark">← Этапы</button></div>${!isWorker ? `<div class="row" style="margin-bottom:8px;"><button onclick="setEstTab('prelim')" class="btn-sm ${curEstType === 'prelim' ? '' : 'btn-dark'}" style="flex:1;opacity:${curEstType === 'prelim' ? 1 : 0.7}">📋 КП (предвар.)</button><button onclick="setEstTab('fact')" class="btn-sm ${curEstType === 'fact' ? 'btn-green' : 'btn-dark'}" style="flex:1;opacity:${curEstType === 'fact' ? 1 : 0.7}">📑 Отчёт (факт)</button></div><div class="row" style="margin-bottom:8px;"><button onclick="exportStagePDF('prelim')" class="btn-sm btn-amber" style="flex:1;">📄 КП в PDF</button><button onclick="exportStagePDF('fact')" class="btn-sm btn-purple" style="flex:1;">📄 Отчёт в PDF</button></div><div style="font-size:13px;background:#f8fafc;padding:8px;border-radius:10px;">Итого для заказчика: <strong>${totalClient.toLocaleString('ru-RU')} ₽</strong> · Оплачено: <strong style="color:#059669;">${paidSum.toLocaleString('ru-RU')} ₽</strong> · Остаток: <strong style="color:#e11d48;">${debt.toLocaleString('ru-RU')} ₽</strong></div>` : `<div style="font-size:13px;background:#f0fdf4;padding:8px;border-radius:10px;color:#065f46;">📑 Фактически выполненные работы и материалы (ваша ЗП по работам: <strong>${totalWorker.toLocaleString('ru-RU')} ₽</strong>)</div>`}</div>`;

  html += `<div class="card"><h4>➕ Добавить работу из прайса</h4><select id="si-wt"></select><div class="row"><input id="si-wt-qty" type="number" step="any" value="1" placeholder="Кол-во"><button onclick="addStageWorkItem()" class="btn-sm btn-green" style="padding:10px 14px;">Добавить</button></div><hr style="margin:10px 0;border:none;border-top:1px solid #e2e8f0;"><h4>➕ Добавить материал / расход</h4><input id="si-m-name" placeholder="Наименование материала"><div class="row"><input id="si-m-qty" type="number" step="any" placeholder="Кол-во"><select id="si-m-unit" style="max-width:110px;"><option value="шт">шт</option><option value="м">м</option><option value="кв.м">кв.м</option><option value="комплекс">комплекс</option><option value="услуга">услуга</option></select></div><div class="row"><input id="si-m-cost" type="number" step="any" placeholder="${isWorker ? 'Ваша ставка/сумма, ₽' : 'Закупка, ₽'}">${!isWorker ? `<input id="si-m-client" type="number" step="any" placeholder="Цена клиенту, ₽">` : ''}</div><button onclick="addStageMatItem()" class="btn-green">Сохранить позицию</button>${curEstType === 'fact' ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #cbd5e1;"><button onclick="toggleReceiptScan()" class="btn-amber">📷 Сканировать QR чека (добавить материал)</button><div id="rec-scan-box" class="hidden" style="margin-top:8px;"><video id="rec-video" style="width:100%;border-radius:10px;margin-bottom:6px;"></video><input id="rec-qr-txt" placeholder="Данные QR чека"><input id="rec-sum" type="number" step="any" placeholder="Сумма по чеку, ₽"><button onclick="saveReceiptItem()" class="btn-green">Добавить материал по чеку</button></div></div>` : ''}</div>`;

  html += `<div class="card"><h4>📋 Позиции (${curEstType === 'prelim' ? 'КП' : 'Отчёт'})</h4>` + (items.map(it => {
    const lineClient = Number(it.qty || 0) * Number(it.client_price || 0);
    const lineCost = Number(it.qty || 0) * Number(it.cost_price || 0);
    return `<div class="list-row"><div><strong>${it.name}</strong> <span class="badge stock">${it.item_kind === 'work' ? 'Работа' : 'Материал'}</span><br><small style="color:#64748b;">Кол-во: ${Number(it.qty)} ${it.unit || 'шт'}${isWorker ? (it.item_kind === 'work' ? ` · ЗП: ${lineCost.toLocaleString('ru-RU')} ₽` : '') : ` · Клиенту: ${lineClient.toLocaleString('ru-RU')} ₽`}</small></div><button onclick="delStageItem(${it.id})" class="btn-sm btn-red">✕</button></div>`;
  }).join('') || '<div style="font-size:12px;color:#94a3b8;">Позиций пока нет</div>') + `</div>`;

  if (!isWorker) {
    html += `<div class="card"><h4>💳 Оплаты от заказчика по этапу</h4><div class="row"><input id="spay-amt" type="number" placeholder="Сумма, ₽"><input id="spay-note" placeholder="Комментарий"></div><button onclick="addStagePay()" class="btn-green">Внести оплату</button><div style="margin-top:8px;">` + (pays.map(p => `<div class="list-row"><div><strong>+${Number(p.amount).toLocaleString('ru-RU')} ₽</strong> <small style="color:#64748b;">${new Date(p.created_at).toLocaleDateString('ru-RU')} ${p.comment ? '· ' + p.comment : ''}</small></div><div class="row"><button onclick="editStagePayModal(${p.id})" class="btn-sm">✏️</button><button onclick="delStagePay(${p.id})" class="btn-sm btn-red">✕</button></div></div>`).join('') || '<div style="font-size:12px;color:#94a3b8;">Оплат по этапу пока нет</div>') + `</div>${isAdmin && s.status !== 'done' ? `<button onclick="completeStage(${s.id})" class="btn-dark" style="margin-top:10px;">✅ Завершить этап и вернуть остатки на склад</button>` : ''}</div>`;
  }

  document.getElementById('p-view-stage-detail').innerHTML = html;
  document.getElementById('si-wt').innerHTML = wTypes.map(w => `<option value="${w.id}">${w.name} — ${isWorker ? w.rate : w.client_rate} ₽/${w.unit || 'шт'}</option>`).join('');
}
async function addStageWorkItem() {
  const wt = wTypes.find(x => x.id === Number(document.getElementById('si-wt').value)), qty = Number(document.getElementById('si-wt-qty').value) || 0;
  if (!wt || qty <= 0) return;
  await api('stage_items', 'POST', { stage_id: curStageId, estimate_type: curEstType, item_kind: 'work', name: wt.name, unit: wt.unit || 'шт', qty, cost_price: Number(wt.rate || 0), client_price: Number(wt.client_rate || 0) });
  await refresh();
}

async function addStageMatItem() {
  const name = document.getElementById('si-m-name').value.trim(), qty = Number(document.getElementById('si-m-qty').value) || 0, unit = document.getElementById('si-m-unit').value, cost = Number(document.getElementById('si-m-cost').value) || 0;
  const clientInp = document.getElementById('si-m-client'), client = clientInp ? (Number(clientInp.value) || cost) : cost;
  if (!name || qty <= 0) return alert('Укажите название и количество');
  await api('stage_items', 'POST', { stage_id: curStageId, estimate_type: curEstType, item_kind: 'mat', name, unit, qty, cost_price: cost, client_price: client });
  await refresh();
}

async function delStageItem(id) { await api('stage_items?id=eq.' + id, 'DELETE'); await refresh(); }

async function addStagePay() {
  const amount = Number(document.getElementById('spay-amt').value) || 0, comment = document.getElementById('spay-note').value.trim();
  if (amount <= 0) return alert('Укажите сумму оплаты');
  await api('stage_payments', 'POST', { stage_id: curStageId, object_id: curObjId, amount, comment });
  const s = stages.find(x => x.id === curStageId);
  const factTotal = stageItems.filter(i => i.stage_id === curStageId && i.estimate_type === 'fact').reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
  const paidAfter = stagePays.filter(p => p.stage_id === curStageId).reduce((a, b) => a + Number(b.amount), 0) + amount;
  if (s && s.status === 'work' && paidAfter > 0 && paidAfter < factTotal) await api('object_stages?id=eq.' + curStageId, 'PATCH', { status: 'wait_pay' });
  await refresh();
}

function editStagePayModal(id) { const p = stagePays.find(x => x.id === id); if (p) openModal(`<h3>✏️ Редактировать оплату</h3><input id="ed-spay-amt" type="number" value="${Number(p.amount)}"><input id="ed-spay-note" value="${p.comment || ''}" placeholder="Комментарий"><div class="row"><button onclick="saveStagePay(${id})" class="btn-green">Сохранить</button><button onclick="closeModal()" class="btn-red">Отмена</button></div>`); }
async function saveStagePay(id) { await api('stage_payments?id=eq.' + id, 'PATCH', { amount: Number(document.getElementById('ed-spay-amt').value) || 0, comment: document.getElementById('ed-spay-note').value.trim() }); closeModal(); await refresh(); }
async function delStagePay(id) { if (confirm('Удалить эту оплату?')) { await api('stage_payments?id=eq.' + id, 'DELETE'); await refresh(); } }

async function completeStage(sid) {
  if (!confirm('Завершить этап? Если в КП материала было больше, чем в отчёте, остаток вернётся на склад.')) return;
  const prelimMats = stageItems.filter(i => i.stage_id === sid && i.estimate_type === 'prelim' && i.item_kind === 'mat');
  const factMats = stageItems.filter(i => i.stage_id === sid && i.estimate_type === 'fact' && i.item_kind === 'mat');
  for (const pm of prelimMats) {
    const used = factMats.filter(fm => fm.name.toLowerCase() === pm.name.toLowerCase()).reduce((a, b) => a + Number(b.qty), 0);
    const left = Number(pm.qty) - used;
    if (left > 0) {
      const existing = cons.find(c => c.name.toLowerCase() === pm.name.toLowerCase());
      if (existing) await api('consumables?id=eq.' + existing.id, 'PATCH', { qty: Number(existing.qty) + left });
      else await api('consumables', 'POST', { name: pm.name, qty: left, unit: pm.unit || 'шт' });
      await api('logs', 'POST', { employee_id: user.id, action: `Возврат остатка со стройки: ${pm.name}`, object_id: curObjId, comment: `+${left} ${pm.unit || 'шт'}`, created_at: new Date().toISOString() });
    }
  }
  await api('object_stages?id=eq.' + sid, 'PATCH', { status: 'done', end_date: new Date().toISOString() });
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
  const s = stages.find(x => x.id === curStageId), o = objs.find(x => x.id === curObjId);
  if (!s || !o) return;
  const items = stageItems.filter(i => i.stage_id === s.id && i.estimate_type === type);
  const works = items.filter(i => i.item_kind === 'work'), mats = items.filter(i => i.item_kind === 'mat');
  const wSum = works.reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
  const mSum = mats.reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
  const title = type === 'prelim' ? 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ' : 'ОТЧЁТ О ВЫПОЛНЕННЫХ РАБОТАХ И МАТЕРИАЛАХ';
  const prefix = type === 'prelim' ? 'КП' : 'Отчет';

  const makeRows = arr => arr.map((x, idx) => `<tr><td style="border:1px solid #94a3b8;padding:6px;text-align:center;">${idx + 1}</td><td style="border:1px solid #94a3b8;padding:6px;">${x.name}</td><td style="border:1px solid #94a3b8;padding:6px;text-align:center;">${x.unit || 'шт'}</td><td style="border:1px solid #94a3b8;padding:6px;text-align:center;">${Number(x.qty)}</td><td style="border:1px solid #94a3b8;padding:6px;text-align:right;">${Number(x.client_price).toLocaleString('ru-RU')} ₽</td><td style="border:1px solid #94a3b8;padding:6px;text-align:right;font-weight:bold;">${(Number(x.qty) * Number(x.client_price)).toLocaleString('ru-RU')} ₽</td></tr>`).join('');
  const tableHead = `<tr style="background:#f1f5f9;"><th style="border:1px solid #94a3b8;padding:6px;width:36px;">№</th><th style="border:1px solid #94a3b8;padding:6px;text-align:left;">Наименование</th><th style="border:1px solid #94a3b8;padding:6px;width:65px;">Ед. изм.</th><th style="border:1px solid #94a3b8;padding:6px;width:65px;">Кол-во</th><th style="border:1px solid #94a3b8;padding:6px;width:95px;text-align:right;">Цена</th><th style="border:1px solid #94a3b8;padding:6px;width:105px;text-align:right;">Сумма</th></tr>`;

  const box = document.getElementById('pdf-render-box');
  box.innerHTML = `<div style="font-family:Arial,sans-serif;color:#0f172a;width:680px;"><h2 style="margin-bottom:6px;font-size:18px;">${title}</h2><p style="font-size:13px;color:#334155;margin-bottom:14px;">Объект: <strong>${o.name}</strong> · Этап: <strong>${s.name}</strong> · Дата: ${new Date().toLocaleDateString('ru-RU')}</p>${works.length ? `<h4 style="margin:10px 0 6px;font-size:14px;">1. Работы</h4><table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;">${tableHead}${makeRows(works)}</table><p style="text-align:right;font-size:13px;margin-bottom:12px;">Итого по работам: <strong>${wSum.toLocaleString('ru-RU')} ₽</strong></p>` : ''}${mats.length ? `<h4 style="margin:10px 0 6px;font-size:14px;">2. Материалы и комплектующие</h4><table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;">${tableHead}${makeRows(mats)}</table><p style="text-align:right;font-size:13px;margin-bottom:12px;">Итого по материалам: <strong>${mSum.toLocaleString('ru-RU')} ₽</strong></p>` : ''}<div style="margin-top:14px;padding:12px;background:#f8fafc;border:1px solid #94a3b8;text-align:right;font-size:16px;">Итого по смете: <strong>${(wSum + mSum).toLocaleString('ru-RU')} ₽</strong></div></div>`;
  const cleanName = `${prefix}_${o.name}_${s.name}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
  html2pdf().from(box.firstElementChild).set({ margin: 10, filename: cleanName, html2canvas: { scale: 2, scrollX: 0, scrollY: 0, windowWidth: 800 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).save();
}
function setWorkMode(m) {
  workMode = m;
  document.getElementById('wm-piece').className = 'btn-sm ' + (m === 'piece' ? '' : 'btn-dark');
  document.getElementById('wm-shift').className = 'btn-sm ' + (m === 'shift' ? '' : 'btn-dark');
  document.getElementById('wm-piece').style.opacity = m === 'piece' ? 1 : 0.65;
  document.getElementById('wm-shift').style.opacity = m === 'shift' ? 1 : 0.65;
  document.getElementById('w-piece-box').classList.toggle('hidden', m !== 'piece');
  document.getElementById('w-shift-box').classList.toggle('hidden', m !== 'shift');
}

function renderSalaryMod() {
  const isStaff = user.role === 'admin' || user.role === 'foreman';
  document.getElementById('sal-admin-card').classList.toggle('hidden', !isStaff);
  if (isStaff) {
    document.getElementById('w-emp').innerHTML = emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    document.getElementById('w-wt').innerHTML = wTypes.map(w => `<option value="${w.id}">${w.name} (${w.rate} ₽/${w.unit || 'шт'})</option>`).join('');
    document.getElementById('w-obj').innerHTML = objs.filter(o => o.id !== 1).map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    document.getElementById('s-emp').innerHTML = emps.map(e => `<option value="${e.id}">${e.name} (${e.shift_rate || 3500} ₽/смена)</option>`).join('');
    document.getElementById('s-obj').innerHTML = objs.filter(o => o.id !== 1).map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  }
  const list = isStaff ? works : works.filter(w => w.employee_id === user.id);
  const byEmp = {};
  emps.forEach(e => {
    const ew = works.filter(w => w.employee_id === e.id).reduce((a, b) => a + Number(b.amount || 0), 0);
    const ep = payouts.filter(p => p.employee_id === e.id).reduce((a, b) => a + Number(b.amount || 0), 0);
    byEmp[e.id] = { emp: e, earned: ew, paid: ep, debt: ew - ep };
  });

  let html = '';
  if (isStaff) {
    html += `<div class="card"><h4>💰 Сводка по сотрудникам (начислено / выплачено / долг)</h4>` + Object.values(byEmp).map(x => `<div class="list-row"><div><strong>${x.emp.name}</strong><br><small style="color:#64748b;">Начислено: ${x.earned.toLocaleString('ru-RU')} ₽ · Выплачено: ${x.paid.toLocaleString('ru-RU')} ₽</small></div><div style="text-align:right;"><strong style="color:${x.debt > 0 ? '#e11d48' : '#059669'};">${x.debt.toLocaleString('ru-RU')} ₽</strong><br><button onclick="openPayoutModal(${x.emp.id})" class="btn-sm btn-green" style="margin-top:4px;">Выплатить</button></div></div>`).join('') + `</div>`;
  } else {
    const me = byEmp[user.id] || { earned: 0, paid: 0, debt: 0 };
    html += `<div class="card"><h4>💰 Моя зарплата</h4><p style="font-size:14px;">Начислено: <strong>${me.earned.toLocaleString('ru-RU')} ₽</strong> · Выплачено: <strong>${me.paid.toLocaleString('ru-RU')} ₽</strong><br>К выплате (долг): <strong style="color:#e11d48;font-size:16px;">${me.debt.toLocaleString('ru-RU')} ₽</strong></p></div>`;
  }

  html += `<div class="card"><h4>📝 История работ и смен</h4>` + (list.slice().reverse().map(w => {
    const e = emps.find(x => x.id === w.employee_id), o = objs.find(x => x.id === w.object_id);
    return `<div class="list-row"><div><strong>${w.work_name}</strong> · <span style="color:#059669;font-weight:bold;">+${Number(w.amount).toLocaleString('ru-RU')} ₽</span><br><small style="color:#64748b;">👷 ${e ? e.name : '—'} · 🏗️ ${o ? o.name : '—'} · ${new Date(w.created_at).toLocaleDateString('ru-RU')}</small></div>${isStaff ? `<button onclick="delWork(${w.id})" class="btn-sm btn-red">✕</button>` : ''}</div>`;
  }).join('') || '<div style="text-align:center;color:#94a3b8;">Записей пока нет</div>') + `</div>`;

  if (isStaff) {
    html += `<div class="card"><h4>💸 История выплат</h4>` + (payouts.slice().reverse().map(p => {
      const e = emps.find(x => x.id === p.employee_id);
      return `<div class="list-row"><div><strong>${e ? e.name : '—'}</strong> · <span style="color:#2563eb;font-weight:bold;">${Number(p.amount).toLocaleString('ru-RU')} ₽</span>${p.comment ? ' <small style="color:#64748b;">(' + p.comment + ')</small>' : ''}<br><small style="color:#94a3b8;">${new Date(p.created_at).toLocaleDateString('ru-RU')}</small></div><div class="row"><button onclick="editPayoutModal(${p.id})" class="btn-sm">✏️</button><button onclick="delPayout(${p.id})" class="btn-sm btn-red">✕</button></div></div>`;
    }).join('') || '<div style="text-align:center;color:#94a3b8;">Выплат пока нет</div>') + `</div>`;
  }
  document.getElementById('sal-content').innerHTML = html;
}

async function addWork() {
  const eid = Number(document.getElementById('w-emp').value), wt = wTypes.find(x => x.id === Number(document.getElementById('w-wt').value)), oid = Number(document.getElementById('w-obj').value), qty = Number(document.getElementById('w-qty').value) || 0;
  if (!wt || qty <= 0) return alert('Укажите объём');
  const amt = qty * Number(wt.rate || 0);
  await api('work_logs', 'POST', { employee_id: eid, object_id: oid, work_name: `${wt.name} (${qty} ${wt.unit || 'шт'})`, amount: amt });
  await refresh();
}

async function addShift() {
  const eid = Number(document.getElementById('s-emp').value), emp = emps.find(x => x.id === eid), oid = Number(document.getElementById('s-obj').value), days = Number(document.getElementById('s-days').value) || 0;
  const customRate = Number(document.getElementById('s-rate').value), rate = customRate > 0 ? customRate : Number(emp?.shift_rate || 3500);
  if (days <= 0) return alert('Укажите кол-во смен');
  await api('work_logs', 'POST', { employee_id: eid, object_id: oid, work_name: `Смена (${days} дн. × ${rate} ₽)`, amount: days * rate });
  await refresh();
}

async function delWork(id) { if (confirm('Удалить запись о работе?')) { await api('work_logs?id=eq.' + id, 'DELETE'); await refresh(); } }
function openPayoutModal(eid) { const emp = emps.find(e => e.id === eid); openModal(`<h3>💸 Выплата: ${emp ? emp.name : ''}</h3><input id="po-amt" type="number" placeholder="Сумма выплаты, ₽"><input id="po-comm" placeholder="Комментарий (напр. аванс)"><button onclick="savePayout(${eid})" class="btn-green">Сохранить выплату</button>`); }
async function savePayout(eid) { const amt = Number(document.getElementById('po-amt').value) || 0, comm = document.getElementById('po-comm').value.trim(); if (amt <= 0) return alert('Введите сумму'); await api('payouts', 'POST', { employee_id: eid, amount: amt, comment: comm }); closeModal(); await refresh(); }
function editPayoutModal(id) { const p = payouts.find(x => x.id === id); if (p) openModal(`<h3>✏️ Редактировать выплату</h3><input id="ed-po-amt" type="number" value="${Number(p.amount)}"><input id="ed-po-comm" value="${p.comment || ''}" placeholder="Комментарий"><div class="row"><button onclick="saveEditPayout(${id})" class="btn-green">Сохранить</button><button onclick="closeModal()" class="btn-red">Отмена</button></div>`); }
async function saveEditPayout(id) { await api('payouts?id=eq.' + id, 'PATCH', { amount: Number(document.getElementById('ed-po-amt').value) || 0, comment: document.getElementById('ed-po-comm').value.trim() }); closeModal(); await refresh(); }
async function delPayout(id) { if (confirm('Удалить эту выплату?')) { await api('payouts?id=eq.' + id, 'DELETE'); await refresh(); } }
function renderOverheads() {
  const q = (document.getElementById('oh-search')?.value || '').toLowerCase().trim();
  const list = overheads.filter(o => !q || (o.category || '').toLowerCase().includes(q) || (o.comment || '').toLowerCase().includes(q));
  const byCat = {};
  overheads.forEach(o => { byCat[o.category] = (byCat[o.category] || 0) + Number(o.amount || 0); });
  const maxVal = Math.max(...Object.values(byCat), 1);

  document.getElementById('oh-chart').innerHTML = Object.entries(byCat).map(([cat, val]) => {
    const pct = Math.round((val / maxVal) * 100);
    return `<div style="margin-bottom:8px;"><div class="row" style="justify-content:space-between;font-size:12px;"><span>${cat}</span><strong>${val.toLocaleString('ru-RU')} ₽</strong></div><div style="background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden;"><div style="background:#2563eb;width:${pct}%;height:100%;"></div></div></div>`;
  }).join('') || '<div style="font-size:12px;color:#94a3b8;">Данных для графика пока нет</div>';

  document.getElementById('oh-list').innerHTML = list.slice().reverse().map(o => `<div class="list-row"><div><strong>${o.category}</strong> · <span style="color:#e11d48;font-weight:bold;">−${Number(o.amount).toLocaleString('ru-RU')} ₽</span>${o.comment ? '<br><small style="color:#64748b;">' + o.comment + '</small>' : ''}<br><small style="color:#94a3b8;">${new Date(o.created_at).toLocaleDateString('ru-RU')}</small></div><div class="row"><button onclick="editOverheadModal(${o.id})" class="btn-sm">✏️</button><button onclick="delOverhead(${o.id})" class="btn-sm btn-red">✕</button></div></div>`).join('') || '<div style="text-align:center;color:#94a3b8;">Расходов не найдено</div>';
}

async function addOverhead() {
  const cat = document.getElementById('oh-cat').value, amt = Number(document.getElementById('oh-amt').value) || 0, comm = document.getElementById('oh-comm').value.trim();
  if (amt <= 0) return alert('Введите сумму расхода');
  await api('overheads', 'POST', { category: cat, amount: amt, comment: comm });
  document.getElementById('oh-amt').value = ''; document.getElementById('oh-comm').value = '';
  await refresh();
}

function editOverheadModal(id) {
  const o = overheads.find(x => x.id === id);
  if (!o) return;
  const cats = ['Бензин / ГСМ', 'Запчасти и ремонт авто', 'Аренда склада / офиса', 'Инструмент и расходники', 'Связь и ПО', 'Налоги и комиссия', 'Прочее'];
  openModal(`<h3>✏️ Редактировать расход</h3><select id="ed-oh-cat">${cats.map(c => `<option value="${c}" ${o.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select><input id="ed-oh-amt" type="number" value="${Number(o.amount)}"><input id="ed-oh-comm" value="${o.comment || ''}" placeholder="Комментарий"><div class="row"><button onclick="saveOverhead(${id})" class="btn-green">Сохранить</button><button onclick="closeModal()" class="btn-red">Отмена</button></div>`);
}

async function saveOverhead(id) { await api('overheads?id=eq.' + id, 'PATCH', { category: document.getElementById('ed-oh-cat').value, amount: Number(document.getElementById('ed-oh-amt').value) || 0, comment: document.getElementById('ed-oh-comm').value.trim() }); closeModal(); await refresh(); }
async function delOverhead(id) { if (confirm('Удалить этот расход?')) { await api('overheads?id=eq.' + id, 'DELETE'); await refresh(); } }

function initReports() {
  const now = new Date();
  document.getElementById('rep-from').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  document.getElementById('rep-to').value = now.toISOString().slice(0, 10);
  document.getElementById('rep-obj').innerHTML = '<option value="all">Все объекты</option>' + objs.filter(o => o.id !== 1).map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  renderReports();
}

function renderReports() {
  const dFrom = document.getElementById('rep-from').value, dTo = document.getElementById('rep-to').value + 'T23:59:59', oid = document.getElementById('rep-obj').value;
  const inRange = dt => (!dFrom || dt >= dFrom) && (!dTo || dt <= dTo);

  const fPays = stagePays.filter(p => inRange(p.created_at) && (oid === 'all' || Number(p.object_id) === Number(oid)));
  const fWorks = works.filter(w => inRange(w.created_at) && (oid === 'all' || Number(w.object_id) === Number(oid)));
  const fOh = oid === 'all' ? overheads.filter(o => inRange(o.created_at)) : [];
  const fItems = stageItems.filter(i => {
    if (i.estimate_type !== 'fact' || i.item_kind !== 'mat') return false;
    const st = stages.find(s => s.id === i.stage_id);
    return st && inRange(st.created_at) && (oid === 'all' || Number(st.object_id) === Number(oid));
  });

  const inc = fPays.reduce((a, b) => a + Number(b.amount || 0), 0);
  const sal = fWorks.reduce((a, b) => a + Number(b.amount || 0), 0);
  const mats = fItems.reduce((a, b) => a + Number(b.qty || 0) * Number(b.cost_price || 0), 0);
  const ohSum = fOh.reduce((a, b) => a + Number(b.amount || 0), 0);
  const profit = inc - sal - mats - ohSum;

  document.getElementById('rep-summary').innerHTML = `
    <div class="list-row"><span>Поступления от заказчиков:</span><strong style="color:#059669;">+${inc.toLocaleString('ru-RU')} ₽</strong></div>
    <div class="list-row"><span>Закупка материалов (факт):</span><strong style="color:#e11d48;">−${mats.toLocaleString('ru-RU')} ₽</strong></div>
    <div class="list-row"><span>Начисленная ЗП (работы и смены):</span><strong style="color:#e11d48;">−${sal.toLocaleString('ru-RU')} ₽</strong></div>
    <div class="list-row"><span>Накладные расходы:</span><strong style="color:#e11d48;">−${ohSum.toLocaleString('ru-RU')} ₽</strong></div>
    <div class="list-row" style="font-size:16px;border-top:2px solid #e2e8f0;margin-top:6px;padding-top:10px;"><strong>Чистая прибыль за период:</strong><strong style="color:${profit >= 0 ? '#059669' : '#e11d48'};">${profit.toLocaleString('ru-RU')} ₽</strong></div>
  `;
}
