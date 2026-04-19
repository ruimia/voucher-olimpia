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

async function saveVoucher(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vouchers', 'readwrite');
    tx.objectStore('vouchers').put(record);
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
let lastScreenBeforeLog = 'screen1';

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

document.getElementById('voucherForm').addEventListener('submit', (e) => {
  e.preventDefault();

  let codigo = document.getElementById('codigo').value.trim();
  if (!codigo) {
    codigo = proximoCodigo();
  } else {
    // sincroniza contador se código foi inserido manualmente
    const num = parseInt(codigo);
    const atual = parseInt(localStorage.getItem(STORAGE_KEY) || CODIGO_INICIAL - 1);
    if (num > atual) localStorage.setItem(STORAGE_KEY, num);
  }

  voucherData = {
    para:     document.getElementById('para').value.trim(),
    de:       document.getElementById('de').value.trim(),
    descricao:document.getElementById('descricao').value.trim(),
    mensagem: document.getElementById('mensagem').value.trim(),
    codigo,
  };

  generatedPdfBytes = null; // invalida PDF anterior
  renderVoucher();
  showScreen('screen2');
});

// ── Step 2: Preview ───────────────────────────────────────────
function renderVoucher() {
  document.getElementById('vPara').textContent     = voucherData.para;
  document.getElementById('vDe').textContent       = voucherData.de;
  document.getElementById('vDescricao').textContent = voucherData.descricao;
  document.getElementById('vMensagem').textContent  = voucherData.mensagem;
  document.getElementById('vCodigo').textContent    = '#' + voucherData.codigo;
}

document.getElementById('btnBack2').addEventListener('click', () => showScreen('screen1'));

document.getElementById('btnNext2').addEventListener('click', async () => {
  const btn = document.getElementById('btnNext2');
  btn.textContent = 'Gerando...';
  btn.disabled = true;

  try {
    const pdf = await gerarPDF();
    generatedPdfBytes = pdf.output('arraybuffer');
    renderSummary();
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
function renderSummary() {
  document.getElementById('summaryPara').textContent   = voucherData.para;
  document.getElementById('summaryCodigo').textContent = '#' + voucherData.codigo;
}

document.getElementById('btnBack3').addEventListener('click', () => showScreen('screen2'));

document.getElementById('btnNovo').addEventListener('click', () => {
  document.getElementById('voucherForm').reset();
  document.getElementById('codigo').value = '';
  voucherData = {};
  generatedPdfBytes = null;
  showScreen('screen1');
});

document.getElementById('btnDownloadPDF').addEventListener('click', async () => {
  const btn = document.getElementById('btnDownloadPDF');
  if (!generatedPdfBytes) return;

  btn.textContent = 'Baixando...';
  btn.disabled = true;

  try {
    // salva no IndexedDB (só na primeira vez)
    await saveVoucher({
      codigo:    voucherData.codigo,
      para:      voucherData.para,
      de:        voucherData.de,
      descricao: voucherData.descricao,
      mensagem:  voucherData.mensagem,
      data:      new Date().toISOString(),
      pdfBytes:  generatedPdfBytes,
    });

    triggerDownload(generatedPdfBytes, voucherData.para, voucherData.codigo);

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

async function showLog() {
  showScreen('screenLog');
  const vouchers = await getAllVouchers();
  const tbody = document.getElementById('logBody');

  if (vouchers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="log-empty">Nenhum voucher gerado ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = vouchers.map(v => `
    <tr>
      <td><strong>#${v.codigo}</strong></td>
      <td>${v.para}</td>
      <td>${v.de}</td>
      <td>${v.descricao.replace(/\n/g, '<br>')}</td>
      <td>${formatDate(v.data)}</td>
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
