const { Resend } = require('resend');
const { emailTemplate, emailTemplatePrePag } = require('./_email-templates');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'Olímpia Spa <voucher@olimpiaspa.com>';

async function sendEmail({ to, cc, para, de, mensagem, descricao, codigo, tipo, valor }) {
  const isPrePag = tipo === 'pre-pagamento';
  const subject = isPrePag
    ? `Voucher de Pré-pagamento — #${codigo}`
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
}

module.exports = { sendEmail };
