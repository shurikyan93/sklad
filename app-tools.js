let curToolTab = 'tools', camStream = null, scanTimer = null;

function showToolTab(t) {
  curToolTab = t;
  stopCam();
  ['tools', 'cons', 'scan', 'logs', 'qr'].forEach(x => {
    const sec = document.getElementById('t-sec-' + x);
    const btn = document.getElementById('nt-' + x);
    if (sec) sec.classList.toggle('hidden', x !== t);
    if (btn) btn.classList.toggle('active', x === t);
  });
  renderToolsMod();
}

function renderToolsMod() {
  if (!user) return;
  const isAdmin = user.role === 'admin';
  const isStaff = isAdmin || user.role === 'foreman';
  const addT = document.getElementById('t-admin-add');
  const addC = document.getElementById('c-admin-add');
  if (addT) addT.classList.toggle('hidden', !isAdmin);
  if (addC) addC.classList.toggle('hidden', !isStaff);

  if (curToolTab === 'tools') {
    const st = { stock: 'На складе', work: 'В работе', repair: 'В ремонте' };
    document.getElementById('t-list').innerHTML = tools.map(t => {
      const h = emps.find(e => e.id === t.holder_id), o = objs.find(x => x.id === t.object_id);
      const code = t.inv_number || ('TOOL-' + t.id);
      return `<div class="card" onclick="openToolCard(${t.id})" style="cursor:pointer;">
        <div class="row" style="justify-content:space-between;">
          <strong>${code} — ${t.name}</strong>
          <span class="badge ${t.status || 'stock'}">${st[t.status] || 'На складе'}</span>
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:6px;">📍 ${o ? o.name : 'Склад'} ${h ? '| 👷 ' + h.name : ''}</div>
      </div>`;
    }).join('') || '<div class="card" style="text-align:center;color:#94a3b8;">Инструментов пока нет</div>';
  } else if (curToolTab === 'cons') {
    document.getElementById('c-list').innerHTML = cons.map(c => `
      <div class="card row" style="justify-content:space-between;cursor:pointer;" onclick="openConsCard(${c.id})">
        <strong>${c.name}</strong>
        <span class="badge ${Number(c.qty) > 0 ? 'stock' : 'repair'}">${c.qty} ${c.unit || 'шт'}</span>
      </div>`).join('') || '<div class="card" style="text-align:center;color:#94a3b8;">Склад расходников пуст</div>';
  } else if (curToolTab === 'logs') {
    document.getElementById('t-logs-list').innerHTML = (tLogs || []).map(l => {
      const tl = tools.find(x => x.id === l.tool_id);
      const em = emps.find(x => x.id === l.employee_id);
      const ob = objs.find(x => x.id === l.object_id);
      return `<div class="card" style="font-size:13px;">
        <strong>${tl ? (tl.inv_number || '') + ' ' + tl.name : l.action}</strong><br>
        ${em ? em.name : ''}: ${tl ? l.action : ''} (${ob ? ob.name : 'Склад'}) ${l.comment ? '— ' + l.comment : ''}
      </div>`;
    }).join('') || '<div class="card" style="text-align:center;color:#94a3b8;">Журнал пуст</div>';
  } else if (curToolTab === 'qr') {
    document.getElementById('qr-batch').innerHTML = tools.map(t => {
      const code = t.inv_number || ('TOOL-' + t.id);
      return `<div class="card row" style="justify-content:space-between;">
        <div><strong>${code}</strong><br><small>${t.name}</small></div>
        <img src="${makeQR(code)}" style="width:72px;height:72px;">
      </div>`;
    }).join('');
    document.getElementById('print-area').innerHTML = tools.map(t => {
      const code = t.inv_number || ('TOOL-' + t.id);
      return `<div class="qr-sticker"><img src="${makeQR(code)}" style="width:110px;height:110px;"><div style="font-weight:bold;">${code}</div><div style="font-size:11px;">${t.name}</div></div>`;
    }).join('');
  }
}

function makeQR(txt) {
  if (window.qrcode) { const qr = qrcode(0, 'M'); qr.addData(txt); qr.make(); return qr.createDataURL(6, 4); }
  return '';
}
function openToolCard(id) {
  const t = tools.find(x => x.id === id);
  if (!t) return;
  const h = emps.find(e => e.id === t.holder_id), o = objs.find(x => x.id === t.object_id);
  const code = t.inv_number || ('TOOL-' + t.id);
  const objOpt = objs.filter(x => x.id !== 1).map(x => `<option value="${x.id}">${x.name}</option>`).join('') || '<option value="1">На объект</option>';
  const empOpt = emps.filter(x => x.id !== user.id).map(x => `<option value="${x.id}">${x.name}</option>`).join('');

  let actions = '';
  if (!t.status || t.status === 'stock') {
    actions = `<select id="tk-obj">${objOpt}</select><button onclick="toolTake(${id})" class="btn-green">Взять инструмент себе</button>`;
  } else if (t.status === 'work') {
    actions = `<button onclick="toolReturn(${id})" class="btn-green">✅ Вернуть на склад</button>
      <select id="tr-emp">${empOpt}</select><select id="tr-obj">${objOpt}</select>
      <button onclick="toolTransfer(${id})" class="btn-amber">🤝 Передать коллеге</button>
      <input id="rp-comm" placeholder="Опишите поломку..."><button onclick="toolRepair(${id})" class="btn-red">🛠️ В ремонт</button>`;
  } else if (user.role === 'admin' || user.role === 'foreman') {
    actions = `<button onclick="toolReturn(${id})" class="btn-green">✅ Вернуть из ремонта</button>`;
  }

  openModal(`
    <div class="row" style="justify-content:space-between;margin-bottom:6px;"><strong style="color:#2563eb;">${code}</strong><button onclick="closeModal()" class="btn-sm" style="background:#e2e8f0;color:#000;">✕</button></div>
    <h3 style="margin-bottom:6px;">${t.name}</h3>
    ${t.photo_url ? `<img src="${t.photo_url}" class="thumb">` : ''}
    <p style="font-size:13px;color:#475569;margin-bottom:10px;">Место: <strong>${o ? o.name : 'Склад'}</strong> · У кого: <strong>${h ? h.name : 'Никого'}</strong>${t.serial_number ? '<br>S/N: ' + t.serial_number : ''}</p>
    ${actions}
    ${user.role === 'admin' ? `<button onclick="delTool(${id})" class="btn-red btn-sm" style="margin-top:8px;">🗑️ Удалить инструмент</button>` : ''}
    <div style="text-align:center;margin-top:10px;"><img src="${makeQR(code)}" style="width:100px;height:100px;"></div>
  `);
}

async function toolTake(id) {
  const oid = Number(document.getElementById('tk-obj').value) || 1;
  await api('tools?id=eq.' + id, 'PATCH', { status: 'work', holder_id: user.id, object_id: oid });
  await api('logs', 'POST', { tool_id: id, employee_id: user.id, action: 'Взял в работу', object_id: oid });
  closeModal(); await refresh();
}

async function toolReturn(id) {
  await api('tools?id=eq.' + id, 'PATCH', { status: 'stock', holder_id: null, object_id: 1 });
  await api('logs', 'POST', { tool_id: id, employee_id: user.id, action: 'Вернул на склад', object_id: 1 });
  closeModal(); await refresh();
}

async function toolTransfer(id) {
  const eid = Number(document.getElementById('tr-emp').value), oid = Number(document.getElementById('tr-obj').value) || 1;
  const next = emps.find(e => e.id === eid);
  await api('tools?id=eq.' + id, 'PATCH', { status: 'work', holder_id: eid, object_id: oid });
  await api('logs', 'POST', { tool_id: id, employee_id: user.id, action: 'Передал коллеге', object_id: oid, comment: next ? next.name : '' });
  closeModal(); await refresh();
}

async function toolRepair(id) {
  const comment = document.getElementById('rp-comm').value.trim();
  await api('tools?id=eq.' + id, 'PATCH', { status: 'repair', holder_id: null, object_id: 1 });
  await api('logs', 'POST', { tool_id: id, employee_id: user.id, action: 'В ремонт', object_id: 1, comment });
  closeModal(); await refresh();
}

async function delTool(id) {
  if (!confirm('Удалить инструмент?')) return;
  await api('logs?tool_id=eq.' + id, 'DELETE');
  await api('tools?id=eq.' + id, 'DELETE');
  closeModal(); await refresh();
}

async function addTool() {
  const name = document.getElementById('t-name').value.trim();
  const serial_number = document.getElementById('t-sn').value.trim();
  const price = Number(document.getElementById('t-cost').value) || null;
  if (!name) return alert('Введите название инструмента');
  await api('tools', 'POST', { name, serial_number, price, status: 'stock', object_id: 1 });
  document.getElementById('t-name').value = ''; document.getElementById('t-sn').value = ''; document.getElementById('t-cost').value = '';
  await refresh();
}

function openConsCard(id) {
  const c = cons.find(x => x.id === id);
  if (!c) return;
  const objOpt = objs.filter(x => x.id !== 1).map(x => `<option value="${x.id}">${x.name}</option>`).join('') || '<option value="1">На объект</option>';
  const isStaff = user.role === 'admin' || user.role === 'foreman';
  openModal(`
    <div class="row" style="justify-content:space-between;margin-bottom:6px;"><strong>${c.name}</strong><button onclick="closeModal()" class="btn-sm" style="background:#e2e8f0;color:#000;">✕</button></div>
    <p style="font-size:13px;color:#64748b;margin-bottom:10px;">Остаток на складе: <strong>${c.qty} ${c.unit || 'шт'}</strong></p>
    <input id="cs-qty" type="number" step="any" value="1">
    <select id="cs-obj">${objOpt}</select>
    <button onclick="consTake(${id})" class="btn-green">Списать на объект</button>
    ${isStaff ? `<div class="row" style="margin-top:8px;"><button onclick="consAddQty(${id})" class="btn-amber" style="flex:1;">+ Пополнить</button><button onclick="consDel(${id})" class="btn-red btn-sm">🗑️</button></div>` : ''}
  `);
}

async function consTake(id) {
  const c = cons.find(x => x.id === id), val = Number(document.getElementById('cs-qty').value), oid = Number(document.getElementById('cs-obj').value) || 1;
  if (val <= 0 || val > Number(c.qty)) return alert('Недостаточно на складе!');
  await api('consumables?id=eq.' + id, 'PATCH', { qty: Number(c.qty) - val });
  await api('logs', 'POST', { employee_id: user.id, action: `Списал со склада: ${c.name}`, object_id: oid, comment: `${val} ${c.unit || 'шт'}` });
  closeModal(); await refresh();
}

async function consAddQty(id) {
  const c = cons.find(x => x.id === id), val = Number(document.getElementById('cs-qty').value);
  if (val <= 0) return;
  await api('consumables?id=eq.' + id, 'PATCH', { qty: Number(c.qty) + val });
  await api('logs', 'POST', { employee_id: user.id, action: `Пополнил склад: ${c.name}`, object_id: 1, comment: `+${val} ${c.unit || 'шт'}` });
  closeModal(); await refresh();
}

async function consDel(id) {
  if (!confirm('Удалить позицию?')) return;
  await api('consumables?id=eq.' + id, 'DELETE');
  closeModal(); await refresh();
}

async function addCons() {
  const name = document.getElementById('c-name').value.trim(), qty = Number(document.getElementById('c-qty').value) || 0, unit = document.getElementById('c-unit').value.trim() || 'шт';
  if (!name) return alert('Введите название');
  await api('consumables', 'POST', { name, qty, unit });
  document.getElementById('c-name').value = ''; document.getElementById('c-qty').value = '';
  await refresh();
}

function manualScan() {
  const val = document.getElementById('manual-code').value.trim().toUpperCase();
  const found = tools.find(t => (t.inv_number || ('TOOL-' + t.id)).toUpperCase() === val);
  if (found) openToolCard(found.id); else alert('Не найдено: ' + val);
}

async function startCam() {
  const st = document.getElementById('scan-status'), vid = document.getElementById('qr-video');
  if (typeof jsQR === 'undefined') { st.textContent = 'Библиотека jsQR не подключена'; return; }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    vid.srcObject = camStream; vid.setAttribute('playsinline', true); vid.classList.remove('hidden'); await vid.play();
    const cvs = document.createElement('canvas'), ctx = cvs.getContext('2d');
    scanTimer = setInterval(() => {
      if (vid.readyState === vid.HAVE_ENOUGH_DATA) {
        cvs.width = vid.videoWidth; cvs.height = vid.videoHeight;
        ctx.drawImage(vid, 0, 0);
        const code = jsQR(ctx.getImageData(0, 0, cvs.width, cvs.height).data, cvs.width, cvs.height);
        if (code && code.data) {
          const val = code.data.trim().toUpperCase();
          const found = tools.find(t => (t.inv_number || ('TOOL-' + t.id)).toUpperCase() === val);
          stopCam();
          if (found) openToolCard(found.id); else alert('Неизвестный QR: ' + val);
        }
      }
    }, 300);
  } catch (e) { st.textContent = 'Нет доступа к камере'; }
}

function stopCam() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  const vid = document.getElementById('qr-video');
  if (vid) vid.classList.add('hidden');
}
