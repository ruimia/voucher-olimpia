const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { logToZoho } = require('./zoho-log');
const { emailTemplate, emailTemplatePrePag } = require('./_email-templates');

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'Olímpia Spa <voucher@olimpiaspa.com>';

function getAttr(note_attributes, key) {
  const found = (note_attributes || []).find(a => a.name === key);
  return found ? (found.value || '').trim() : '';
}

async function sendEmail({ to, cc, para, de, mensagem, descricao, codigo, tipo, valor }) {
  try {
    const isPrePag = tipo === 'pre-pagamento';
    const subject = isPrePag
      ? `Voucher DaySpa — #${codigo}`
      : `Vale-Presente para ${para} — #${codigo}`;
    const html = isPrePag
      ? emailTemplatePrePag({ para, descricao, codigo, valor })
      : emailTemplate({ para, de, mensagem, descricao, codigo });

    const result = await resend.emails.send({
      from: FROM,
      to: [to],
      cc: cc ? [cc] : [],
      subject,
      html,
    });
    return !!result.data?.id;
  } catch (err) {
    console.error('Email error:', err);
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const order = req.body;
  if (!order || (!order.id && !order.order_number)) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  const attrs      = order.note_attributes || [];
  const isPresente = getAttr(attrs, 'presente').toLowerCase() === 'sim';

  const codigo    = (order.name || '').replace('#', '') || String(order.order_number);
  const valor     = order.total_price;
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
  const buyerEmail = isPresente ? (order.contact_email || null) : null;

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
    cadastrado_por:  'OUTROS',
    email_enviado:   false,
    zoho_registrado: false,
    pdf_baixado:     false,
  }, { onConflict: 'codigo' });

  if (dbErr) {
    console.error('Supabase error:', dbErr);
    return res.status(500).json({ error: dbErr.message });
  }

  // Email e Zoho em paralelo — direto, sem HTTP interno
  const [emailOk, zohoOk] = await Promise.all([
    emailTo
      ? sendEmail({ to: emailTo, cc: buyerEmail, para, de, mensagem, descricao, codigo, tipo, valor })
      : Promise.resolve(false),
    logToZoho({ para, de, descricao, mensagem, codigo, canal: 'Internet', valor, telefone, enviadoPor: 'E-mail', cadastradoPor: 'OUTROS' }),
  ]);

  await supa.from('vouchers').update({ email_enviado: emailOk, zoho_registrado: zohoOk }).eq('codigo', codigo);

  console.log(`Shopify #${codigo}: email=${emailOk} zoho=${zohoOk}`);
  return res.status(200).json({ ok: true, codigo, emailOk, zohoOk });
};
