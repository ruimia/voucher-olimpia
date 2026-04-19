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

document.getElementById('btnGerarCodigo').addEventListener('click', () => {
  document.getElementById('codigo').value = peekProximoCodigo();
});

document.getElementById('voucherForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const para = document.getElementById('para').value.trim();
  const de = document.getElementById('de').value.trim();
  const descricao = document.getElementById('descricao').value.trim();
  const mensagem = document.getElementById('mensagem').value.trim();
  let codigo = document.getElementById('codigo').value.trim();

  if (!codigo) codigo = proximoCodigo();

  document.getElementById('vPara').textContent = para;
  document.getElementById('vDe').textContent = de;
  document.getElementById('vDescricao').textContent = descricao;
  document.getElementById('vMensagem').textContent = mensagem;
  document.getElementById('vCodigo').textContent = '#' + codigo;
  document.getElementById('codigo').value = codigo;

  document.getElementById('previewSection').style.display = 'block';
  document.getElementById('previewSection').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('btnEditar').addEventListener('click', () => {
  document.getElementById('previewSection').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('btnDownloadPDF').addEventListener('click', async () => {
  const btn = document.getElementById('btnDownloadPDF');
  btn.textContent = 'Gerando PDF...';
  btn.disabled = true;

  try {
    const voucher = document.getElementById('voucher');
    const canvas = await html2canvas(voucher, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;

    const ratio = canvas.width / canvas.height;
    let imgW = maxW;
    let imgH = imgW / ratio;

    if (imgH > maxH) {
      imgH = maxH;
      imgW = imgH * ratio;
    }

    const x = (pageW - imgW) / 2;
    const y = (pageH - imgH) / 2;

    pdf.addImage(imgData, 'PNG', x, y, imgW, imgH);

    const para = document.getElementById('para').value.trim();
    const codigo = document.getElementById('codigo').value.trim();
    pdf.save(`vale-presente-${para.replace(/\s+/g, '-')}-${codigo}.pdf`);
  } catch (err) {
    alert('Erro ao gerar PDF. Tente novamente.');
    console.error(err);
  } finally {
    btn.textContent = '⬇ Baixar PDF';
    btn.disabled = false;
  }
});
