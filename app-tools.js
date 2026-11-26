let flt = 'all', camStream = null, scanTimer = null, curConsId = null;

function setFlt(f) { flt = f; renderTools(); }

function renderTools() {
  const q = document.getElementById('search').value.toLowerCase();
  const st = { stock: 'На складе', work: 'В работе', repair: 'В ремонте' };
  document.getElementById('tools-list').innerHTML = tools
    .filter(t => (flt === 'all' || t.status === flt) && (t.name.toLowerCase().includes(q) || t.inv_number.toLowerCase().includes(q)))
    .map(t => {
      const h = emps.find(e => e.id === t.holder_id), o = objs.find(x => x.id === t.object_id);
      return `<div class="card" onclick="openTool(${t.id})" style="cursor:pointer;">
        <div class="row" style="justify-content:space-between;"><strong>${t.inv_number} — ${t.name}</strong><span class="badge ${t.status}">${st[t.status]}</span></div>
        <div style="font-size:12px; color:#64748b; margin-top:6px;">📍 ${o ? o.name : 'Склад'} ${h ? '| 👷 ' + h.name : ''}</div>
      </div>`;
    }).join('');
}

function getPhotos(t) {
  if (!t.photo_url) return [];
  if (t.photo_url.startsWith('[')) { try { return JSON.parse(t.photo_url); } catch (e) { return []; } }
  return [t.photo_url];
}

function zoomImg(src) {
  document.getElementById('zoom-img').src = src;
  document.getElementById('zoom-modal').classList.remove('hidden');
}

async function setMainPhoto(id, idx) {
  const t = tools.find(x => x.id === id), arr = getPhotos(t);
  const [chosen] = arr.splice(idx, 1); arr.unshift(chosen);
  await api('tools?id=eq.' + id, 'PATCH', { photo_url: JSON.stringify(arr) });
  await refresh(); openTool(id);
}

async function delPhoto(id, idx) {
  if (!confirm('Удалить это фото?')) return;
  const t = tools.find(x => x.id === id), arr = getPhotos(t);
  arr.splice(idx, 1);
  await api('tools?id=eq.' + id, 'PATCH', { photo_url: arr.length ? JSON.stringify(arr) : null });
  await refresh(); openTool(id);
}

async function addCardPhoto(id) {
  const t = tools.find(x => x.id === id), arr = getPhotos(t);
  if (arr.length >= 3) return alert('Максимум 3 фото');
  const url = await uploadPhoto('m-new-photo');
  if (!url) return alert('Не удалось загрузить фото');
  arr.push(url);
  await api('tools?id=eq.' + id, 'PATCH', { photo_url: JSON.stringify(arr) });
  await refresh(); openTool(id);
}

function openTool(id) {
  const t = tools.find(x => x.id === id);
  if (!t) return;
  const h = emps.find(e => e.id === t.holder_id), o = objs.find(x => x.id === t.object_id);
  document.getElementById('m-inv').textContent = t.inv_number + (t.serial_number ? ' (S/N: ' + t.serial_number + ')' : '');
  document.getElementById('m-name').textContent = t.name;

  const photos = getPhotos(t), img = document.getElementById('m-photo');
  if (photos.length) {
    img.src = photos.at(0); img.onclick = () => zoomImg(photos.at(0)); img.classList.remove('hidden');
  } else img.classList.add('hidden');

  const oldGal = document.getElementById('m-gallery');
  if (oldGal) oldGal.remove();
  let galHtml = '<div id="m-gallery" style="margin-bottom:10px;">';
  if (photos.length) {
    galHtml += '<div style="display:flex; gap:6px; margin-bottom:8px;">' + photos.map((p, i) => `
      <div style="flex:1; border:2px solid ${i === 0 ? '#2563eb' : '#e2e8f0'}; border-radius:8px; padding:3px; text-align:center;">
        <img src="${p}" onclick="zoomImg('${p}')" style="width:100%; height:58px; object-fit:contain; cursor:zoom-in; background:#f8fafc; border-radius:5px;">
        ${user.role === 'admin' ? `<div style="display:flex; gap:3px; margin-top:3px;">
          ${i > 0 ? `<button onclick="setMainPhoto(${t.id},${i})" class="btn-sm" style="flex:1; padding:2px; font-size:10px;">⭐ Главн.</button>` : '<span style="flex:1; font-size:10px; color:#2563eb; font-weight:bold;">Главная</span>'}
          <button onclick="delPhoto(${t.id},${i})" class="btn-red btn-sm" style="padding:2px 5px; font-size:10px;">✕</button>
        </div>` : ''}
      </div>`).join('') + '</div>';
  }
  if (user.role === 'admin' && photos.length < 3) {
    galHtml += `<div class="row" style="margin-top:4px;"><input id="m-new-photo" type="file" accept="image/*" style="margin:0; font-size:11px; padding:6px;"><button onclick="addCardPhoto(${t.id})" class="btn-dark btn-sm">+ Фото (${photos.length}/3)</button></div>`;
  }
  galHtml += '</div>';
  img.insertAdjacentHTML('afterend', galHtml);

  const dtText = t.purchase_date ? new Date(t.purchase_date).toLocaleDateString('ru-RU') : '—';
  const prText = t.price ? Number(t.price).toLocaleString('ru-RU') + ' ₽' : '—';
  document.getElementById('m-info').innerHTML = `Место: <strong>${o ? o.name : 'Склад'}</strong> | У кого: <strong>${h ? h.name : 'Никого'}</strong><br>Поступил: <strong>${dtText}</strong> | Стоимость: <strong>${prText}</strong>`;

  const objOpt = objs.filter(x => x.id !== 1).map(x => `<option value="${x.id}">${x.name}</option>`).join('');
  const empOpt = emps.filter(x => x.id !== user.id).map(x => `<option value="${x.id}">${x.name}</option>`).join('');

  let html = '';
  if (t.status === 'stock') {
    html = `<select id="a-obj">${objOpt || '<option value="1">Склад</option>'}</select><button onclick="actTake(${t.id})">Взять инструмент себе</button>`;
  } else if (t.status === 'work') {
    html = `<button onclick="actReturn(${t.id})" class="btn-green">✅ Вернуть на склад</button>
            <select id="a-emp">${empOpt}</select><select id="a-obj2">${objOpt || '<option value="1">Текущий объект</option>'}</select>
            <button onclick="actTransfer(${t.id})" class="btn-amber">🤝 Передать коллеге</button>
            <input id="a-comm" placeholder="Опишите поломку..."><input id="a-rep-photo" type="file" accept="image/*" style="font-size:12px;">
            <button id="btn-rep" onclick="actRepair(${t.id})" class="btn-red">🛠️ В ремонт</button>`;
  } else if (user.role === 'admin') {
    html = `<button onclick="actReturn(${t.id})" class="btn-green">✅ Вернуть из ремонта</button>`;
  }
  document.getElementById('m-actions').innerHTML = html;
  document.getElementById('m-admin-edit').innerHTML = user.role === 'admin'
    ? `<div class="row"><button onclick="editTool(${t.id})" class="btn-dark btn-sm" style="flex:1;">✏️ Изменить</button><button onclick="delTool(${t.id})" class="btn-red btn-sm" style="flex:1;">🗑️ Удалить</button></div>` : '';
  document.getElementById('m-qr').src = makeQR(t.inv_number);

  const oldBtn = document.getElementById('m-print-btn');
  if (oldBtn) oldBtn.remove();
  document.getElementById('m-qr').insertAdjacentHTML('afterend', `<div id="m-print-btn" style="margin-top:10px;"><button onclick="printOneQR(${t.id})" class="btn-dark" style="cursor:pointer;">🖨️ Печать QR</button></div>`);
  document.getElementById('modal').classList.remove('hidden');
}
async function editTool(id) {
  const t = tools.find(x => x.id === id);
  const n = prompt('Новое название:', t.name);
  if (!n) return;
  const s = prompt('Серийный номер:', t.serial_number || '');
  const d = prompt('Дата поступления (ГГГГ-ММ-ДД):', t.purchase_date || '');
  const p = prompt('Стоимость (руб.):', t.price || '');
  await api('tools?id=eq.' + id, 'PATCH', {
    name: n.trim(), serial_number: (s || '').trim(),
    purchase_date: (d && d.trim()) ? d.trim() : null,
    price: (p && !isNaN(Number(p))) ? Number(p) : null
  });
  document.getElementById('modal').classList.add('hidden'); refresh();
}

async function delTool(id) {
  if (!confirm('Удалить эту карточку навсегда?')) return;
  await api('logs?tool_id=eq.' + id, 'DELETE');
  await api('tools?id=eq.' + id, 'DELETE');
  document.getElementById('modal').classList.add('hidden'); refresh();
}

async function actTake(id) {
  const objId = Number(document.getElementById('a-obj').value) || 1;
  await api('tools?id=eq.' + id, 'PATCH', { status: 'work', holder_id: user.id, object_id: objId });
  await api('logs', 'POST', { tool_id: id, employee_id: user.id, action: 'Взял в работу', object_id: objId });
  document.getElementById('modal').classList.add('hidden'); refresh();
}

async function actReturn(id) {
  await api('tools?id=eq.' + id, 'PATCH', { status: 'stock', holder_id: null, object_id: 1 });
  await api('logs', 'POST', { tool_id: id, employee_id: user.id, action: 'Вернул на склад', object_id: 1 });
  document.getElementById('modal').classList.add('hidden'); refresh();
}

async function actTransfer(id) {
  const empId = Number(document.getElementById('a-emp').value), objId = Number(document.getElementById('a-obj2').value) || 1;
  const next = emps.find(e => e.id === empId);
  await api('tools?id=eq.' + id, 'PATCH', { status: 'work', holder_id: empId, object_id: objId });
  await api('logs', 'POST', { tool_id: id, employee_id: user.id, action: 'Передал коллеге', object_id: objId, comment: next ? next.name : '' });
  document.getElementById('modal').classList.add('hidden'); refresh();
}

async function actRepair(id) {
  document.getElementById('btn-rep').textContent = 'Загрузка...';
  const comment = document.getElementById('a-comm').value.trim(), photoUrl = await uploadPhoto('a-rep-photo');
  const upd = { status: 'repair', holder_id: null, object_id: 1 };
  if (photoUrl) {
    const arr = getPhotos(tools.find(x => x.id === id));
    if (arr.length < 3) arr.push(photoUrl); else arr.splice(2, 1, photoUrl);
    upd.photo_url = JSON.stringify(arr);
  }
  await api('tools?id=eq.' + id, 'PATCH', upd);
  await api('logs', 'POST', { tool_id: id, employee_id: user.id, action: 'В ремонт', object_id: 1, comment });
  document.getElementById('modal').classList.add('hidden'); refresh();
}

function renderCons() {
  document.getElementById('cons-list').innerHTML = cons.map(c => `
    <div class="card row" style="justify-content:space-between; cursor:pointer;" onclick="openCons(${c.id})">
      <strong>${c.name}</strong><span class="badge ${c.qty > 0 ? 'stock' : 'repair'}">${c.qty} ${c.unit}</span>
    </div>`).join('');
}

function openCons(id) {
  curConsId = id;
  const c = cons.find(x => x.id === id);
  document.getElementById('cm-title').textContent = c.name;
  document.getElementById('cm-stock').textContent = `Остаток на складе: ${c.qty} ${c.unit}`;
  document.getElementById('cm-qty').value = 1;
  document.getElementById('cm-obj').innerHTML = objs.filter(x => x.id !== 1).map(x => `<option value="${x.id}">${x.name}</option>`).join('') || '<option value="1">На объект</option>';
  document.getElementById('cm-admin-box').classList.toggle('hidden', user.role === 'worker');
  document.getElementById('cons-modal').classList.remove('hidden');
}

async function takeCons() {
  const c = cons.find(x => x.id === curConsId), val = Number(document.getElementById('cm-qty').value), objId = Number(document.getElementById('cm-obj').value) || 1;
  if (val <= 0 || val > c.qty) return alert('Недостаточно на складе!');
  await api('consumables?id=eq.' + c.id, 'PATCH', { qty: c.qty - val });
  await api('logs', 'POST', { employee_id: user.id, action: `Списал со склада: ${c.name}`, object_id: objId, comment: `${val} ${c.unit}` });
  document.getElementById('cons-modal').classList.add('hidden'); refresh();
}

async function addConsQty() {
  const c = cons.find(x => x.id === curConsId), val = Number(document.getElementById('cm-qty').value);
  if (val <= 0) return;
  await api('consumables?id=eq.' + c.id, 'PATCH', { qty: c.qty + val });
  await api('logs', 'POST', { employee_id: user.id, action: `Пополнил склад (инвентаризация): ${c.name}`, object_id: 1, comment: `+${val} ${c.unit}` });
  document.getElementById('cons-modal').classList.add('hidden'); refresh();
}

async function addCons() {
  const name = document.getElementById('c-name').value.trim(), qty = Number(document.getElementById('c-qty').value) || 0, unit = document.getElementById('c-unit').value;
  if (!name) return;
  await api('consumables', 'POST', { name, qty, unit });
  document.getElementById('c-name').value = ''; document.getElementById('c-qty').value = ''; refresh();
}

async function delCons() {
  if (!confirm('Удалить позицию со склада?')) return;
  await api('consumables?id=eq.' + curConsId, 'DELETE');
  document.getElementById('cons-modal').classList.add('hidden'); refresh();
}
async function addTool() {
  const name = document.getElementById('t-name').value.trim(), serial_number = document.getElementById('t-ser').value.trim();
  const purchase_date = document.getElementById('t-date').value || null;
  const price = document.getElementById('t-price').value ? Number(document.getElementById('t-price').value) : null;
  if (!name) return;
  document.getElementById('btn-add-tool').textContent = 'Сохранение...';
  const photo_url = await uploadPhoto('t-photo');
  await api('tools', 'POST', { name, serial_number, purchase_date, price, status: 'stock', object_id: 1, photo_url });
  document.getElementById('t-name').value = ''; document.getElementById('t-ser').value = '';
  document.getElementById('t-date').value = ''; document.getElementById('t-price').value = ''; document.getElementById('t-photo').value = '';
  document.getElementById('btn-add-tool').textContent = 'Добавить на склад';
  alert('Добавлено!'); refresh();
}

function makeQR(txt) {
  if (window.qrcode) { const qr = qrcode(0, 'M'); qr.addData(txt); qr.make(); return qr.createDataURL(6, 4); }
  return '';
}

function printAllQR() {
  document.getElementById('print-area').innerHTML = tools.map(t => `<div class="qr-sticker"><img src="${makeQR(t.inv_number)}" style="width:110px;height:110px;"><div style="font-weight:bold;">${t.inv_number}</div><div style="font-size:11px;">${t.name}</div></div>`).join('');
  setTimeout(() => window.print(), 300);
}

function printOneQR(id) {
  const t = tools.find(x => x.id === id);
  if (!t) return;
  document.getElementById('print-area').innerHTML = `<div class="qr-sticker"><img src="${makeQR(t.inv_number)}" style="width:110px;height:110px;"><div style="font-weight:bold;">${t.inv_number}</div><div style="font-size:11px;">${t.name}</div></div>`;
  setTimeout(() => window.print(), 300);
}

function exportExcel() {
  if (typeof XLSX === 'undefined') return alert('Подождите загрузки библиотеки Excel');
  const now = new Date();
  const dateStr = now.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fileDate = now.toLocaleDateString('ru-RU').replace(/\./g, '-');
  const st = { stock: 'На складе', work: 'В работе', repair: 'В ремонте' };
  const toolsRows = [['ОТЧЁТ ПО УЧЁТУ ИНСТРУМЕНТА'], ['Дата формирования:', dateStr], [], ['Инв. номер', 'Название', 'Серийный номер', 'Дата поступления', 'Стоимость, ₽', 'Статус', 'Ответственный', 'Текущий объект']];
  let totalSum = 0;
  tools.forEach(t => {
    const h = emps.find(e => e.id === t.holder_id), o = objs.find(x => x.id === t.object_id);
    const dt = t.purchase_date ? new Date(t.purchase_date).toLocaleDateString('ru-RU') : '';
    const pr = t.price ? Number(t.price) : 0; totalSum += pr;
    toolsRows.push([t.inv_number, t.name, t.serial_number || '', dt, pr || '', st[t.status] || t.status, h ? h.name : '—', o ? o.name : 'Склад']);
  });
  toolsRows.push([], ['', '', '', 'ИТОГО:', totalSum, '', '', '']);
  const consRows = [['ОСТАТКИ РАСХОДНИКОВ НА СКЛАДЕ'], ['Дата формирования:', dateStr], [], ['Наименование', 'Остаток', 'Ед. изм.']];
  cons.forEach(c => { consRows.push([c.name, c.qty, c.unit]); });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toolsRows), 'Инструмент');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(consRows), 'Расходники');
  XLSX.writeFile(wb, `Отчет_склад_${fileDate}.xlsx`);
}

function downloadTemplate() {
  if (typeof XLSX === 'undefined') return alert('Подождите загрузки библиотеки Excel');
  const wb = XLSX.utils.book_new();
  const wsT = XLSX.utils.json_to_sheet([{ 'Название': 'Перфоратор Bosch GBH 2-26', 'Серийный номер': 'SN-123456', 'Дата поступления (ГГГГ-ММ-ДД)': '2026-11-25', 'Стоимость': 18500 }]);
  const wsC = XLSX.utils.json_to_sheet([{ 'Название': 'Бур SDS-plus 8x160', 'Количество': 20, 'Ед. изм.': 'шт' }]);
  XLSX.utils.book_append_sheet(wb, wsT, 'Инструмент');
  XLSX.utils.book_append_sheet(wb, wsC, 'Расходники');
  XLSX.writeFile(wb, 'Шаблон_загрузки_склад.xlsx');
}

async function importExcel(inp) {
  const file = inp.files.item(0);
  if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    let addedT = 0, addedC = 0;
    if (wb.Sheets['Инструмент']) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Инструмент']);
      const payload = rows.filter(r => r['Название'] && String(r['Название']).trim()).map(r => {
        const rd = r['Дата поступления (ГГГГ-ММ-ДД)'] || r['Дата поступления'], rp = r['Стоимость'];
        return { name: String(r['Название']).trim(), serial_number: r['Серийный номер'] ? String(r['Серийный номер']).trim() : '', purchase_date: rd ? String(rd).trim() : null, price: (rp !== undefined && rp !== '' && !isNaN(Number(rp))) ? Number(rp) : null, status: 'stock', object_id: 1 };
      });
      if (payload.length) { await api('tools', 'POST', payload); addedT = payload.length; }
    }
    if (wb.Sheets['Расходники']) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Расходники']);
      const payload = rows.filter(r => r['Название'] && String(r['Название']).trim()).map(r => ({ name: String(r['Название']).trim(), qty: Number(r['Количество']) || 0, unit: r['Ед. изм.'] ? String(r['Ед. изм.']).trim() : 'шт' }));
      if (payload.length) { await api('consumables', 'POST', payload); addedC = payload.length; }
    }
    inp.value = ''; alert(`Загружено!\nИнструментов: ${addedT}\nРасходников: ${addedC}`); refresh();
  } catch (e) { alert('Ошибка: ' + e.message); inp.value = ''; }
}

function findManual() {
  const code = document.getElementById('man-inv').value.trim().toUpperCase(), t = tools.find(x => x.inv_number === code);
  if (t) openTool(t.id); else alert('Не найдено: ' + code);
}

async function startCam() {
  const st = document.getElementById('scan-status'), vid = document.getElementById('qr-video');
  if (typeof jsQR === 'undefined') { st.textContent = 'Файл jsQR.js не подключён'; return; }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    vid.srcObject = camStream; vid.setAttribute('playsinline', true); vid.classList.remove('hidden'); await vid.play();
    st.textContent = 'Наведите камеру на QR-код...';
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    scanTimer = setInterval(() => {
      if (vid.readyState === vid.HAVE_ENOUGH_DATA) {
        canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          const val = code.data.trim().toUpperCase(), found = tools.find(x => x.inv_number === val);
          stopCam(); if (found) openTool(found.id); else alert('Неизвестный код: ' + val);
        }
      }
    }, 300);
  } catch (e) { st.textContent = 'Нет доступа к камере.'; }
}

function stopCam() {
  clearInterval(scanTimer);
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  document.getElementById('qr-video').classList.add('hidden'); document.getElementById('scan-status').textContent = '';
}

async function tab(t) {
  stopCam();
  ['tools', 'cons', 'scan', 'logs', 'admin'].forEach(x => {
    document.getElementById('tab-' + x).classList.add('hidden');
    document.getElementById('n-' + x).classList.remove('active');
  });
  document.getElementById('tab-' + t).classList.remove('hidden');
  document.getElementById('n-' + t).classList.add('active');
  if (t === 'logs') {
    const data = await api('logs?select=*&order=created_at.desc&limit=50');
    document.getElementById('logs-list').innerHTML = data.map(l => {
      const tl = tools.find(x => x.id === l.tool_id), em = emps.find(x => x.id === l.employee_id), ob = objs.find(x => x.id === l.object_id);
      return `<div class="card" style="font-size:13px;"><strong>${tl ? tl.inv_number + ' ' + tl.name : l.action}</strong><br>${em ? em.name : ''}: ${tl ? l.action : ''} (${ob ? ob.name : ''}) ${l.comment ? '— ' + l.comment : ''}</div>`;
    }).join('');
  }
}
