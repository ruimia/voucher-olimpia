const { Resend } = require('resend');
const { emailTemplate, emailTemplatePrePag } = require('./_email-templates');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'Olímpia Spa <voucher@olimpiaspa.com>';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, cc, para, de, descricao, mensagem, codigo, tipo, valor } = req.body;
  if (!to || !para || !codigo) return res.status(400).json({ error: 'Campos obrigatórios: to, para, codigo' });

  const isPrePag = tipo === 'pre-pagamento';
  const subject = isPrePag
    ? `Voucher DaySpa — #${codigo}`
    : `Vale-Presente para ${para} — #${codigo}`;
  const html = isPrePag
    ? emailTemplatePrePag({ para, descricao, codigo, valor })
    : emailTemplate({ para, de, mensagem, descricao, codigo });

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: [to],
      cc: cc ? [cc] : [],
      subject,
      html,
    });
    return res.status(200).json({ success: true, id: result.data?.id });
  } catch (err) {
    console.error('Resend error:', err);
    return res.status(500).json({ error: err.message });
  }
};
