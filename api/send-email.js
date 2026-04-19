const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM_EMAIL || 'Olímpia Spa <onboarding@resend.dev>';

const HEADER_IMG = 'https://cdn.shopify.com/s/files/1/0701/4000/2477/files/unnamed_7.png?v=1746470866';
const FOOTER_IMG  = 'https://cdn.shopify.com/s/files/1/0701/4000/2477/files/unnamed_8.png?v=1746470866';

function emailTemplatePrePag({ para, descricao, codigo, valor }) {
  const valorFmt = valor
    ? 'R$ ' + parseFloat(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:Georgia,serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">

  <img src="${HEADER_IMG}" alt="Olímpia Spa" style="width:100%;display:block;" />

  <div style="padding:24px 32px;text-align:center;">
    <h1 style="font-size:1.6rem;letter-spacing:2px;color:#2c2c2c;margin:0 0 6px;text-transform:uppercase;">Voucher de Pré-pagamento</h1>
    <p style="font-size:1rem;color:#666;font-style:italic;margin:0 0 20px;">Seu tratamento no Olímpia Spa está reservado</p>

    <div style="text-align:left;background:#faf7f3;border-radius:6px;padding:16px 20px;margin-bottom:16px;border:1px solid #ede6da;">
      <p style="margin:0 0 8px;font-size:1rem;"><strong>CLIENTE:</strong> ${para}</p>
      <p style="margin:0;font-size:1rem;">
        <strong>SERVIÇO:</strong><br>
        ${descricao.replace(/\n/g, '<br>')}
      </p>
    </div>

    ${valorFmt ? `
    <div style="background:#f5f0eb;border:2px solid #d4a96a;border-radius:6px;padding:14px 20px;margin-bottom:16px;text-align:center;">
      <p style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;color:#888;margin:0 0 4px;">Valor Pago</p>
      <p style="font-size:2rem;font-weight:bold;color:#2c2c2c;margin:0;">${valorFmt}</p>
    </div>` : ''}

    <div style="background:#2c2c2c;border-radius:6px;padding:14px 20px;margin-bottom:20px;">
      <p style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;color:#d4a96a;margin:0 0 4px;">Código:</p>
      <p style="font-size:2rem;font-weight:bold;letter-spacing:4px;color:#fff;margin:0 0 4px;">#${codigo}</p>
      <p style="font-size:0.75rem;color:#aaa;font-style:italic;margin:0;">(Guarde esse número para agendamento dos tratamentos)</p>
    </div>

    <p style="font-size:0.9rem;color:#555;margin:0 0 4px;">
      Agende em <a href="http://www.olimpiaspa.com" style="color:#d4a96a;">OlimpiaSpa.com</a>
    </p>
    <p style="font-size:0.85rem;color:#d4a96a;font-style:italic;margin:0 0 8px;">(válido por 90 dias)</p>
    <p style="font-size:0.9rem;color:#333;margin:0;">
      Jardins ou Vila Olímpia:<br>
      <strong>(11) 2122-4027</strong> ou WhatsApp <strong>(11) 98704-9281</strong>
    </p>
  </div>

  <img src="${FOOTER_IMG}" alt="" style="width:100%;display:block;" />

  <div style="background:#f5f0eb;text-align:center;padding:14px 24px;font-size:0.75rem;color:#777;line-height:1.8;border-top:1px solid #ede6da;">
    <p style="margin:0;">* Válido por 90 dias após o recebimento do vale</p>
    <p style="margin:0;">** Esse vale-presente é pessoal e intransferível</p>
    <p style="margin:4px 0;font-weight:bold;color:#555;">Agende: (11) 2122-4027 ou WhatsApp (11) 98704-9281</p>
    <p style="margin:0;">Rua Coronel Joaquim Ferreira Lobo, 202 - Vila Olímpia</p>
    <p style="margin:0;">Alameda Santos, 484 (cobertura) - Jardins</p>
    <p style="margin:0;"><strong>www.OlimpiaSpa.com</strong></p>
  </div>

</div>
</body>
</html>`;
}

function emailTemplate({ para, de, mensagem, descricao, codigo }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:Georgia,serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">

  <img src="${HEADER_IMG}" alt="Olímpia Spa" style="width:100%;display:block;" />

  <div style="padding:24px 32px;text-align:center;">
    <h1 style="font-size:2rem;letter-spacing:3px;color:#2c2c2c;margin:0 0 6px;">PARABÉNS!</h1>
    <p style="font-size:1rem;color:#666;font-style:italic;margin:0 0 20px;">
      Você acaba de ganhar um tratamento no Olímpia Spa
    </p>

    <div style="text-align:left;background:#faf7f3;border-radius:6px;padding:16px 20px;margin-bottom:16px;border:1px solid #ede6da;">
      <p style="margin:0 0 8px;font-size:1rem;"><strong>PARA:</strong> ${para}</p>
      <p style="margin:0 0 8px;font-size:1rem;"><strong>DE:</strong> ${de}</p>
      <p style="margin:0 0 8px;font-size:1rem;">
        <strong>Mensagem:</strong><br>
        <em>"${mensagem}"</em>
      </p>
      <p style="margin:0;font-size:1rem;">
        <strong>Descrição do pacote:</strong><br>
        ${descricao.replace(/\n/g, '<br>')}
      </p>
    </div>

    <div style="background:#2c2c2c;border-radius:6px;padding:14px 20px;margin-bottom:20px;">
      <p style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;color:#d4a96a;margin:0 0 4px;">
        Código Vale-Presente:
      </p>
      <p style="font-size:2rem;font-weight:bold;letter-spacing:4px;color:#fff;margin:0 0 4px;">
        #${codigo}
      </p>
      <p style="font-size:0.75rem;color:#aaa;font-style:italic;margin:0;">
        (Guarde esse número para agendamento dos tratamentos)
      </p>
    </div>

    <p style="font-size:0.9rem;color:#555;margin:0 0 4px;">
      Veja os tratamentos em <a href="http://www.olimpiaspa.com" style="color:#d4a96a;">OlimpiaSpa.com</a>, ligue e agende
    </p>
    <p style="font-size:0.85rem;color:#d4a96a;font-style:italic;margin:0 0 8px;">(válido por 90 dias)</p>
    <p style="font-size:0.9rem;color:#333;margin:0;">
      Jardins ou Vila Olímpia:<br>
      <strong>(11) 2122-4027</strong> ou WhatsApp <strong>(11) 98704-9281</strong>
    </p>
  </div>

  <img src="${FOOTER_IMG}" alt="" style="width:100%;display:block;" />

  <div style="background:#f5f0eb;text-align:center;padding:14px 24px;font-size:0.75rem;color:#777;line-height:1.8;border-top:1px solid #ede6da;">
    <p style="margin:0;">* Válido por 90 dias após o recebimento do vale</p>
    <p style="margin:0;">** Esse vale-presente é pessoal e intransferível</p>
    <p style="margin:4px 0;font-weight:bold;color:#555;">Agende: (11) 2122-4027 ou WhatsApp (11) 98704-9281</p>
    <p style="margin:0;">Rua Coronel Joaquim Ferreira Lobo, 202 - Vila Olímpia</p>
    <p style="margin:0;">Alameda Santos, 484 (cobertura) - Jardins</p>
    <p style="margin:0;"><strong>www.OlimpiaSpa.com</strong></p>
  </div>

</div>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, cc, para, de, descricao, mensagem, codigo, pdfBase64, tipo, valor } = req.body;

  if (!to || !para || !codigo) {
    return res.status(400).json({ error: 'Campos obrigatórios: to, para, codigo' });
  }

  const isPrePag = tipo === 'pre-pagamento';
  const subject = isPrePag
    ? `Voucher de Pré-pagamento — #${codigo}`
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
      attachments: pdfBase64
        ? [{ filename: `vale-presente-${para.replace(/\s+/g, '-')}-${codigo}.pdf`, content: pdfBase64 }]
        : [],
    });

    return res.status(200).json({ success: true, id: result.data?.id });
  } catch (err) {
    console.error('Resend error:', err);
    return res.status(500).json({ error: err.message });
  }
};
