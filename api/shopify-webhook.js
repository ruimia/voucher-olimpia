const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── helpers ───────────────────────────────────────────────────
function getAttr(note_attributes, key) {
  const found = (note_attributes || []).find(a => a.name === key);
  return found ? (found.value || '').trim() : '';
}

function proximoCodigo(orderNumber) {
  return String(orderNumber);
}

async function sendEmail({ to, para, de, mensagem, descricao, codigo, tipo, valor }) {
  const body = JSON.stringify({ to, para, de, mensagem, descricao, codigo, tipo, valor });
  return new Promise((resolve) => {
    const url = new URL('https://vale.olimpiaspa.com/api/send-email');
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function logZoho({ para, de, descricao, mensagem, codigo, canal, valor, telefone }) {
  const body = JSON.stringify({ para, de, descricao, mensagem, codigo, canal, valor, telefone, enviadoPor: 'E-mail', cadastradoPor: 'Shopify', data: new Date().toISOString() });
  return new Promise((resolve) => {
    const url = new URL('https://vale.olimpiaspa.com/api/zoho-log');
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

// ── handler ───────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const order = req.body;
  if (!order || !order.id) return res.status(400).json({ error: 'Payload inválido' });

  const attrs      = order.note_attributes || [];
  const isPresente = getAttr(attrs, 'presente').toLowerCase() === 'sim';

  const codigo   = (order.name || '').replace('#', '') || String(order.order_number);
  const valor    = order.total_price;
  const descricao = (order.line_items || [])
    .filter(i => i.product_exists)
    .map(i => i.title)
    .join('\n');

  let para, de, mensagem, emailTo, tipo;

  if (isPresente) {
    tipo     = 'vale-presente';
    para     = getAttr(attrs, 'nome_presenteado') || order.customer?.first_name || '';
    de       = getAttr(attrs, 'de_comprador') || '';
    mensagem = getAttr(attrs, 'mensagem_presente') || '';
    emailTo  = getAttr(attrs, 'email_presenteado') || order.contact_email || '';
  } else {
    tipo     = 'pre-pagamento';
    para     = `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim();
    de       = '';
    mensagem = '';
    emailTo  = order.contact_email || '';
  }

  const telefone = (order.billing_address?.phone || order.customer?.phone || '').replace(/\D/g, '');

  // Salva no Supabase
  const { error: dbErr } = await supa.from('vouchers').upsert({
    codigo,
    tipo,
    para,
    de:              de || null,
    descricao,
    mensagem:        mensagem || null,
    canal:           'Internet',
    valor:           parseFloat(valor) || 0,
    telefone:        telefone || null,
    enviado_por:     'E-mail',
    cadastrado_por:  'Shopify',
    email_enviado:   false,
    zoho_registrado: false,
    pdf_baixado:     false,
  }, { onConflict: 'codigo' });

  if (dbErr) {
    console.error('Supabase error:', dbErr);
    return res.status(500).json({ error: dbErr.message });
  }

  // Dispara email e Zoho em paralelo
  const [emailOk, zohoOk] = await Promise.all([
    emailTo ? sendEmail({ to: emailTo, para, de, mensagem, descricao, codigo, tipo, valor }) : false,
    logZoho({ para, de, descricao, mensagem, codigo, canal: 'Internet', valor, telefone }),
  ]);

  // Atualiza flags
  await supa.from('vouchers').update({
    email_enviado:   emailOk,
    zoho_registrado: zohoOk,
  }).eq('codigo', codigo);

  console.log(`Shopify webhook #${codigo}: email=${emailOk} zoho=${zohoOk}`);
  return res.status(200).json({ ok: true, codigo, emailOk, zohoOk });
};
