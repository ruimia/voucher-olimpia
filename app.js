// ── Supabase ─────────────────────────────────────────────────
const SUPA_URL = 'https://rptxgzgkohftmgjqtieb.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwdHhnemdrb2hmdG1nanF0aWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MjM1NDEsImV4cCI6MjA5MjE5OTU0MX0.kJXJPav-aaOiIeXErn27OITV5ftErOWOQHMdFyAb9PA';
const supa = supabase.createClient(SUPA_URL, SUPA_KEY);

function toRow(r) {
  return {
    codigo:          r.codigo,
    tipo:            r.tipo            || 'vale-presente',
    para:            r.para            || '',
    de:              r.de              || null,
    descricao:       r.descricao       || '',
    mensagem:        r.mensagem        || null,
    canal:           r.canal           || null,
    valor:           parseFloat(r.valor) || 0,
    telefone:        r.telefone        || null,
    enviado_por:     r.enviadoPor      || null,
    cadastrado_por:  r.cadastradoPor   || null,
    email_enviado:   r.emailEnviado    || false,
    zoho_registrado: r.zohoRegistrado  || false,
    pdf_baixado:     r.pdfBaixado      || false,
  };
}

async function dbGet(codigo) {
  const { data } = await supa.from('vouchers').select('*').eq('codigo', codigo).maybeSingle();
  return data || null;
}

async function dbSave(r) {
  const { error } = await supa.from('vouchers').upsert(toRow(r), { onConflict: 'codigo' });
  if (error) throw error;
}

async function dbPatch(codigo, fields) {
  const { error } = await supa.from('vouchers').update(fields).eq('codigo', codigo);
  if (error) throw error;
}

async function dbGetAll() {
  const { data } = await supa.from('vouchers').select('*').order('created_at', { ascending: false });
  return data || [];
}

async function dbDelete(codigo) {
  const { error } = await supa.from('vouchers').delete().eq('codigo', codigo);
  if (error) throw error;
}

// ── Zoho ─────────────────────────────────────────────────────
async function logToZoho(record) {
  try {
    const res = await fetch('/api/zoho-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        para:          record.para,
        de:            record.de,
        descricao:     record.descricao,
        mensagem:      record.mensagem,
        codigo:        record.codigo,
        canal:         record.canal,
        valor:         record.valor,
        telefone:      record.telefone,
        enviadoPor:    record.enviadoPor,
        cadastradoPor: record.cadastradoPor,
        data:          record.data,
      }),
    });
    return { ok: res.ok };
  } catch (err) {
    console.warn('Zoho log falhou:', err);
    return { ok: false };
  }
}

// ── Código incremental ────────────────────────────────────────
const CODIGO_INICIAL = 90030;
const STORAGE_KEY = 'olimpia_ultimo_codigo';

function proximoCodigo() {
  const ultimo = parseInt(localStorage.getItem(STORAGE_KEY) || CODIGO_INICIAL - 1);
  const proximo = ultimo + 1;
  localStorage.setItem(STORAGE_KEY, proximo);
  return String(proximo);
}

function peekProximoCodigo() {
  const ultimo = parseInt(localStorage.getItem(STORAGE_KEY) || CODIGO_INICIAL - 1);
  return String(ultimo + 1);
}

// ── State ─────────────────────────────────────────────────────
let voucherData = {};
let generatedPdfBytes = null;
let zohoRegistrado = false;
let lastScreenBeforeLog = 'screen1';

// ── Tipo de Voucher ───────────────────────────────────────────
function getTipo() {
  return document.getElementById('tipo').value;
}

function aplicarTipo(tipo) {
  document.getElementById('tipo').value = tipo;

  const isPresente = tipo === 'vale-presente';

  document.querySelectorAll('.tipo-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tipo === tipo);
  });

  document.getElementById('fieldDe').style.display      = isPresente ? '' : 'none';
  document.getElementById('fieldMensagem').style.display = isPresente ? '' : 'none';
  document.getElementById('de').required                 = isPresente;
  document.getElementById('mensagem').required           = false;

  document.getElementById('labelPara').textContent = isPresente
    ? 'Para (Presenteado)'
    : 'Nome do Cliente';
  document.getElementById('para').placeholder = isPresente
    ? 'Nome de quem vai receber'
    : 'Nome do cliente';
}

document.querySelectorAll('.tipo-btn').forEach(btn => {
  btn.addEventListener('click', () => aplicarTipo(btn.dataset.tipo));
});

aplicarTipo('vale-presente');
showHome();

// ── Navegação ─────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');

  const stepsBar = document.getElementById('stepsBar');
  const noSteps = ['screenLog', 'screenHome'].includes(id);
  stepsBar.style.display = noSteps ? 'none' : 'flex';

  if (!noSteps) {
    const num = id.replace('screen', '');
    document.querySelectorAll('.step').forEach(s => {
      const n = parseInt(s.dataset.step);
      const cur = parseInt(num);
      s.classList.toggle('active', n === cur);
      s.classList.toggle('done',   n < cur);
    });
  }

  // Atualiza nav ativa
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === id);
  });

  window.scrollTo(0, 0);
}

// ── Home ──────────────────────────────────────────────────────
async function showHome() {
  showScreen('screenHome');
  const list = document.getElementById('homeList');
  list.innerHTML = '<p class="home-loading">Carregando...</p>';

  const vouchers = await dbGetAll();
  const recent = vouchers.slice(0, 10);

  if (recent.length === 0) {
    list.innerHTML = '<p class="home-loading">Nenhum voucher ainda.</p>';
    return;
  }

  list.innerHTML = recent.map(v => `
    <div class="home-card log-row" data-codigo="${v.codigo}">
      <div class="home-card-top">
        <span class="home-card-codigo">#${v.codigo}</span>
        ${tipoLabel(v.tipo)}
      </div>
      <div class="home-card-nome">${v.para}${v.de ? ` <span class="home-card-de">de ${v.de}</span>` : ''}</div>
      <div class="home-card-desc">${(v.descricao || '').split('\n')[0]}</div>
      <div class="home-card-bottom">
        <span class="home-card-data">${formatDate(v.created_at)}</span>
        <span class="home-flags">
          <span class="home-flag ${v.email_enviado ? 'flag-on' : 'flag-off'}">✉</span>
          <span class="home-flag ${v.zoho_registrado ? 'flag-on' : 'flag-off'}">Z</span>
        </span>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('#homeList .log-row').forEach(card => {
    card.addEventListener('click', () => {
      const record = vouchers.find(v => v.codigo === card.dataset.codigo);
      if (record) openModal(record);
    });
  });
}

document.getElementById('btnNovoHome').addEventListener('click', () => showScreen('screen1'));

// Nav menu
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.screen;
    if (target === 'screenHome') showHome();
    else if (target === 'screenLog') { lastScreenBeforeLog = document.querySelector('.screen:not(.hidden)')?.id || 'screenHome'; showLog(); }
    else showScreen(target);
  });
});

// ── Step 1: Formulário ────────────────────────────────────────
document.getElementById('btnGerarCodigo').addEventListener('click', () => {
  document.getElementById('codigo').value = peekProximoCodigo();
});

document.getElementById('voucherForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  let codigo = document.getElementById('codigo').value.trim();
  if (!codigo) {
    codigo = proximoCodigo();
  } else {
    const num = parseInt(codigo);
    const atual = parseInt(localStorage.getItem(STORAGE_KEY) || CODIGO_INICIAL - 1);
    if (num > atual) localStorage.setItem(STORAGE_KEY, num);
  }

  const existente = await dbGet(codigo);
  if (existente) {
    const continuar = confirm(
      `⚠️ Código #${codigo} já existe para "${existente.para}" (${formatDate(existente.created_at)}).\n\nDeseja continuar mesmo assim?`
    );
    if (!continuar) return;
  }

  const tipo = getTipo();

  const telPais   = document.getElementById('telPais').value.trim();
  const telCidade = document.getElementById('telCidade').value.trim();
  const telNumero = document.getElementById('telNumero').value.trim();
  const telefone  = [telPais, telCidade, telNumero].filter(Boolean).join('-');

  voucherData = {
    tipo,
    para:          document.getElementById('para').value.trim(),
    de:            tipo === 'vale-presente' ? document.getElementById('de').value.trim() : '',
    descricao:     document.getElementById('descricao').value.trim(),
    mensagem:      tipo === 'vale-presente' ? document.getElementById('mensagem').value.trim() : '',
    canal:         document.getElementById('canal').value,
    valor:         document.getElementById('valor').value || '0',
    telefone,
    enviadoPor:    document.getElementById('enviadoPor').value,
    cadastradoPor: document.getElementById('cadastradoPor').value,
    codigo,
  };

  generatedPdfBytes = null;
  renderVoucher();
  showScreen('screen2');
});

// ── Step 2: Preview ───────────────────────────────────────────
function formatCurrency(val) {
  const n = parseFloat(val) || 0;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderVoucher() {
  const isPresente = voucherData.tipo === 'vale-presente';

  document.getElementById('templatePresente').classList.toggle('hidden', !isPresente);
  document.getElementById('templatePrePag').classList.toggle('hidden', isPresente);

  if (isPresente) {
    document.getElementById('vPara').textContent      = voucherData.para;
    document.getElementById('vDe').textContent        = voucherData.de;
    document.getElementById('vMensagem').textContent  = voucherData.mensagem;
    document.getElementById('vDescricao').textContent = voucherData.descricao;
    document.getElementById('vCodigo').textContent    = '#' + voucherData.codigo;
  } else {
    document.getElementById('ppCliente').textContent  = voucherData.para;
    document.getElementById('ppServico').textContent  = voucherData.descricao;
    document.getElementById('ppValor').textContent    = formatCurrency(voucherData.valor);
    document.getElementById('ppCodigo').textContent   = '#' + voucherData.codigo;
    document.getElementById('ppValorBloco').style.display = 'none';
  }
}

document.getElementById('btnBack2').addEventListener('click', () => showScreen('screen1'));

document.getElementById('btnNext2').addEventListener('click', async () => {
  const btn = document.getElementById('btnNext2');
  btn.disabled = true;

  try {
    btn.textContent = 'Gerando PDF...';
    const pdf = await gerarPDF();
    generatedPdfBytes = pdf.output('arraybuffer');

    btn.textContent = 'Registrando...';
    const zohoResult = await logToZoho({ ...voucherData, data: new Date().toISOString() });
    zohoRegistrado = zohoResult.ok;

    await dbSave({ ...voucherData, zohoRegistrado });

    renderSummary(zohoRegistrado);
    showScreen('screen3');
  } catch (err) {
    alert('Erro ao processar voucher. Tente novamente.');
    console.error(err);
  } finally {
    btn.textContent = 'Próximo →';
    btn.disabled = false;
  }
});

// ── Step 3: Download ──────────────────────────────────────────
function setStatus(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('done', 'fail');
  if (state === true)  el.classList.add('done');
  if (state === false) el.classList.add('fail');
}

function renderSummary(zohoOk) {
  const isPresente = voucherData.tipo === 'vale-presente';

  document.getElementById('summaryPara').textContent    = voucherData.para;
  document.getElementById('summaryCodigo').textContent  = '#' + voucherData.codigo;

  const rowDe = document.getElementById('summaryRowDe');
  if (isPresente && voucherData.de) {
    rowDe.style.display = '';
    document.getElementById('summaryDe').textContent = voucherData.de;
  } else {
    rowDe.style.display = 'none';
  }

  document.getElementById('summaryCanal').textContent      = voucherData.canal || '—';
  document.getElementById('summaryValor').textContent      = formatCurrency(voucherData.valor);
  document.getElementById('summaryEnviado').textContent    = voucherData.enviadoPor || '—';
  document.getElementById('summaryCadastrado').textContent = voucherData.cadastradoPor || '—';

  const zohoEl = document.getElementById('summaryZohoStatus');
  zohoEl.textContent = zohoOk ? '✓ Registrado' : '✗ Falha ao registrar';
  zohoEl.style.color = zohoOk ? '#4caf50' : '#e53935';

  setStatus('stZoho',    zohoOk);
  setStatus('stVoucher', true);
  setStatus('stDownload', null);
  setStatus('stEmail',   null);
}

document.getElementById('btnBack3').addEventListener('click', () => showScreen('screen2'));

document.getElementById('btnNovo').addEventListener('click', () => {
  document.getElementById('voucherForm').reset();
  document.getElementById('codigo').value = '';
  document.getElementById('canal').value = '';
  document.getElementById('enviadoPor').value = '';
  document.getElementById('cadastradoPor').value = '';
  aplicarTipo('vale-presente');
  voucherData = {};
  generatedPdfBytes = null;
  zohoRegistrado = false;
  showScreen('screen1');
});

document.getElementById('btnDownloadPDF').addEventListener('click', async () => {
  const btn = document.getElementById('btnDownloadPDF');
  if (!generatedPdfBytes) return;

  btn.textContent = 'Baixando...';
  btn.disabled = true;

  try {
    triggerDownload(generatedPdfBytes, voucherData.para, voucherData.codigo);
    await dbPatch(voucherData.codigo, { pdf_baixado: true });
    setStatus('stDownload', true);
    btn.textContent = '✓ PDF Baixado!';
    btn.style.background = '#4caf50';
    setTimeout(() => {
      btn.textContent = '⬇ Baixar PDF';
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);
  } catch (err) {
    alert('Erro ao baixar. Tente novamente.');
    console.error(err);
    btn.textContent = '⬇ Baixar PDF';
    btn.disabled = false;
  }
});

// ── Envio de Email ────────────────────────────────────────────
document.getElementById('btnSendEmail').addEventListener('click', async () => {
  const to     = document.getElementById('emailTo').value.trim();
  const cc     = document.getElementById('emailCc').value.trim();
  const status = document.getElementById('emailStatus');

  if (!to) {
    status.textContent = 'Informe o email do destinatário.';
    status.className = 'email-status error';
    return;
  }

  const btn = document.getElementById('btnSendEmail');
  btn.textContent = 'Enviando...';
  btn.disabled = true;
  status.textContent = '';
  status.className = 'email-status';

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to, cc,
        para:      voucherData.para,
        de:        voucherData.de,
        descricao: voucherData.descricao,
        mensagem:  voucherData.mensagem,
        codigo:    voucherData.codigo,
        tipo:      voucherData.tipo,
        valor:     voucherData.valor,
      }),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }

    if (res.ok) {
      setStatus('stEmail', true);
      status.textContent = '✓ Email enviado com sucesso!';
      status.className = 'email-status success';
      btn.textContent = '✉ Enviar Email';
      await dbPatch(voucherData.codigo, { email_enviado: true });
    } else {
      throw new Error(data.error || 'Erro desconhecido');
    }
  } catch (err) {
    status.textContent = '✗ Erro: ' + err.message;
    status.className = 'email-status error';
    btn.textContent = '✉ Enviar Email';
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

function triggerDownload(pdfBytes, para, codigo) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `vale-presente-${para.replace(/\s+/g, '-')}-${codigo}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Geração de PDF ────────────────────────────────────────────
async function gerarPDF() {
  const voucher = document.getElementById('voucher');
  const canvas  = await html2canvas(voucher, { scale: 2, useCORS: true });
  const imgData = canvas.toDataURL('image/png');

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW  = pdf.internal.pageSize.getWidth();
  const pageH  = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const maxW   = pageW - margin * 2;
  const maxH   = pageH - margin * 2;
  const ratio  = canvas.width / canvas.height;

  let imgW = maxW;
  let imgH = imgW / ratio;
  if (imgH > maxH) { imgH = maxH; imgW = imgH * ratio; }

  const x = (pageW - imgW) / 2;
  const y = (pageH - imgH) / 2;
  pdf.addImage(imgData, 'PNG', x, y, imgW, imgH);

  return pdf;
}

// ── Histórico ─────────────────────────────────────────────────
document.getElementById('btnCloseLog').addEventListener('click', () => {
  showScreen(lastScreenBeforeLog);
});

function flagCell(value) {
  return value
    ? '<span style="color:#4caf50;font-weight:bold;">✓</span>'
    : '<span style="color:#ccc;">—</span>';
}

function tipoLabel(tipo) {
  return tipo === 'pre-pagamento'
    ? '<span style="color:#4a7ebf;font-size:0.75rem;font-weight:bold;">PRÉ-PAG.</span>'
    : '<span style="color:#d4a96a;font-size:0.75rem;font-weight:bold;">PRESENTE</span>';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' '
       + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function showLog() {
  showScreen('screenLog');
  const tbody = document.getElementById('logBody');
  tbody.innerHTML = '<tr><td colspan="7" class="log-empty">Carregando...</td></tr>';

  const vouchers = await dbGetAll();

  if (vouchers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="log-empty">Nenhum voucher gerado ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = vouchers.map(v => `
    <tr class="log-row" data-codigo="${v.codigo}">
      <td><strong>#${v.codigo}</strong></td>
      <td>${tipoLabel(v.tipo)}</td>
      <td>${v.para}${v.de ? `<br><small style="color:#aaa;">de: ${v.de}</small>` : ''}</td>
      <td>${(v.descricao || '').replace(/\n/g, '<br>')}</td>
      <td>${formatDate(v.created_at)}</td>
      <td>${flagCell(v.email_enviado)}</td>
      <td>${flagCell(v.zoho_registrado)}</td>
      <td><button class="btn-pdf-log" data-codigo="${v.codigo}">⬇ PDF</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('.log-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-pdf-log')) return;
      const codigo = row.dataset.codigo;
      const record = vouchers.find(v => v.codigo === codigo);
      if (record) openModal(record);
    });
  });

  document.querySelectorAll('.btn-pdf-log').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const codigo = btn.dataset.codigo;
      const record = vouchers.find(v => v.codigo === codigo);
      if (record) await gerarPDFFromRecord(record, btn);
    });
  });
}

// ── PDF a partir do histórico ─────────────────────────────────
async function gerarPDFFromRecord(record, btnEl) {
  const orig = { ...voucherData };
  if (btnEl) { btnEl.textContent = 'Gerando...'; btnEl.disabled = true; }

  voucherData = {
    tipo:          record.tipo,
    para:          record.para,
    de:            record.de || '',
    descricao:     record.descricao || '',
    mensagem:      record.mensagem || '',
    canal:         record.canal,
    valor:         record.valor,
    telefone:      record.telefone,
    enviadoPor:    record.enviado_por,
    cadastradoPor: record.cadastrado_por,
    codigo:        record.codigo,
  };

  // renderiza o voucher em screen2 rapidamente (fora do viewport)
  const screen2 = document.getElementById('screen2');
  const wasHidden = screen2.classList.contains('hidden');
  screen2.style.position = 'fixed';
  screen2.style.top = '-9999px';
  screen2.classList.remove('hidden');
  renderVoucher();

  try {
    const pdf = await gerarPDF();
    triggerDownload(pdf.output('arraybuffer'), record.para, record.codigo);
    await dbPatch(record.codigo, { pdf_baixado: true });
  } catch (err) {
    alert('Erro ao gerar PDF: ' + err.message);
  } finally {
    if (wasHidden) screen2.classList.add('hidden');
    screen2.style.position = '';
    screen2.style.top = '';
    voucherData = orig;
    if (btnEl) { btnEl.textContent = '⬇ PDF'; btnEl.disabled = false; }
  }
}

// ── Modal CRUD ────────────────────────────────────────────────
let currentModalRecord = null;

function openModal(record) {
  currentModalRecord = record;
  document.getElementById('modalTitle').textContent = `Voucher #${record.codigo}`;
  renderModalView(record);
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function modalField(label, value) {
  return `<div class="modal-field"><span class="modal-field-label">${label}</span><span class="modal-field-value">${value || '—'}</span></div>`;
}

function renderModalView(r) {
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-section">
      ${modalField('Tipo', tipoLabel(r.tipo))}
      ${modalField('Para', r.para)}
      ${r.de ? modalField('De', r.de) : ''}
      ${modalField('Descrição', (r.descricao || '').replace(/\n/g, '<br>'))}
      ${r.mensagem ? modalField('Mensagem', r.mensagem) : ''}
      ${modalField('Código', '#' + r.codigo)}
    </div>
    <div class="modal-section">
      ${modalField('Canal', r.canal)}
      ${modalField('Valor', formatCurrency(r.valor))}
      ${modalField('Telefone', r.telefone)}
      ${modalField('Enviado por', r.enviado_por)}
      ${modalField('Cadastrado por', r.cadastrado_por)}
      ${modalField('Data', formatDate(r.created_at))}
    </div>
    <div class="modal-flags-view">
      <span class="modal-flag ${r.email_enviado ? 'flag-on' : 'flag-off'}">✉ Email ${r.email_enviado ? 'enviado' : 'não enviado'}</span>
      <span class="modal-flag ${r.zoho_registrado ? 'flag-on' : 'flag-off'}">📋 Zoho ${r.zoho_registrado ? 'registrado' : 'não registrado'}</span>
      <span class="modal-flag ${r.pdf_baixado ? 'flag-on' : 'flag-off'}">⬇ PDF ${r.pdf_baixado ? 'baixado' : 'não baixado'}</span>
    </div>
  `;
  document.getElementById('modalPDF').classList.remove('hidden');
  document.getElementById('modalEdit').classList.remove('hidden');
  document.getElementById('modalSave').classList.add('hidden');
  document.getElementById('modalCancel').classList.add('hidden');
}

function selOpt(id, val) {
  const el = document.getElementById(id);
  if (el && val) el.value = val;
}

function renderModalEdit(r) {
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-section">
      <div class="modal-edit-field">
        <label>Tipo</label>
        <select id="mTipo">
          <option value="vale-presente">Vale-Presente</option>
          <option value="pre-pagamento">Pré-pagamento</option>
        </select>
      </div>
      <div class="modal-edit-field"><label>Para</label><input id="mPara" value="${r.para || ''}" /></div>
      <div class="modal-edit-field"><label>De</label><input id="mDe" value="${r.de || ''}" /></div>
      <div class="modal-edit-field"><label>Descrição</label><textarea id="mDescricao" rows="3">${r.descricao || ''}</textarea></div>
      <div class="modal-edit-field"><label>Mensagem</label><textarea id="mMensagem" rows="2">${r.mensagem || ''}</textarea></div>
    </div>
    <div class="modal-section">
      <div class="modal-edit-field">
        <label>Canal</label>
        <select id="mCanal">
          <option value="">—</option>
          <option value="Internet">Internet</option>
          <option value="Whatsapp">Whatsapp</option>
          <option value="Telefone">Telefone</option>
          <option value="Pessoalmente">Pessoalmente</option>
            <option value="CORTESIA - Mileny">Cortesia Mileny</option>
          <option value="CORTESIA - Mari">Cortesia Mari</option>
          <option value="EMPRESAS - Corporativo">Corporativo</option>
        </select>
      </div>
      <div class="modal-edit-field"><label>Valor R$</label><input id="mValor" type="number" step="0.01" value="${r.valor || 0}" /></div>
      <div class="modal-edit-field"><label>Telefone</label><input id="mTelefone" value="${r.telefone || ''}" /></div>
      <div class="modal-edit-field">
        <label>Enviado por</label>
        <select id="mEnviadoPor">
          <option value="">—</option>
          <option value="E-mail">E-mail</option>
          <option value="Whatsapp">Whatsapp</option>
          <option value="Retirado no Spa">Retirado no Spa</option>
          <option value="Correio/Sedex">Correio/Sedex</option>
        </select>
      </div>
      <div class="modal-edit-field">
        <label>Cadastrado por</label>
        <select id="mCadastradoPor">
          <option value="">—</option>
          <option value="ADM-Marianne">ADM-Marianne</option>
          <option value="ADM-Rui">ADM-Rui</option>
          <option value="VO - Felipe">VO - Felipe</option>
          <option value="VO - Nicolly">VO - Nicolly</option>
          <option value="JD - Luiza">JD - Luiza</option>
          <option value="JD - Rafaella">JD - Rafaella</option>
          <option value="OUTROS">OUTROS</option>
        </select>
      </div>
    </div>
    <div class="modal-flags-edit">
      <label><input type="checkbox" id="mEmailEnviado" ${r.email_enviado ? 'checked' : ''} /> Email enviado</label>
      <label><input type="checkbox" id="mZohoRegistrado" ${r.zoho_registrado ? 'checked' : ''} /> Zoho registrado</label>
      <label><input type="checkbox" id="mPdfBaixado" ${r.pdf_baixado ? 'checked' : ''} /> PDF baixado</label>
    </div>
  `;
  selOpt('mTipo', r.tipo);
  selOpt('mCanal', r.canal);
  selOpt('mEnviadoPor', r.enviado_por);
  selOpt('mCadastradoPor', r.cadastrado_por);

  document.getElementById('modalPDF').classList.add('hidden');
  document.getElementById('modalEdit').classList.add('hidden');
  document.getElementById('modalSave').classList.remove('hidden');
  document.getElementById('modalCancel').classList.remove('hidden');
}

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.add('hidden');
});

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalOverlay')) {
    document.getElementById('modalOverlay').classList.add('hidden');
  }
});

document.getElementById('modalEdit').addEventListener('click', () => {
  renderModalEdit(currentModalRecord);
});

document.getElementById('modalCancel').addEventListener('click', () => {
  renderModalView(currentModalRecord);
});

document.getElementById('modalPDF').addEventListener('click', async () => {
  const btn = document.getElementById('modalPDF');
  await gerarPDFFromRecord(currentModalRecord, btn);
});

document.getElementById('modalDelete').addEventListener('click', async () => {
  if (!confirm(`Deletar voucher #${currentModalRecord.codigo}?\nEsta ação não pode ser desfeita.`)) return;
  try {
    await dbDelete(currentModalRecord.codigo);
    document.getElementById('modalOverlay').classList.add('hidden');
    showLog();
  } catch (err) {
    alert('Erro ao deletar: ' + err.message);
  }
});

document.getElementById('modalSave').addEventListener('click', async () => {
  const btn = document.getElementById('modalSave');
  btn.textContent = 'Salvando...';
  btn.disabled = true;
  try {
    const updates = {
      tipo:            document.getElementById('mTipo').value,
      para:            document.getElementById('mPara').value.trim(),
      de:              document.getElementById('mDe').value.trim() || null,
      descricao:       document.getElementById('mDescricao').value.trim(),
      mensagem:        document.getElementById('mMensagem').value.trim() || null,
      canal:           document.getElementById('mCanal').value || null,
      valor:           parseFloat(document.getElementById('mValor').value) || 0,
      telefone:        document.getElementById('mTelefone').value.trim() || null,
      enviado_por:     document.getElementById('mEnviadoPor').value || null,
      cadastrado_por:  document.getElementById('mCadastradoPor').value || null,
      email_enviado:   document.getElementById('mEmailEnviado').checked,
      zoho_registrado: document.getElementById('mZohoRegistrado').checked,
      pdf_baixado:     document.getElementById('mPdfBaixado').checked,
    };
    await dbPatch(currentModalRecord.codigo, updates);
    currentModalRecord = { ...currentModalRecord, ...updates };
    renderModalView(currentModalRecord);
    showLog();
  } catch (err) {
    alert('Erro ao salvar: ' + err.message);
  } finally {
    btn.textContent = 'Salvar';
    btn.disabled = false;
  }
});
