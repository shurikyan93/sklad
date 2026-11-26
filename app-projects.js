let curObjId = null, curStageId = null, curEstType = 'prelim', curItemKind = 'work', recStream = null, recTimer = null, lastReceiptQR = '';

function ptab(t) {
  stopReceiptCam();
  ['objs', 'work', 'overhead', 'reports'].forEach(x => {
    document.getElementById('ptab-' + x).classList.add('hidden');
    document.getElementById('np-' + x).classList.remove('active');
  });
  document.getElementById('ptab-' + t).classList.remove('hidden');
  document.getElementById('np-' + t).classList.add('active');
  renderProjectsAll();
}

function renderProjectsAll() {
  if (!user) return;
  renderDashboard();
  renderProjectsList();
  if (curObjId) renderStagesList();
  if (curStageId) renderStageDetail();
  renderWorkAndSalary();
  renderOverheads();
  fillReportFilters();
}

function renderDashboard() {
  if (user.role !== 'admin') return;
  const m = document.getElementById('dash-month').value || new Date().toISOString().slice(0, 7);
  const yr = m.slice(0, 4);

  const activeStages = stages.filter(s => s.status === 'work');
  const activeObjIds = new Set(activeStages.map(s => s.object_id));

  // Долг заказчиков по всем этапам (фактические сметы минус оплаты)
  const totalFactClient = stageItems.filter(i => i.estimate_type === 'fact').reduce((s, i) => s + Number(i.qty) * Number(i.client_price), 0);
  const totalPaidClient = stagePays.reduce((s, p) => s + Number(p.amount), 0);
  const clientDebt = Math.max(0, totalFactClient - totalPaidClient);

  // Долг по ЗП за выбранный месяц
  let salDebtMonth = 0;
  emps.forEach(e => {
    const b = Number(e.base_salary || 0);
    const pc = wLogs.filter(w => w.employee_id === e.id && w.status === 'approved' && w.created_at.startsWith(m)).reduce((s, x) => s + Number(x.total || 0), 0);
    const pd = salPays.filter(p => p.employee_id === e.id && p.created_at.startsWith(m)).reduce((s, x) => s + Number(x.amount || 0), 0);
    salDebtMonth += Math.max(0, b + pc - pd);
  });

  // Прибыль за месяц и с начала года (Оплаты заказчиков - Себестоимость материалов/работ в отчётах - ЗП начисленная - Накладные)
  const calcProfit = (prefix) => {
    const inc = stagePays.filter(p => p.created_at.startsWith(prefix)).reduce((s, p) => s + Number(p.amount), 0);
    const matCost = stageItems.filter(i => i.estimate_type === 'fact' && i.item_kind === 'mat' && i.created_at.startsWith(prefix)).reduce((s, i) => s + Number(i.qty) * Number(i.cost_price), 0);
    const salCost = wLogs.filter(w => w.status === 'approved' && w.created_at.startsWith(prefix)).reduce((s, w) => s + Number(w.total || 0), 0);
    const ohCost = overheads.filter(o => (o.expense_date || o.created_at).startsWith(prefix)).reduce((s, o) => s + Number(o.amount || 0), 0);
    const monthsCount = prefix.length === 4 ? (new Date().getMonth() + 1) : 1;
    const baseTotal = emps.reduce((s, e) => s + Number(e.base_salary || 0), 0) * monthsCount;
    return inc - matCost - salCost - baseTotal - ohCost;
  };

  const profMonth = calcProfit(m);
  const profYear = calcProfit(yr);

  document.getElementById('dash-grid').innerHTML = `
    <div class="stat-box"><small>Объектов в работе</small><strong>${activeObjIds.size} (${activeStages.length} эт.)</strong></div>
    <div class="stat-box"><small>Долг заказчиков</small><strong style="color:#fbbf24;">${clientDebt.toLocaleString('ru-RU')} ₽</strong></div>
    <div class="stat-box"><small>Долг по ЗП (${m})</small><strong style="color:#fb7185;">${salDebtMonth.toLocaleString('ru-RU')} ₽</strong></div>
    <div class="stat-box"><small>Прибыль мес / год</small><strong style="color:#34d399;">${profMonth.toLocaleString('ru-RU')} / ${profYear.toLocaleString('ru-RU')} ₽</strong></div>
  `;
}

function renderProjectsList() {
  const q = (document.getElementById('proj-search')?.value || '').toLowerCase().trim();
  const list = objs.filter(o => o.id !== 1 && o.name.toLowerCase().includes(q));
  document.getElementById('proj-list').innerHTML = list.map(o => {
    const oStages = stages.filter(s => s.object_id === o.id);
    const workCnt = oStages.filter(s => s.status === 'work').length;
    const waitCnt = oStages.filter(s => s.status === 'wait_pay').length;
    return `<div class="card" onclick="openProjectDetail(${o.id})" style="cursor:pointer;">
      <div class="row" style="justify-content:space-between;">
        <strong>🏗️ ${o.name}</strong>
        <span class="badge ${workCnt ? 'work' : waitCnt ? 'wait_pay' : 'stock'}">Этапов: ${oStages.length}</span>
      </div>
      <div style="font-size:12px; color:#64748b; margin-top:4px;">В работе: ${workCnt} | Ждут оплаты: ${waitCnt}</div>
    </div>`;
  }).join('') || '<div class="card" style="text-align:center;color:#94a3b8;">Объекты не найдены</div>';
}

function openProjectDetail(id) {
  curObjId = id;
  const o = objs.find(x => x.id === id);
  document.getElementById('pd-title').textContent = '🏗️ ' + (o ? o.name : '');
  document.getElementById('proj-list-view').classList.add('hidden');
  document.getElementById('stage-detail-view').classList.add('hidden');
  document.getElementById('proj-detail-view').classList.remove('hidden');
  renderStagesList();
}

function closeProjectDetail() {
  curObjId = null;
  document.getElementById('proj-detail-view').classList.add('hidden');
  document.getElementById('proj-list-view').classList.remove('hidden');
}

async function addStage() {
  const name = document.getElementById('new-stage-name').value.trim();
  if (!name || !curObjId) return;
  await api('object_stages', 'POST', { object_id: curObjId, name, status: 'work' });
  document.getElementById('new-stage-name').value = '';
  refresh();
}

function renderStagesList() {
  const stNames = { work: 'В работе', wait_pay: 'Ожидание оплаты', done: 'Завершён' };
  const list = stages.filter(s => s.object_id === curObjId);
  document.getElementById('stages-list').innerHTML = list.map(s => {
    const items = stageItems.filter(i => i.stage_id === s.id && i.estimate_type === 'fact');
    const sumClient = items.reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
    return `<div class="card" onclick="openStageDetail(${s.id})" style="cursor:pointer;">
      <div class="row" style="justify-content:space-between;">
        <strong>${s.name}</strong>
        <span class="badge ${s.status}">${stNames[s.status] || s.status}</span>
      </div>
      <div style="font-size:12px; color:#64748b; margin-top:6px;">
        Создан: ${new Date(s.start_date || s.created_at).toLocaleDateString('ru-RU')} ${s.end_date ? '| Завершён: ' + new Date(s.end_date).toLocaleDateString('ru-RU') : ''}<br>
        Сумма по отчёту: <strong>${sumClient.toLocaleString('ru-RU')} ₽</strong>
      </div>
    </div>`;
  }).join('') || '<div class="card" style="text-align:center;color:#94a3b8;">Добавьте первый этап работ выше</div>';
}
function openStageDetail(id) {
  curStageId = id;
  curEstType = 'prelim';
  document.getElementById('proj-detail-view').classList.add('hidden');
  document.getElementById('stage-detail-view').classList.remove('hidden');
  renderStageDetail();
}

function closeStageDetail() {
  curStageId = null;
  document.getElementById('stage-detail-view').classList.add('hidden');
  document.getElementById('proj-detail-view').classList.remove('hidden');
  renderStagesList();
}

function switchEstType(t) {
  curEstType = t;
  renderStageDetail();
}

async function changeStageStatus() {
  const st = document.getElementById('sd-status').value;
  const upd = { status: st };
  if (st === 'done') upd.end_date = new Date().toISOString().slice(0, 10);
  await api('object_stages?id=eq.' + curStageId, 'PATCH', upd);
  refresh();
}

function renderStageDetail() {
  const s = stages.find(x => x.id === curStageId);
  if (!s) return;
  const o = objs.find(x => x.id === s.object_id);
  document.getElementById('sd-obj-name').textContent = '🏗️ ' + (o ? o.name : '');
  document.getElementById('sd-title').textContent = s.name;
  document.getElementById('sd-status').value = s.status;
  document.getElementById('sd-dates').textContent = `Создан: ${new Date(s.start_date || s.created_at).toLocaleDateString('ru-RU')} ${s.end_date ? '| Окончание: ' + new Date(s.end_date).toLocaleDateString('ru-RU') : ''}`;

  const prelimItems = stageItems.filter(i => i.stage_id === s.id && i.estimate_type === 'prelim');
  const factItems = stageItems.filter(i => i.stage_id === s.id && i.estimate_type === 'fact');

  const calcTotals = (arr) => {
    const w = arr.filter(i => i.item_kind === 'work').reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
    const m = arr.filter(i => i.item_kind === 'mat').reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
    return { w, m, total: w + m };
  };

  const pTot = calcTotals(prelimItems);
  const fTot = calcTotals(factItems);
  const sPays = stagePays.filter(p => p.stage_id === s.id);
  const paidSum = sPays.reduce((a, b) => a + Number(b.amount), 0);

  document.getElementById('sd-totals').innerHTML = `
    <div>📝 КП (предварит.): <strong>${pTot.total.toLocaleString('ru-RU')} ₽</strong> <small style="color:#64748b;">(Раб: ${pTot.w.toLocaleString('ru-RU')} / Мат: ${pTot.m.toLocaleString('ru-RU')})</small></div>
    <div>📑 Отчёт (факт): <strong>${fTot.total.toLocaleString('ru-RU')} ₽</strong> <small style="color:#64748b;">(Раб: ${fTot.w.toLocaleString('ru-RU')} / Мат: ${fTot.m.toLocaleString('ru-RU')})</small></div>
    <div>💳 Оплачено заказчиком: <strong style="color:#059669;">${paidSum.toLocaleString('ru-RU')} ₽</strong> ${fTot.total > paidSum ? `<small style="color:#e11d48;">(Долг: ${(fTot.total - paidSum).toLocaleString('ru-RU')} ₽)</small>` : ''}</div>
  `;

  document.getElementById('btn-est-prelim').style.opacity = curEstType === 'prelim' ? '1' : '0.6';
  document.getElementById('btn-est-fact').style.opacity = curEstType === 'fact' ? '1' : '0.6';
  document.getElementById('est-box-title').innerHTML = curEstType === 'prelim'
    ? '📝 Коммерческое предложение <span class="badge prelim-tag">Предварит.</span>'
    : '📑 Фактический отчёт';

  const curList = curEstType === 'prelim' ? prelimItems : factItems;
  document.getElementById('stage-items-list').innerHTML = curList.map(i => `
    <div class="list-row">
      <div style="flex:1; padding-right:6px;">
        <strong>${i.item_kind === 'work' ? '🔧' : '📦'} ${i.name}</strong> ${i.receipt_qr ? '<span class="badge stock">Чек QR</span>' : ''}<br>
        <small style="color:#64748b;">${i.qty} ${i.unit} × ${Number(i.client_price).toLocaleString('ru-RU')} ₽ = <strong>${(Number(i.qty) * Number(i.client_price)).toLocaleString('ru-RU')} ₽</strong></small>
      </div>
      <div class="row">
        <button onclick="editStageItemQty(${i.id})" class="btn-dark btn-sm" title="Изменить кол-во">✏️</button>
        <button onclick="delStageItem(${i.id})" class="btn-red btn-sm">✕</button>
      </div>
    </div>`).join('') || '<div style="font-size:13px; color:#94a3b8; text-align:center; padding:8px;">Список пуст</div>';

  // Блок оплат показываем руководителю
  const payCard = document.getElementById('sd-payments-card');
  if (user.role === 'admin') {
    payCard.classList.remove('hidden');
    document.getElementById('sd-paid-badge').textContent = `${paidSum.toLocaleString('ru-RU')} / ${fTot.total.toLocaleString('ru-RU')} ₽`;
    document.getElementById('sd-payments-list').innerHTML = sPays.map(p => `
      <div class="list-row"><span>${new Date(p.created_at).toLocaleDateString('ru-RU')} — ${p.comment || 'Оплата'}</span><strong>+${Number(p.amount).toLocaleString('ru-RU')} ₽</strong></div>
    `).join('');
  } else payCard.classList.add('hidden');
}

function openAddItemModal(kind) {
  curItemKind = kind;
  lastReceiptQR = '';
  document.getElementById('rec-qr-info').textContent = '';
  document.getElementById('im-name').value = '';
  document.getElementById('im-qty').value = 1;
  document.getElementById('im-cost').value = '';
  document.getElementById('im-client').value = '';

  if (kind === 'work') {
    document.getElementById('im-title').textContent = '🔧 Добавить работу в смету';
    document.getElementById('im-qr-box').classList.add('hidden');
    document.getElementById('im-price-pick-box').classList.remove('hidden');
    document.getElementById('im-cost-lbl').textContent = 'ЗП монтажнику, ₽';
    document.getElementById('im-price-sel').innerHTML = '<option value="">— Ввести вручную —</option>' + wTypes.map(w => `<option value="${w.id}">${w.name} (${w.client_rate} ₽/${w.unit})</option>`).join('');
  } else {
    document.getElementById('im-title').textContent = '📦 Добавить материал / чек';
    document.getElementById('im-qr-box').classList.remove('hidden');
    document.getElementById('im-price-pick-box').classList.add('hidden');
    document.getElementById('im-cost-lbl').textContent = 'Цена закупки (чек), ₽';
  }
  document.getElementById('item-modal').classList.remove('hidden');
}

function closeItemModal() {
  stopReceiptCam();
  document.getElementById('item-modal').classList.add('hidden');
}

function fillItemFromPrice() {
  const wt = wTypes.find(x => x.id === Number(document.getElementById('im-price-sel').value));
  if (!wt) return;
  document.getElementById('im-name').value = wt.name;
  document.getElementById('im-unit').value = wt.unit;
  document.getElementById('im-cost').value = wt.rate;
  document.getElementById('im-client').value = wt.client_rate || Math.round(wt.rate * 1.15);
}

function autoCalcClientPrice() {
  const cost = Number(document.getElementById('im-cost').value) || 0;
  document.getElementById('im-client').value = cost > 0 ? Math.round(cost * 1.15) : '';
}

async function saveStageItem() {
  const name = document.getElementById('im-name').value.trim();
  const qty = Number(document.getElementById('im-qty').value) || 0;
  const unit = document.getElementById('im-unit').value;
  const cost_price = Number(document.getElementById('im-cost').value) || 0;
  const clientRaw = document.getElementById('im-client').value;
  const client_price = clientRaw !== '' ? Number(clientRaw) : (cost_price > 0 ? Math.round(cost_price * 1.15) : 0);

  if (!name || qty <= 0) return alert('Укажите название и количество');
  await api('stage_items', 'POST', {
    stage_id: curStageId, estimate_type: curEstType, item_kind: curItemKind,
    name, unit, qty, cost_price, client_price, receipt_qr: lastReceiptQR || null
  });
  closeItemModal();
  refresh();
}
async function editStageItemQty(id) {
  const item = stageItems.find(x => x.id === id);
  if (!item) return;
  const newQtyStr = prompt(`Изменить количество для "${item.name}" (${item.unit}):`, item.qty);
  if (newQtyStr === null) return;
  const newQty = Number(newQtyStr);
  if (isNaN(newQty) || newQty < 0) return alert('Некорректное количество');

  const diff = Number(item.qty) - newQty;
  if (item.estimate_type === 'fact' && item.item_kind === 'mat' && diff > 0) {
    const existing = cons.find(c => c.name.toLowerCase() === item.name.toLowerCase() && c.unit === item.unit);
    if (existing) {
      await api('consumables?id=eq.' + existing.id, 'PATCH', { qty: Number(existing.qty) + diff });
    } else {
      await api('consumables', 'POST', { name: item.name, qty: diff, unit: item.unit });
    }
    const st = stages.find(s => s.id === item.stage_id);
    await api('logs', 'POST', {
      employee_id: user.id,
      action: `Возврат излишка на склад: ${item.name}`,
      object_id: st ? st.object_id : 1,
      comment: `+${diff} ${item.unit} (этап: ${st ? st.name : ''})`
    });
    alert(`Излишек (${diff} ${item.unit}) автоматически перенесён на основной склад и записан в журнал!`);
  }

  if (newQty === 0) {
    await api('stage_items?id=eq.' + id, 'DELETE');
  } else {
    await api('stage_items?id=eq.' + id, 'PATCH', { qty: newQty });
  }
  refresh();
}

async function delStageItem(id) {
  if (!confirm('Удалить позицию из сметы?')) return;
  await api('stage_items?id=eq.' + id, 'DELETE');
  refresh();
}

function openStockToStageModal() {
  document.getElementById('ss-cons').innerHTML = cons.filter(c => c.qty > 0).map(c => `<option value="${c.id}">${c.name} (ост: ${c.qty} ${c.unit})</option>`).join('');
  document.getElementById('ss-qty').value = 1;
  document.getElementById('ss-cost').value = '';
  document.getElementById('ss-client').value = '';
  document.getElementById('stock-stage-modal').classList.remove('hidden');
}

async function transferStockToStage() {
  const c = cons.find(x => x.id === Number(document.getElementById('ss-cons').value));
  const qty = Number(document.getElementById('ss-qty').value) || 0;
  const cost = Number(document.getElementById('ss-cost').value) || 0;
  const clientRaw = document.getElementById('ss-client').value;
  const client = clientRaw !== '' ? Number(clientRaw) : (cost > 0 ? Math.round(cost * 1.15) : 0);

  if (!c || qty <= 0 || qty > c.qty) return alert('Недостаточно материала на складе');
  await api('consumables?id=eq.' + c.id, 'PATCH', { qty: c.qty - qty });
  await api('stage_items', 'POST', {
    stage_id: curStageId, estimate_type: curEstType, item_kind: 'mat',
    name: c.name, unit: c.unit, qty, cost_price: cost, client_price: client
  });
  const st = stages.find(s => s.id === curStageId);
  await api('logs', 'POST', { employee_id: user.id, action: `Списал со склада в этап: ${c.name}`, object_id: st ? st.object_id : 1, comment: `${qty} ${c.unit}` });
  document.getElementById('stock-stage-modal').classList.add('hidden');
  refresh();
}

async function addStagePayment() {
  const amount = Number(document.getElementById('sp-amount').value) || 0;
  const comment = document.getElementById('sp-comm').value.trim();
  if (amount <= 0) return alert('Введите сумму оплаты');
  const s = stages.find(x => x.id === curStageId);
  await api('stage_payments', 'POST', { stage_id: curStageId, object_id: s.object_id, amount, comment });

  const factTotal = stageItems.filter(i => i.stage_id === curStageId && i.estimate_type === 'fact').reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
  const prevPaid = stagePays.filter(p => p.stage_id === curStageId).reduce((a, b) => a + Number(b.amount), 0);
  if (factTotal > 0 && (prevPaid + amount) >= factTotal) {
    await api('object_stages?id=eq.' + curStageId, 'PATCH', { status: 'done', end_date: new Date().toISOString().slice(0, 10) });
    alert('Оплата внесена полностью! Статус этапа автоматически изменён на «Завершён».');
  }
  document.getElementById('sp-amount').value = '';
  document.getElementById('sp-comm').value = '';
  refresh();
}
async function startReceiptCam() {
  const vid = document.getElementById('rec-video'), info = document.getElementById('rec-qr-info');
  if (typeof jsQR === 'undefined') { info.textContent = 'Библиотека jsQR не загружена'; return; }
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    vid.srcObject = recStream; vid.setAttribute('playsinline', true); vid.classList.remove('hidden'); await vid.play();
    info.textContent = 'Наведите камеру на QR-код чека...';
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    recTimer = setInterval(() => {
      if (vid.readyState === vid.HAVE_ENOUGH_DATA) {
        canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          lastReceiptQR = code.data.trim();
          stopReceiptCam();
          const params = new URLSearchParams(lastReceiptQR);
          const sum = params.get('s');
          if (sum) {
            document.getElementById('im-cost').value = Number(sum);
            autoCalcClientPrice();
            if (!document.getElementById('im-name').value) document.getElementById('im-name').value = 'Материалы по чеку (от ' + new Date().toLocaleDateString('ru-RU') + ')';
          }
          info.textContent = '✅ QR чека считан! Сумма подставлена, скорректируйте позиции при необходимости.';
        }
      }
    }, 300);
  } catch (e) { info.textContent = 'Нет доступа к камере'; }
}

function stopReceiptCam() {
  clearInterval(recTimer);
  if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }
  const vid = document.getElementById('rec-video');
  if (vid) vid.classList.add('hidden');
}

function exportStagePDF() {
  if (typeof html2pdf === 'undefined') return alert('Подождите загрузки PDF-модуля');
  const s = stages.find(x => x.id === curStageId);
  const o = objs.find(x => x.id === s.object_id);
  const items = stageItems.filter(i => i.stage_id === curStageId && i.estimate_type === curEstType);
  const works = items.filter(i => i.item_kind === 'work');
  const mats = items.filter(i => i.item_kind === 'mat');

  const wSum = works.reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
  const mSum = mats.reduce((a, b) => a + Number(b.qty) * Number(b.client_price), 0);
  const docTitle = curEstType === 'prelim' ? 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ' : 'ОТЧЁТ О ВЫПОЛНЕННЫХ РАБОТАХ И МАТЕРИАЛАХ';
  const filePrefix = curEstType === 'prelim' ? 'КП' : 'Отчет';

  const makeRows = (arr) => arr.map((x, idx) => `
    <tr>
      <td style="border:1px solid #cbd5e1; padding:6px;">${idx + 1}</td>
      <td style="border:1px solid #cbd5e1; padding:6px;">${x.name}</td>
      <td style="border:1px solid #cbd5e1; padding:6px; text-align:center;">${x.qty} ${x.unit}</td>
      <td style="border:1px solid #cbd5e1; padding:6px; text-align:right;">${Number(x.client_price).toLocaleString('ru-RU')} ₽</td>
      <td style="border:1px solid #cbd5e1; padding:6px; text-align:right; font-weight:bold;">${(Number(x.qty) * Number(x.client_price)).toLocaleString('ru-RU')} ₽</td>
    </tr>`).join('');

  const el = document.createElement('div');
  el.style.padding = '20px';
  el.style.fontFamily = 'sans-serif';
  el.style.color = '#1e293b';
  el.innerHTML = `
    <h2 style="margin-bottom:6px;">${docTitle}</h2>
    <p style="font-size:13px; color:#475569; margin-bottom:14px;">Объект: <strong>${o ? o.name : ''}</strong> | Этап: <strong>${s.name}</strong> | Дата: ${new Date().toLocaleDateString('ru-RU')}</p>
    ${works.length ? `<h4 style="margin:10px 0 6px;">1. Электромонтажные работы</h4>
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:12px;">
        <tr style="background:#f1f5f9;"><th style="border:1px solid #cbd5e1;padding:6px;">№</th><th style="border:1px solid #cbd5e1;padding:6px;text-align:left;">Наименование</th><th style="border:1px solid #cbd5e1;padding:6px;">Кол-во</th><th style="border:1px solid #cbd5e1;padding:6px;">Цена</th><th style="border:1px solid #cbd5e1;padding:6px;">Сумма</th></tr>
        ${makeRows(works)}
      </table><p style="text-align:right; font-size:13px;">Итого по работам: <strong>${wSum.toLocaleString('ru-RU')} ₽</strong></p>` : ''}
    ${mats.length ? `<h4 style="margin:10px 0 6px;">2. Материалы и комплектующие</h4>
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:12px;">
        <tr style="background:#f1f5f9;"><th style="border:1px solid #cbd5e1;padding:6px;">№</th><th style="border:1px solid #cbd5e1;padding:6px;text-align:left;">Наименование</th><th style="border:1px solid #cbd5e1;padding:6px;">Кол-во</th><th style="border:1px solid #cbd5e1;padding:6px;">Цена</th><th style="border:1px solid #cbd5e1;padding:6px;">Сумма</th></tr>
        ${makeRows(mats)}
      </table><p style="text-align:right; font-size:13px;">Итого по материалам: <strong>${mSum.toLocaleString('ru-RU')} ₽</strong></p>` : ''}
    <div style="margin-top:16px; padding:12px; background:#f8fafc; border:1px solid #cbd5e1; text-align:right; font-size:16px;">
      ОБЩАЯ СТОИМОСТЬ: <strong>${(wSum + mSum).toLocaleString('ru-RU')} ₽</strong>
    </div>
  `;
  const cleanName = `${filePrefix}_${o ? o.name : 'Объект'}_${s.name}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
  html2pdf().from(el).set({ margin: 10, filename: cleanName, html2canvas: { scale: 2 } }).save();
}
function fillStageSelect(objSelId, stSelId) {
  const oid = Number(document.getElementById(objSelId).value);
  const list = stages.filter(s => s.object_id === oid && s.status !== 'done');
  document.getElementById(stSelId).innerHTML = list.length
    ? list.map(s => `<option value="${s.id}">${s.name}</option>`).join('')
    : '<option value="">— Нет активных этапов —</option>';
}

function calcWorkPreview() {
  const wt = wTypes.find(x => x.id === Number(document.getElementById('w-type').value));
  const qty = Number(document.getElementById('w-qty').value) || 0;
  document.getElementById('w-preview').textContent = wt ? `К начислению: ${(wt.rate * qty).toLocaleString('ru-RU')} ₽ (${wt.rate} ₽/${wt.unit})` : '';
}

async function submitWork() {
  const object_id = Number(document.getElementById('w-obj').value) || 1;
  const stVal = document.getElementById('w-stage').value;
  const stage_id = stVal ? Number(stVal) : null;
  const wt = wTypes.find(x => x.id === Number(document.getElementById('w-type').value));
  const qty = Number(document.getElementById('w-qty').value) || 0;
  const comment = document.getElementById('w-comm').value.trim();
  if (!wt || qty <= 0) return alert('Укажите вид работ и объём');

  const total = wt.rate * qty;
  const client_rate = Number(wt.client_rate) || 0;
  const client_total = client_rate * qty;
  const status = (user.role === 'admin' || user.role === 'foreman') ? 'approved' : 'pending';

  await api('work_logs', 'POST', {
    employee_id: user.id, object_id, stage_id, work_type_id: wt.id,
    work_name: `${wt.name} (${qty} ${wt.unit})`, qty, rate: wt.rate, total, client_rate, client_total, status, comment
  });

  if (status === 'approved' && stage_id) {
    await api('stage_items', 'POST', {
      stage_id, estimate_type: 'fact', item_kind: 'work',
      name: wt.name, unit: wt.unit, qty, cost_price: wt.rate, client_price: client_rate
    });
  }

  document.getElementById('w-qty').value = 1; document.getElementById('w-comm').value = '';
  alert(status === 'approved' ? 'Работа записана и добавлена в фактический отчёт этапа!' : 'Отправлено на проверку прорабу/руководителю!');
  refresh();
}

async function approveWork(id) {
  const w = wLogs.find(x => x.id === id);
  await api('work_logs?id=eq.' + id, 'PATCH', { status: 'approved' });
  if (w && w.stage_id) {
    const wt = wTypes.find(x => x.id === w.work_type_id);
    await api('stage_items', 'POST', {
      stage_id: w.stage_id, estimate_type: 'fact', item_kind: 'work',
      name: wt ? wt.name : w.work_name, unit: wt ? wt.unit : 'шт',
      qty: w.qty, cost_price: w.rate, client_price: w.client_rate || 0
    });
  }
  refresh();
}

async function rejectWork(id) {
  if (!confirm('Отклонить запись?')) return;
  await api('work_logs?id=eq.' + id, 'DELETE');
  refresh();
}

async function addPayment() {
  const employee_id = Number(document.getElementById('pay-emp').value);
  const amount = Number(document.getElementById('pay-sum').value) || 0;
  const pay_type = document.getElementById('pay-type').value;
  const comment = document.getElementById('pay-comm').value.trim();
  if (!employee_id || amount <= 0) return alert('Укажите сотрудника и сумму');
  await api('salary_payments', 'POST', { employee_id, amount, pay_type, comment });
  document.getElementById('pay-sum').value = ''; document.getElementById('pay-comm').value = '';
  alert('Выплата проведена!'); refresh();
}
function renderWorkAndSalary() {
  const m = document.getElementById('sal-month').value || new Date().toISOString().slice(0, 7);
  document.getElementById('w-obj').innerHTML = objs.filter(x => x.id !== 1).map(x => `<option value="${x.id}">${x.name}</option>`).join('') || '<option value="1">Объект</option>';
  fillStageSelect('w-obj', 'w-stage');
  document.getElementById('w-type').innerHTML = wTypes.map(w => `<option value="${w.id}">${w.name} — ${w.rate} ₽/${w.unit}</option>`).join('');
  document.getElementById('pay-emp').innerHTML = emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  calcWorkPreview();

  if (user.role === 'worker' || user.role === 'foreman') {
    const myApp = wLogs.filter(w => w.employee_id === user.id && w.status === 'approved' && w.created_at.startsWith(m));
    const myPend = wLogs.filter(w => w.employee_id === user.id && w.status === 'pending' && w.created_at.startsWith(m));
    const myPays = salPays.filter(p => p.employee_id === user.id && p.created_at.startsWith(m));
    const base = Number(user.base_salary || 0);
    const pc = myApp.reduce((s, x) => s + Number(x.total || 0), 0);
    const pnd = myPend.reduce((s, x) => s + Number(x.total || 0), 0);
    const pd = myPays.reduce((s, x) => s + Number(x.amount || 0), 0);
    document.getElementById('my-balance-box').innerHTML = `
      <div>Оклад: <strong>${base.toLocaleString('ru-RU')} ₽</strong></div>
      <div>Сдельная: <strong>+${pc.toLocaleString('ru-RU')} ₽</strong> ${pnd > 0 ? `<small style="color:#fbbf24;">(ещё ${pnd.toLocaleString('ru-RU')} ₽ на проверке)</small>` : ''}</div>
      <div>Выплачено: <strong>−${pd.toLocaleString('ru-RU')} ₽</strong></div>
      <div style="border-top:1px solid rgba(255,255,255,0.2); margin-top:6px; padding-top:6px; font-size:16px;">Остаток: <strong style="color:#34d399;">${(base + pc - pd).toLocaleString('ru-RU')} ₽</strong></div>
    `;
  }

  if (user.role === 'admin' || user.role === 'foreman') {
    const visibleLogs = wLogs.filter(w => {
      if (w.status !== 'pending') return false;
      const emp = emps.find(e => e.id === w.employee_id);
      return user.role === 'admin' || (emp && emp.role !== 'admin');
    });
    document.getElementById('pending-cnt').textContent = visibleLogs.length;
    document.getElementById('pending-list').innerHTML = visibleLogs.map(w => {
      const em = emps.find(e => e.id === w.employee_id), ob = objs.find(x => x.id === w.object_id);
      return `<div style="border-bottom:1px solid #f1f5f9; padding:8px 0; font-size:13px;">
        <strong>${em ? em.name : ''}</strong> — ${w.work_name} = <strong>${Number(w.total).toLocaleString('ru-RU')} ₽</strong>
        <div style="color:#64748b; margin:2px 0 6px;">📍 ${ob ? ob.name : ''} ${w.comment ? '(' + w.comment + ')' : ''}</div>
        <div class="row"><button onclick="approveWork(${w.id})" class="btn-green btn-sm" style="flex:1;">✅ Подтвердить</button><button onclick="rejectWork(${w.id})" class="btn-red btn-sm">✕</button></div>
      </div>`;
    }).join('') || '<div style="font-size:13px;color:#94a3b8;">Нет работ на проверке</div>';
  }

  if (user.role === 'admin') {
    document.getElementById('brigade-summary').innerHTML = emps.map(e => {
      const b = Number(e.base_salary || 0);
      const pc = wLogs.filter(w => w.employee_id === e.id && w.status === 'approved' && w.created_at.startsWith(m)).reduce((s, x) => s + Number(x.total || 0), 0);
      const pd = salPays.filter(p => p.employee_id === e.id && p.created_at.startsWith(m)).reduce((s, x) => s + Number(x.amount || 0), 0);
      return `<div class="list-row"><div><strong>${e.name}</strong><br><small style="color:#64748b;">Окл ${b} + Сд ${pc} − Выпл ${pd}</small></div><strong style="color:#059669;">${(b + pc - pd).toLocaleString('ru-RU')} ₽</strong></div>`;
    }).join('');
  }

  const myWorks = wLogs.filter(w => w.employee_id === user.id && w.created_at.startsWith(m));
  document.getElementById('my-work-list').innerHTML = myWorks.map(w => {
    const ob = objs.find(x => x.id === w.object_id);
    return `<div class="card" style="font-size:13px;"><div class="row" style="justify-content:space-between;"><strong>${w.work_name}</strong><span class="badge ${w.status}">${w.status === 'approved' ? '+' + w.total + ' ₽' : '⏳ Проверка'}</span></div><div style="color:#64748b;margin-top:4px;">📍 ${ob ? ob.name : ''} | ${new Date(w.created_at).toLocaleDateString('ru-RU')}</div></div>`;
  }).join('');
}
async function addOverhead() {
  const category = document.getElementById('oh-cat').value;
  const amount = Number(document.getElementById('oh-sum').value) || 0;
  const expense_date = document.getElementById('oh-date').value || new Date().toISOString().slice(0, 10);
  const comment = document.getElementById('oh-comm').value.trim();
  if (amount <= 0) return alert('Укажите сумму расхода');
  await api('overhead_expenses', 'POST', { category, amount, expense_date, comment });
  document.getElementById('oh-sum').value = ''; document.getElementById('oh-comm').value = '';
  refresh();
}

async function delOverhead(id) { if (confirm('Удалить расход?')) { await api('overhead_expenses?id=eq.' + id, 'DELETE'); refresh(); } }

function renderOverheads() {
  if (user.role !== 'admin') return;
  document.getElementById('overhead-list').innerHTML = overheads.map(o => `
    <div class="card row" style="justify-content:space-between;">
      <div><strong>${o.category}</strong><br><small style="color:#64748b;">${new Date(o.expense_date).toLocaleDateString('ru-RU')} ${o.comment ? '— ' + o.comment : ''}</small></div>
      <div class="row"><strong style="color:#e11d48;">−${Number(o.amount).toLocaleString('ru-RU')} ₽</strong><button onclick="delOverhead(${o.id})" class="btn-red btn-sm">✕</button></div>
    </div>`).join('');
}

function fillReportFilters() {
  document.getElementById('rep-obj').innerHTML = '<option value="all">Все объекты</option>' + objs.filter(x => x.id !== 1).map(x => `<option value="${x.id}">${x.name}</option>`).join('');
  document.getElementById('rep-emp').innerHTML = '<option value="all">Все сотрудники</option>' + emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
}

function getFilteredReportData() {
  const dFrom = document.getElementById('rep-from').value || '2000-01-01';
  const dTo = (document.getElementById('rep-to').value || '2099-12-31') + 'T23:59:59';
  const oid = document.getElementById('rep-obj').value;
  const eid = document.getElementById('rep-emp').value;

  const fWorks = wLogs.filter(w => w.status === 'approved' && w.created_at >= dFrom && w.created_at <= dTo && (oid === 'all' || w.object_id === Number(oid)) && (eid === 'all' || w.employee_id === Number(eid)));
  const fPays = stagePays.filter(p => p.created_at >= dFrom && p.created_at <= dTo && (oid === 'all' || p.object_id === Number(oid)));
  const fMats = stageItems.filter(i => {
    const st = stages.find(s => s.id === i.stage_id);
    return i.estimate_type === 'fact' && i.item_kind === 'mat' && i.created_at >= dFrom && i.created_at <= dTo && (oid === 'all' || (st && st.object_id === Number(oid)));
  });
  const fOh = overheads.filter(o => (o.expense_date || o.created_at) >= dFrom && (o.expense_date || o.created_at) <= dTo);

  const incSum = fPays.reduce((s, p) => s + Number(p.amount), 0);
  const workSalarySum = fWorks.reduce((s, w) => s + Number(w.total), 0);
  const matCostSum = fMats.reduce((s, m) => s + Number(m.qty) * Number(m.cost_price), 0);
  const ohSum = oid === 'all' && eid === 'all' ? fOh.reduce((s, o) => s + Number(o.amount), 0) : 0;
  const baseSum = (oid === 'all') ? (eid === 'all' ? emps.reduce((s, e) => s + Number(e.base_salary || 0), 0) : Number(emps.find(e => e.id === Number(eid))?.base_salary || 0)) : 0;
  const profit = incSum - workSalarySum - baseSum - matCostSum - ohSum;

  return { fWorks, incSum, workSalarySum, baseSum, matCostSum, ohSum, profit };
}

function buildReport() {
  const r = getFilteredReportData();
  document.getElementById('report-output').innerHTML = `
    <div class="card" style="background:#f8fafc;">
      <h4 style="margin-bottom:8px;">📊 Сводные показатели за период</h4>
      <div class="list-row"><span>Поступления от заказчиков:</span><strong style="color:#059669;">+${r.incSum.toLocaleString('ru-RU')} ₽</strong></div>
      <div class="list-row"><span>Сдельная ЗП по работам:</span><strong>−${r.workSalarySum.toLocaleString('ru-RU')} ₽</strong></div>
      <div class="list-row"><span>Фиксированные оклады (мес.):</span><strong>−${r.baseSum.toLocaleString('ru-RU')} ₽</strong></div>
      <div class="list-row"><span>Закупка материалов (факт):</span><strong>−${r.matCostSum.toLocaleString('ru-RU')} ₽</strong></div>
      <div class="list-row"><span>Накладные расходы:</span><strong>−${r.ohSum.toLocaleString('ru-RU')} ₽</strong></div>
      <div class="list-row" style="font-size:16px; border:none; padding-top:10px;"><strong>Итоговый заработок компании:</strong><strong style="color:${r.profit >= 0 ? '#059669' : '#e11d48'};">${r.profit.toLocaleString('ru-RU')} ₽</strong></div>
    </div>
    <h4 style="margin:8px 4px;">Детализация работ (${r.fWorks.length}):</h4>
    ${r.fWorks.map(w => {
      const em = emps.find(e => e.id === w.employee_id), ob = objs.find(x => x.id === w.object_id);
      return `<div class="card" style="font-size:12px;"><strong>${w.work_name}</strong> — ${em ? em.name : ''}<br>📍 ${ob ? ob.name : ''} | Дата: ${new Date(w.created_at).toLocaleDateString('ru-RU')} | ЗП: <strong>${w.total} ₽</strong></div>`;
    }).join('')}
  `;
}

function exportReportExcel() {
  if (typeof XLSX === 'undefined') return alert('Подождите загрузки Excel');
  const r = getFilteredReportData();
  const sumRows = [
    ['ФИНАНСОВЫЙ И РАБОЧИЙ ОТЧЁТ'],
    ['Поступления от заказчиков', r.incSum],
    ['Сдельная ЗП по работам', r.workSalarySum],
    ['Оклады сотрудников', r.baseSum],
    ['Закупка материалов', r.matCostSum],
    ['Накладные расходы', r.ohSum],
    ['ЧИСТЫЙ ЗАРАБОТОК ОРГАНИЗАЦИИ', r.profit]
  ];
  const workRows = [['Дата', 'Сотрудник', 'Объект', 'Работа', 'Кол-во', 'ЗП, ₽', 'Заказчику, ₽']];
  r.fWorks.forEach(w => {
    const em = emps.find(e => e.id === w.employee_id), ob = objs.find(x => x.id === w.object_id);
    workRows.push([new Date(w.created_at).toLocaleDateString('ru-RU'), em ? em.name : '', ob ? ob.name : '', w.work_name, w.qty, w.total, w.client_total || 0]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'Финансы_итог');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(workRows), 'Выполненные_работы');
  XLSX.writeFile(wb, `Финансовый_отчет_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.xlsx`);
}
