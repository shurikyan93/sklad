const SB_URL = 'https://hedvmvvagozcnfufvnnh.supabase.co';
const SB_KEY = 'sb_publishable_ROfy0OkzwSF-mA9xZEt0UQ_dZ0agsaQ';

let user = null, activeMod = null;
let emps = [], objs = [], wTypes = [], stages = [], stageItems = [], stagePays = [];
let wLogs = [], salPays = [], overheads = [];
let tools = [], cons = [], tLogs = [];

async function api(path, method = 'GET', body = null) {
  const headers = { apikey: SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (SB_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + SB_KEY;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, opts);
  const txt = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

const roleName = r => r === 'admin' ? 'Руководитель' : r === 'foreman' ? 'Прораб' : 'Монтажник';

function saveSession(u) {
  user = u;
  try { localStorage.setItem('portal_user_id', String(u.id)); } catch (e) {}
}

function clearSession() {
  user = null;
  try { localStorage.removeItem('portal_user_id'); } catch (e) {}
}

function renderLoginUsers() {
  const sel = document.getElementById('login-emp-sel');
  if (!sel) return;
  if (!emps.length) {
    sel.innerHTML = '<option value="">Нет доступных сотрудников</option>';
    return;
  }
  sel.innerHTML = emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
}

async function login() {
  const pin = document.getElementById('pin-input').value.trim();
  const sel = document.getElementById('login-emp-sel');
  const err = document.getElementById('login-err');
  err.textContent = '';
  if (!pin) { err.textContent = 'Введите ПИН-код'; return; }
  try {
    let found = null;
    if (sel && sel.value) {
      found = emps.find(e => Number(e.id) === Number(sel.value) && String(e.pin) === pin);
    } else {
      const rows = await api(`employees?pin=eq.${encodeURIComponent(pin)}`);
      if (rows && rows.length) found = rows.at(0);
    }
    if (!found) { err.textContent = 'Неверный ПИН-код'; return; }
    saveSession(found);
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('pin-input').value = '';
    await refresh();
    openHub();
  } catch (e) { err.textContent = 'Ошибка: ' + e.message; }
}

function logout() {
  clearSession();
  activeMod = null;
  if (typeof stopCam === 'function') stopCam();
  if (typeof stopReceiptCam === 'function') stopReceiptCam();
  document.querySelectorAll('[id^="mod-"], nav, #hub-screen').forEach(el => el.classList.add('hidden'));
  document.getElementById('login-screen').classList.remove('hidden');
  renderLoginUsers();
}
async function refresh() {
  const [e, o, wt, st, si, sp, wl, sal, oh, tl, cn, tlg] = await Promise.all([
    api('employees?order=name.asc'),
    api('objects?order=id.desc'),
    api('work_types?order=id.asc'),
    api('object_stages?order=id.asc'),
    api('stage_items?order=id.asc'),
    api('stage_payments?order=id.desc'),
    api('work_logs?order=created_at.desc'),
    api('salary_payments?order=created_at.desc'),
    api('overhead_expenses?order=expense_date.desc,id.desc'),
    api('tools?order=id.desc'),
    api('consumables?order=id.asc'),
    api('logs?order=created_at.desc&limit=80')
  ]);
  emps = e || []; objs = o || []; wTypes = wt || [];
  stages = st || []; stageItems = si || []; stagePays = sp || [];
  wLogs = wl || []; salPays = sal || []; overheads = oh || [];
  tools = tl || []; cons = cn || []; tLogs = tlg || [];
  if (user) {
    const fresh = emps.find(x => x.id === user.id);
    if (fresh) saveSession(fresh);
  }
  renderActiveView();
}

function openHub() {
  activeMod = null;
  if (typeof stopCam === 'function') stopCam();
  if (typeof stopReceiptCam === 'function') stopReceiptCam();
  document.querySelectorAll('[id^="mod-"], nav').forEach(el => el.classList.add('hidden'));
  document.getElementById('hub-screen').classList.remove('hidden');
  document.getElementById('hub-user').textContent = user.name;
  document.getElementById('hub-role').textContent = roleName(user.role);

  const isAdmin = user.role === 'admin', isForeman = user.role === 'foreman', isWorker = user.role === 'worker';
  document.getElementById('hub-overhead-btn').classList.toggle('hidden', !isAdmin);
  document.getElementById('hub-reports-btn').classList.toggle('hidden', !isAdmin);
  document.getElementById('hub-ref-btn').classList.toggle('hidden', !isAdmin);
  document.getElementById('hub-proj-sub').textContent = isWorker ? 'Фактически выполненные работы и материалы по этапам' : 'Этапы работ, КП/Отчёт в PDF, чеки и оплаты';

  const statsEl = document.getElementById('admin-hub-stats');
  if (isAdmin) {
    statsEl.classList.remove('hidden');
    const inc = stagePays.reduce((s, p) => s + Number(p.amount || 0), 0);
    const wPay = wLogs.filter(w => w.status === 'approved').reduce((s, w) => s + Number(w.total || 0), 0);
    const mCost = stageItems.filter(i => i.estimate_type === 'fact' && i.item_kind === 'mat').reduce((s, i) => s + Number(i.qty || 0) * Number(i.cost_price || 0), 0);
    const ohSum = overheads.reduce((s, o) => s + Number(o.amount || 0), 0);
    const monthBase = emps.reduce((s, emp) => s + (emp.salary_type === 'day' ? 0 : Number(emp.base_salary || 0)), 0);
    const profit = inc - wPay - mCost - ohSum - monthBase;
    const activeObjs = objs.filter(x => x.id !== 1 && x.status !== 'done').length;
    statsEl.innerHTML = `<div class="stat-box"><small>Поступило от клиентов</small><strong style="color:#34d399;">${inc.toLocaleString('ru-RU')} ₽</strong></div><div class="stat-box"><small>Сдельная ЗП работникам</small><strong>${wPay.toLocaleString('ru-RU')} ₽</strong></div><div class="stat-box"><small>Закупка материалов</small><strong>${mCost.toLocaleString('ru-RU')} ₽</strong></div><div class="stat-box"><small>Накладные расходы</small><strong>${ohSum.toLocaleString('ru-RU')} ₽</strong></div><div class="stat-box"><small>Оклады (мес.) / Объектов</small><strong>${monthBase.toLocaleString('ru-RU')} ₽ · ${activeObjs}</strong></div><div class="stat-box"><small>Итоговый баланс</small><strong style="color:${profit >= 0 ? '#34d399' : '#fb7185'};">${profit.toLocaleString('ru-RU')} ₽</strong></div>`;
  } else if (isForeman) {
    statsEl.classList.remove('hidden');
    const pend = wLogs.filter(w => w.status === 'pending').length;
    const activeObjs = objs.filter(x => x.id !== 1 && x.status !== 'done').length;
    statsEl.innerHTML = `<div class="stat-box"><small>Активных объектов</small><strong>${activeObjs}</strong></div><div class="stat-box"><small>Работ на проверке</small><strong style="color:#fbbf24;">${pend}</strong></div>`;
  } else statsEl.classList.add('hidden');
}

function makeHdr(title, sub) {
  return `<div class="row" style="justify-content:space-between;"><div><div style="font-size:17px;font-weight:bold;">${title}</div><div style="font-size:12px;color:#94a3b8;">${sub || user.name + ' · ' + roleName(user.role)}</div></div><button onclick="openHub()" class="btn-sm" style="background:#334155;">🏠 Меню</button></div>`;
}

function openModule(mod) {
  activeMod = mod;
  document.getElementById('hub-screen').classList.add('hidden');
  document.querySelectorAll('[id^="mod-"], nav').forEach(el => el.classList.add('hidden'));
  document.getElementById('mod-' + mod).classList.remove('hidden');
  if (mod === 'tools') { document.getElementById('t-hdr').innerHTML = makeHdr('🧰 Инструмент и расходники'); document.getElementById('nav-tools').classList.remove('hidden'); if (typeof showToolTab === 'function') showToolTab('tools'); }
  else if (mod === 'projects') { document.getElementById('p-hdr').innerHTML = makeHdr('🏗️ Объекты, этапы и смета'); if (typeof backToObjList === 'function') backToObjList(); }
  else if (mod === 'salary') { document.getElementById('s-hdr').innerHTML = makeHdr('💰 Работы и зарплата'); if (typeof renderSalaryMod === 'function') renderSalaryMod(); }
  else if (mod === 'overhead') { document.getElementById('o-hdr').innerHTML = makeHdr('🧾 Накладные расходы'); if (typeof renderOverheads === 'function') renderOverheads(); }
  else if (mod === 'reports') { document.getElementById('r-hdr').innerHTML = makeHdr('📊 Отчёты'); if (typeof initReports === 'function') initReports(); }
  else if (mod === 'references') { document.getElementById('ref-hdr').innerHTML = makeHdr('📚 Справочники'); renderRefs(); }
}
function renderActiveView() {
  if (!user || !activeMod) return;
  if (activeMod === 'tools' && typeof renderToolsMod === 'function') renderToolsMod();
  if (activeMod === 'projects' && typeof renderProjectsMod === 'function') renderProjectsMod();
  if (activeMod === 'salary' && typeof renderSalaryMod === 'function') renderSalaryMod();
  if (activeMod === 'overhead' && typeof renderOverheads === 'function') renderOverheads();
  if (activeMod === 'reports' && typeof renderReports === 'function') renderReports();
  if (activeMod === 'references') renderRefs();
}

function openModal(html) { document.getElementById('modal-body').innerHTML = html; document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); document.getElementById('modal-body').innerHTML = ''; }

function renderRefs() {
  document.getElementById('ref-emp-list').innerHTML = emps.map(e => `<div class="list-row"><div><strong>${e.name}</strong> <span class="badge stock">${roleName(e.role)}</span><br><small style="color:#64748b;">ПИН: ${e.pin} · Оклад: ${Number(e.base_salary || 0).toLocaleString('ru-RU')} ${e.salary_type === 'day' ? '₽/день' : '₽/мес'}</small></div><div class="row"><button onclick="editEmpModal(${e.id})" class="btn-sm">✏️</button><button onclick="delEmp(${e.id})" class="btn-sm btn-red">✕</button></div></div>`).join('');
  document.getElementById('ref-obj-list').innerHTML = objs.filter(x => x.id !== 1).map(o => `<div class="list-row"><div><strong>${o.name}</strong></div><div class="row"><button onclick="editObjModal(${o.id})" class="btn-sm">✏️</button><button onclick="delObj(${o.id})" class="btn-sm btn-red">✕</button></div></div>`).join('');
  renderRefPriceList();
}

function renderRefPriceList() {
  const q = (document.getElementById('ref-wt-search')?.value || '').trim().toLowerCase();
  const list = wTypes.filter(w => !q || w.name.toLowerCase().includes(q) || (w.unit || '').toLowerCase().includes(q));
  document.getElementById('ref-wt-list').innerHTML = list.map(w => `<div class="list-row"><div><strong>${w.name}</strong> <small style="color:#64748b;">(${w.unit || 'шт'})</small><br><small style="color:#059669;">ЗП: ${Number(w.rate || 0).toLocaleString('ru-RU')} ₽ · Клиент: ${Number(w.client_rate || 0).toLocaleString('ru-RU')} ₽</small></div><div class="row"><button onclick="editWorkTypeModal(${w.id})" class="btn-sm">✏️</button><button onclick="delWorkType(${w.id})" class="btn-sm btn-red">✕</button></div></div>`).join('') || '<div style="font-size:12px;color:#94a3b8;padding:8px 0;">Ничего не найдено</div>';
}

async function addEmp() {
  const name = document.getElementById('ref-emp-name').value.trim(), pin = document.getElementById('ref-emp-pin').value.trim();
  const role = document.getElementById('ref-emp-role').value, salary_type = document.getElementById('ref-emp-saltype').value, base_salary = Number(document.getElementById('ref-emp-sal').value) || 0;
  if (!name || !pin) return alert('Укажите ФИО и ПИН-код');
  await api('employees', 'POST', { name, pin, role, salary_type, base_salary });
  document.getElementById('ref-emp-name').value = ''; document.getElementById('ref-emp-pin').value = ''; document.getElementById('ref-emp-sal').value = '';
  await refresh();
}

function editEmpModal(id) {
  const e = emps.find(x => x.id === id);
  if (e) openModal(`<h3>✏️ Редактировать сотрудника</h3><input id="ed-emp-name" value="${e.name}"><input id="ed-emp-pin" value="${e.pin}"><select id="ed-emp-role"><option value="worker" ${e.role === 'worker' ? 'selected' : ''}>Монтажник</option><option value="foreman" ${e.role === 'foreman' ? 'selected' : ''}>Прораб</option><option value="admin" ${e.role === 'admin' ? 'selected' : ''}>Руководитель</option></select><select id="ed-emp-stype"><option value="month" ${e.salary_type !== 'day' ? 'selected' : ''}>Оклад в месяц</option><option value="day" ${e.salary_type === 'day' ? 'selected' : ''}>Оклад в день (смена)</option></select><input id="ed-emp-sal" type="number" value="${Number(e.base_salary || 0)}"><div class="row"><button onclick="saveEmp(${id})" class="btn-green">Сохранить</button><button onclick="closeModal()" class="btn-red">Отмена</button></div>`);
}

async function saveEmp(id) { await api('employees?id=eq.' + id, 'PATCH', { name: document.getElementById('ed-emp-name').value.trim(), pin: document.getElementById('ed-emp-pin').value.trim(), role: document.getElementById('ed-emp-role').value, salary_type: document.getElementById('ed-emp-stype').value, base_salary: Number(document.getElementById('ed-emp-sal').value) || 0 }); closeModal(); await refresh(); }
async function delEmp(id) { if (confirm('Удалить сотрудника?')) { await api('employees?id=eq.' + id, 'DELETE'); await refresh(); } }
async function addObj() { const name = document.getElementById('ref-obj-name').value.trim(); if (name) { await api('objects', 'POST', { name, is_active: true }); document.getElementById('ref-obj-name').value = ''; await refresh(); } }
function editObjModal(id) { const o = objs.find(x => x.id === id); if (o) openModal(`<h3>✏️ Редактировать объект</h3><input id="ed-obj-name" value="${o.name}"><div class="row"><button onclick="saveObj(${id})" class="btn-green">Сохранить</button><button onclick="closeModal()" class="btn-red">Отмена</button></div>`); }
async function saveObj(id) { await api('objects?id=eq.' + id, 'PATCH', { name: document.getElementById('ed-obj-name').value.trim() }); closeModal(); await refresh(); }
async function delObj(id) { if (confirm('Удалить объект?')) { await api('objects?id=eq.' + id, 'DELETE'); await refresh(); } }

async function addWorkType() {
  const name = document.getElementById('ref-wt-name').value.trim(), unit = document.getElementById('ref-wt-unit').value, rate = Number(document.getElementById('ref-wt-rate').value) || 0, client_rate = Number(document.getElementById('ref-wt-client').value) || 0;
  if (!name) return alert('Укажите название работы');
  await api('work_types', 'POST', { name, unit, rate, client_rate });
  document.getElementById('ref-wt-name').value = ''; document.getElementById('ref-wt-rate').value = ''; document.getElementById('ref-wt-client').value = '';
  await refresh();
}

function editWorkTypeModal(id) {
  const w = wTypes.find(x => x.id === id);
  if (!w) return;
  const units = ['шт', 'м', 'кв.м', 'комплекс', 'услуга', 'выезд', 'пролет'];
  openModal(`<h3>✏️ Редактировать позицию прайса</h3><input id="ed-wt-name" value="${w.name}"><select id="ed-wt-unit">${units.map(u => `<option value="${u}" ${w.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select><div class="row"><input id="ed-wt-rate" type="number" value="${Number(w.rate || 0)}"><input id="ed-wt-client" type="number" value="${Number(w.client_rate || 0)}"></div><div class="row"><button onclick="saveWorkType(${id})" class="btn-green">Сохранить</button><button onclick="closeModal()" class="btn-red">Отмена</button></div>`);
}

async function saveWorkType(id) { await api('work_types?id=eq.' + id, 'PATCH', { name: document.getElementById('ed-wt-name').value.trim(), unit: document.getElementById('ed-wt-unit').value, rate: Number(document.getElementById('ed-wt-rate').value) || 0, client_rate: Number(document.getElementById('ed-wt-client').value) || 0 }); closeModal(); await refresh(); }
async function delWorkType(id) { if (confirm('Удалить позицию из прайса?')) { await api('work_types?id=eq.' + id, 'DELETE'); await refresh(); } }

function downloadPriceTemplate() {
  if (typeof XLSX === 'undefined') return alert('Excel библиотека не загружена');
  const ws = XLSX.utils.aoa_to_sheet([['Наименование', 'Ед. изм.', 'ЗП работнику', 'Цена заказчику'], ['Монтаж щита', 'шт', 2500, 4500], ['Прокладка кабеля', 'м', 80, 160]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Прайс'); XLSX.writeFile(wb, 'Шаблон_прайс_листа.xlsx');
}

async function importPriceExcel(input) {
  const file = input.files.item(0);
  if (!file || typeof XLSX === 'undefined') return;
  const wb = XLSX.read(await file.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.at(0)], { header: 1 }).slice(1);
  for (const r of rows) {
    if (!r || !r.at(0)) continue;
    await api('work_types', 'POST', { name: String(r.at(0)).trim(), unit: String(r.at(1) || 'шт').trim(), rate: Number(r.at(2)) || 0, client_rate: Number(r.at(3)) || 0 });
  }
  input.value = ''; alert('Прайс-лист загружен!'); await refresh();
}

async function initLoginScreen() {
  const sel = document.getElementById('login-emp-sel');
  const err = document.getElementById('login-err');
  try {
    emps = await api('employees?order=name.asc') || [];
    renderLoginUsers();
    const savedId = localStorage.getItem('portal_user_id');
    if (savedId) {
      const found = emps.find(e => Number(e.id) === Number(savedId));
      if (found) {
        saveSession(found);
        document.getElementById('login-screen').classList.add('hidden');
        await refresh();
        openHub();
      }
    }
  } catch (e) {
    clearSession();
    if (sel) sel.innerHTML = '<option value="">Ошибка подключения</option>';
    if (err) err.textContent = 'Ошибка загрузки списка сотрудников: ' + e.message;
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initLoginScreen);
} else {
  initLoginScreen();
}
