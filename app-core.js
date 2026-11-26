// === ВПИШИТЕ ВАШИ КЛЮЧИ SUPABASE СЮДА ===
const SB_URL = 'https://hedvmvvagozcnfufvnnh.supabase.co';
const SB_KEY = 'sb_publishable_ROfy0OkzwSF-mA9xZEt0UQ_dZ0agsaQ';
// =========================================

let user = null, tools = [], emps = [], objs = [], cons = [], wTypes = [], wLogs = [], salPays = [];
let stages = [], stageItems = [], stagePays = [], overheads = [];

async function api(path, method = 'GET', body = null) {
  const opt = { method, headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } };
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(SB_URL + '/rest/v1/' + path, opt);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function uploadPhoto(id) {
  const inp = document.getElementById(id);
  if (!inp || !inp.files || !inp.files.length) return null;
  const rawFile = inp.files.item(0);
  const blob = await new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => resolve(b || rawFile), 'image/jpeg', 0.8);
    };
    img.onerror = () => resolve(rawFile);
    img.src = URL.createObjectURL(rawFile);
  });
  const fn = Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.jpg';
  const res = await fetch(`${SB_URL}/storage/v1/object/tool-photos/${fn}`, {
    method: 'POST', headers: { 'apikey': SB_KEY, 'Content-Type': 'image/jpeg' }, body: blob
  });
  return res.ok ? `${SB_URL}/storage/v1/object/public/tool-photos/${fn}` : null;
}

window.onload = async () => {
  try {
    emps = await api('employees?select=*&order=name.asc');
    document.getElementById('login-emp').innerHTML = emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    const now = new Date();
    const mStr = now.toISOString().slice(0, 7);
    const dStr = now.toISOString().slice(0, 10);
    document.getElementById('sal-month').value = mStr;
    document.getElementById('dash-month').value = mStr;
    document.getElementById('oh-date').value = dStr;
    document.getElementById('rep-from').value = mStr + '-01';
    document.getElementById('rep-to').value = dStr;
  } catch (e) { document.getElementById('err-msg').textContent = 'Ошибка подключения: проверьте ключи'; }
};

function doLogin() {
  const id = Number(document.getElementById('login-emp').value);
  const pin = document.getElementById('login-pin').value.trim();
  user = emps.find(e => e.id === id);
  if (!user || user.pin !== pin) { document.getElementById('err-msg').textContent = 'Неверный ПИН-код'; return; }

  const roleNames = { admin: 'Руководитель', foreman: 'Прораб', worker: 'Монтажник' };
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('top-bar').classList.remove('hidden');
  document.getElementById('user-title').textContent = user.name;
  document.getElementById('user-role-lbl').textContent = roleNames[user.role] || 'Сотрудник';

  if (user.role === 'admin') {
    document.getElementById('hub-settings-btn').classList.remove('hidden');
    document.getElementById('n-admin').classList.remove('hidden');
    document.getElementById('admin-add-cons').classList.remove('hidden');
    document.getElementById('admin-dash-card').classList.remove('hidden');
    document.getElementById('admin-pay-box').classList.remove('hidden');
    document.getElementById('worker-sal-card').classList.add('hidden');
    document.getElementById('np-overhead').classList.remove('hidden');
    document.getElementById('np-reports').classList.remove('hidden');
    document.getElementById('approve-box').classList.remove('hidden');
  } else if (user.role === 'foreman') {
    document.getElementById('approve-box').classList.remove('hidden');
    document.getElementById('admin-add-cons').classList.remove('hidden');
  }

  refresh();
  openHub();
}

async function refresh() {
  [tools, objs, emps, cons, wTypes, wLogs, salPays, stages, stageItems, stagePays, overheads] = await Promise.all([
    api('tools?select=*&order=inv_number.asc'),
    api('objects?select=*&is_active=eq.true&order=name.asc'),
    api('employees?select=*&order=name.asc'),
    api('consumables?select=*&order=name.asc'),
    api('work_types?select=*&order=name.asc'),
    api('work_logs?select=*&order=created_at.desc'),
    api('salary_payments?select=*&order=created_at.desc'),
    api('object_stages?select=*&order=id.desc'),
    api('stage_items?select=*&order=id.asc'),
    api('stage_payments?select=*&order=created_at.desc'),
    api('overhead_expenses?select=*&order=expense_date.desc')
  ]);
  objs.sort((a, b) => a.id === 1 ? -1 : b.id === 1 ? 1 : a.name.localeCompare(b.name, 'ru'));
  if (user) {
    const fresh = emps.find(e => e.id === user.id);
    if (fresh) user = fresh;
  }
  renderTools(); renderCons(); renderSettingsLists(); renderProjectsAll();
}
function openHub() {
  if (typeof stopCam === 'function') stopCam();
  if (typeof stopReceiptCam === 'function') stopReceiptCam();
  ['hub-screen'].forEach(x => document.getElementById(x).classList.remove('hidden'));
  ['mod-tools', 'mod-projects', 'mod-settings', 'nav-tools', 'nav-projects', 'btn-home'].forEach(x => document.getElementById(x).classList.add('hidden'));
}

function openModule(m) {
  document.getElementById('hub-screen').classList.add('hidden');
  document.getElementById('btn-home').classList.remove('hidden');
  if (m === 'tools') {
    document.getElementById('mod-tools').classList.remove('hidden');
    document.getElementById('nav-tools').classList.remove('hidden');
    tab('tools');
  } else if (m === 'projects') {
    document.getElementById('mod-projects').classList.remove('hidden');
    document.getElementById('nav-projects').classList.remove('hidden');
    ptab('objs');
  } else if (m === 'settings') {
    document.getElementById('mod-settings').classList.remove('hidden');
    renderSettingsLists();
  }
}

// === ЕДИНЫЕ СПРАВОЧНИКИ (РУКОВОДИТЕЛЬ) ===
function renderSettingsLists() {
  const roleLbl = { admin: 'Руководитель', foreman: 'Прораб', worker: 'Монтажник' };
  document.getElementById('admin-emps-list').innerHTML = emps.map(e => `
    <div class="list-row">
      <div><strong>${e.name}</strong> <span class="badge stock">${roleLbl[e.role] || e.role}</span><br><small style="color:#64748b;">ПИН: ${e.pin} | Оклад: ${Number(e.base_salary || 0).toLocaleString('ru-RU')} ₽</small></div>
      <div class="row">
        <button onclick="setSalary(${e.id})" class="btn-dark btn-sm">₽ Оклад</button>
        ${e.id !== user.id ? `<button onclick="delEmp(${e.id})" class="btn-red btn-sm">✕</button>` : ''}
      </div>
    </div>`).join('');

  const activeObjs = objs.filter(o => o.id !== 1);
  document.getElementById('objs-count').textContent = activeObjs.length;
  const q = (document.getElementById('o-search')?.value || '').toLowerCase().trim();
  const filteredObjs = objs.filter(o => o.name.toLowerCase().includes(q));
  document.getElementById('admin-objs-list').innerHTML = filteredObjs.map(o => `
    <div class="list-row">
      <span>${o.name}</span>
      ${o.id !== 1 ? `<div class="row"><button onclick="editObj(${o.id})" class="btn-dark btn-sm">✏️</button><button onclick="closeObj(${o.id})" class="btn-red btn-sm">Закрыть</button></div>` : '<span style="font-size:11px;color:#94a3b8;">База</span>'}
    </div>`).join('');

  document.getElementById('settings-price-list').innerHTML = wTypes.map(w => `
    <div class="list-row">
      <div><strong>${w.name}</strong> (${w.unit})<br><small style="color:#64748b;">ЗП: ${w.rate} ₽ | Заказчику: ${w.client_rate || 0} ₽</small></div>
      <button onclick="delWorkType(${w.id})" class="btn-red btn-sm">✕</button>
    </div>`).join('');
}

async function addEmp() {
  const name = document.getElementById('e-name').value.trim(), pin = document.getElementById('e-pin').value.trim(), role = document.getElementById('e-role').value;
  if (!name || pin.length !== 4) return alert('Нужно ФИО и 4 цифры ПИНа');
  await api('employees', 'POST', { name, pin, role, base_salary: 0 });
  document.getElementById('e-name').value = ''; document.getElementById('e-pin').value = ''; refresh();
}
async function setSalary(id) {
  const e = emps.find(x => x.id === id);
  const val = prompt(`Оклад в месяц для ${e.name} (₽):`, e.base_salary || 0);
  if (val !== null) { await api('employees?id=eq.' + id, 'PATCH', { base_salary: Number(val) || 0 }); refresh(); }
}
async function delEmp(id) { if (confirm('Удалить сотрудника?')) { await api('employees?id=eq.' + id, 'DELETE'); refresh(); } }

async function addObj() { const name = document.getElementById('o-name').value.trim(); if (name) { await api('objects', 'POST', { name }); document.getElementById('o-name').value = ''; refresh(); } }
async function editObj(id) {
  const o = objs.find(x => x.id === id);
  const n = prompt('Новое название объекта:', o.name);
  if (n && n.trim()) { await api('objects?id=eq.' + id, 'PATCH', { name: n.trim() }); refresh(); }
}
async function closeObj(id) { if (confirm('Закрыть объект?')) { await api('objects?id=eq.' + id, 'PATCH', { is_active: false }); refresh(); } }

async function addWorkType() {
  const name = document.getElementById('p-name').value.trim();
  const rate = Number(document.getElementById('p-rate').value) || 0;
  const client_rate = Number(document.getElementById('p-client-rate').value) || 0;
  const unit = document.getElementById('p-unit').value;
  if (!name) return alert('Введите название работы');
  await api('work_types', 'POST', { name, rate, client_rate, unit });
  document.getElementById('p-name').value = ''; document.getElementById('p-rate').value = ''; document.getElementById('p-client-rate').value = ''; refresh();
}
async function delWorkType(id) { if (confirm('Удалить позицию из прайса?')) { await api('work_types?id=eq.' + id, 'DELETE'); refresh(); } }

function downloadPriceTemplate() {
  if (typeof XLSX === 'undefined') return alert('Подождите загрузки библиотеки Excel');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { 'Наименование работы': 'Прокладка кабеля в гофре', 'Ед. изм.': 'м', 'ЗП работнику': 80, 'Цена заказчику': 130 },
    { 'Наименование работы': 'Монтаж розетки / выключателя', 'Ед. изм.': 'шт', 'ЗП работнику': 250, 'Цена заказчику': 400 }
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Прайс_работ');
  XLSX.writeFile(wb, 'Шаблон_прайс_работ.xlsx');
}

async function importPriceExcel(inp) {
  const file = inp.files.item(0);
  if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    const sheet = wb.Sheets.item ? wb.Sheets.item(0) : wb.Sheets[wb.SheetNames.at(0)];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const payload = rows.filter(r => r['Наименование работы'] && String(r['Наименование работы']).trim()).map(r => ({
      name: String(r['Наименование работы']).trim(),
      unit: r['Ед. изм.'] ? String(r['Ед. изм.']).trim() : 'шт',
      rate: Number(r['ЗП работнику']) || 0,
      client_rate: Number(r['Цена заказчику']) || 0
    }));
    if (payload.length) { await api('work_types', 'POST', payload); alert(`Загружено расценок: ${payload.length}`); refresh(); }
    inp.value = '';
  } catch (e) { alert('Ошибка чтения прайса: ' + e.message); inp.value = ''; }
}
