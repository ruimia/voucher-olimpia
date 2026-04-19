// ── IndexedDB ────────────────────────────────────────────────
const DB_NAME = 'olimpia_vouchers';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const store = e.target.result.createObjectStore('vouchers', { keyPath: 'codigo' });
      store.createIndex('data', 'data');
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror  = (e) => reject(e.target.error);
  });
}

async function getVoucher(codigo) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vouchers', 'readonly');
    const req = tx.objectStore('vouchers').get(codigo);
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function saveVoucher(record) {
  const db = await openDB();
  const existing = await getVoucher(record.codigo) || {};
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vouchers', 'readwrite');
    tx.objectStore('vouchers').put({ ...existing, ...record });
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function patchVoucher(codigo, fields) {
  const existing = await getVoucher(codigo);
  if (!existing) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vouchers', 'readwrite');
    tx.objectStore('vouchers').put({ ...existing, ...fields });
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getAllVouchers() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vouchers', 'readonly');
    const req = tx.objectStore('vouchers').getAll();
    req.onsuccess = (e) =>
      resolve(e.target.result.sort((a, b) => b.data.localeCompare(a.data)));
    req.onerror = (e) => reject(e.target.error);
  });
}

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

  // Botões do toggle
  document.querySelectorAll('.tipo-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tipo === tipo);
  });

  // Campos condicionais no Step 1
  document.getElementById('fieldDe').style.display      = isPresente ? '' : 'none';
  document.getElementById('fieldMensagem').style.display = isPresente ? '' : 'none';
  document.getElementById('de').required                 = isPresente;
  document.getElementById('mensagem').required           = false; // mensagem é opcional

  // Label "Para"
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

// Inicializa com o tipo padrão
aplicarTipo('vale-presente');

// ── Navegação ─────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');

  const stepsBar = document.getElementById('stepsBar');
  if (id === 'screenLog') {
    stepsBar.style.display = 'none';
  } else {
    stepsBar.style.display = 'flex';
    const num = id.replace('screen', '');
    document.querySelectorAll('.step').forEach(s => {
      const n = parseInt(s.dataset.step);
      const cur = parseInt(num);
      s.classList.toggle('active', n === cur);
      s.classList.toggle('done',   n < cur);
    });
  }
  window.scrollTo(0, 0);
}

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

  // Verifica duplicata no histórico local
  const existente = await getVoucher(codigo);
  if (existente) {
    const continuar = confirm(
      `⚠️ Código #${codigo} já foi gerado neste dispositivo para "${existente.para}" em ${formatDate(existente.data)}.\n\nDeseja continuar mesmo assim?`
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
    document.getElementById('vPara').textContent     = voucherData.para;
    document.getElementById('vDe').textContent       = voucherData.de;
    document.getElementById('vMensagem').textContent = voucherData.mensagem;
    document.getElementById('vDescricao').textContent = voucherData.descricao;
    document.getElementById('vCodigo').textContent   = '#' + voucherData.codigo;
  } else {
    document.getElementById('ppCliente').textContent = voucherData.para;
    document.getElementById('ppServico').textContent = voucherData.descricao;
    document.getElementById('ppValor').textContent   = formatCurrency(voucherData.valor);
    document.getElementById('ppCodigo').textContent  = '#' + voucherData.codigo;
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
    const record = {
      tipo:          voucherData.tipo,
      codigo:        voucherData.codigo,
      para:          voucherData.para,
      de:            voucherData.de,
      descricao:     voucherData.descricao,
      mensagem:      voucherData.mensagem,
      canal:         voucherData.canal,
      valor:         voucherData.valor,
      telefone:      voucherData.telefone,
      enviadoPor:    voucherData.enviadoPor,
      cadastradoPor: voucherData.cadastradoPor,
      data:          new Date().toISOString(),
      pdfBytes:      generatedPdfBytes,
      zohoRegistrado,
    };
    await saveVoucher(record);
    triggerDownload(generatedPdfBytes, voucherData.para, voucherData.codigo);

    setStatus('stDownload', true);
    btn.textContent = '✓ PDF Baixado!';
    btn.style.background = '#4caf50';
    setTimeout(() => {
      btn.textContent = '⬇ Baixar PDF';
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);
  } catch (err) {
    alert('Erro ao salvar. Tente novamente.');
    console.error(err);
    btn.textContent = '⬇ Baixar PDF';
    btn.disabled = false;
  }
});

// ── Envio de Email ────────────────────────────────────────────
function ab2base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

document.getElementById('btnSendEmail').addEventListener('click', async () => {
  const to  = document.getElementById('emailTo').value.trim();
  const cc  = document.getElementById('emailCc').value.trim();
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
    const pdfBase64 = generatedPdfBytes ? ab2base64(generatedPdfBytes) : null;

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
        pdfBase64,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      setStatus('stEmail', true);
      status.textContent = '✓ Email enviado com sucesso!';
      status.className = 'email-status success';
      btn.textContent = '✉ Enviar Email';

      await saveVoucher({
        tipo:          voucherData.tipo,
        codigo:        voucherData.codigo,
        para:          voucherData.para,
        de:            voucherData.de,
        descricao:     voucherData.descricao,
        mensagem:      voucherData.mensagem,
        canal:         voucherData.canal,
        valor:         voucherData.valor,
        telefone:      voucherData.telefone,
        enviadoPor:    voucherData.enviadoPor,
        cadastradoPor: voucherData.cadastradoPor,
        data:          new Date().toISOString(),
        pdfBytes:      generatedPdfBytes,
        zohoRegistrado,
        emailEnviado:  true,
      });
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

// ── Histórico (Log) ───────────────────────────────────────────
document.getElementById('btnLog').addEventListener('click', () => {
  lastScreenBeforeLog = document.querySelector('.screen:not(.hidden)')?.id || 'screen1';
  showLog();
});

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

async function showLog() {
  showScreen('screenLog');
  const vouchers = await getAllVouchers();
  const tbody = document.getElementById('logBody');

  if (vouchers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="log-empty">Nenhum voucher gerado ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = vouchers.map(v => `
    <tr>
      <td><strong>#${v.codigo}</strong></td>
      <td>${tipoLabel(v.tipo)}</td>
      <td>${v.para}${v.de ? `<br><small style="color:#aaa;">de: ${v.de}</small>` : ''}</td>
      <td>${v.descricao.replace(/\n/g, '<br>')}</td>
      <td>${formatDate(v.data)}</td>
      <td>${flagCell(v.emailEnviado)}</td>
      <td>${flagCell(v.zohoRegistrado)}</td>
      <td>
        ${v.pdfBytes
          ? `<button class="btn-download-log" data-codigo="${v.codigo}">⬇ PDF</button>`
          : '—'}
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-download-log').forEach(btn => {
    btn.addEventListener('click', async () => {
      const all = await getAllVouchers();
      const v   = all.find(x => x.codigo === btn.dataset.codigo);
      if (v?.pdfBytes) triggerDownload(v.pdfBytes, v.para, v.codigo);
    });
  });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' '
       + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
