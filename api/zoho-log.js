const https = require('https');

const ZOHO_TOKEN_URL  = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_OWNER      = 'mileny1';
const ZOHO_APP        = 'vale-presente-olimpia-spa';
const ZOHO_FORM       = 'Adicionar_Liga_o';
const ZOHO_API_BASE   = `https://creator.zoho.com/api/v2/${ZOHO_OWNER}/${ZOHO_APP}/form/${ZOHO_FORM}`;

async function getAccessToken() {
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  });

  return new Promise((resolve, reject) => {
    const url = `${ZOHO_TOKEN_URL}?${params}`;
    const req = https.request(url, { method: 'POST' }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) resolve(json.access_token);
          else reject(new Error('Token error: ' + data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function checkCodigoExists(accessToken, codigo) {
  return new Promise((resolve) => {
    const criteria = encodeURIComponent(`(N_mero_Vale_Presente=="${codigo}")`);
    const options = {
      hostname: 'creator.zoho.com',
      path:     `/api/v2/${ZOHO_OWNER}/${ZOHO_APP}/form/${ZOHO_FORM}?criteria=${criteria}&limit=1`,
      method:   'GET',
      headers:  { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('checkCodigo response:', JSON.stringify(json).slice(0, 200));
          resolve(json.code === 3000 && Array.isArray(json.data) && json.data.length > 0);
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

function postToZoho(accessToken, record) {
  const body = JSON.stringify({ data: record });
  return new Promise((resolve, reject) => {
    const url = new URL(ZOHO_API_BASE);
    const options = {
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function logToZoho({ para, de, descricao, mensagem, codigo, canal, valor, data, telefone, enviadoPor, cadastradoPor }) {
  const accessToken = await getAccessToken();

  const d = new Date(data || Date.now());
  const zohoDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-');

  const record = {
    Data_Liga_o:          zohoDate,
    N_mero_Vale_Presente: codigo,
    Nome:                 de || para || '',
    Nome_Presenteado:     para,
    Se_Outros:            descricao || '',
    Comprado:             canal || '',
    Valor_Vale_Presente:  parseFloat(valor) || 0,
    Telefone:             (telefone || '').replace(/\D/g, ''),
    Quem_VENDEU:          cadastradoPor || '',
    Enviado_por:          enviadoPor || '',
    O_que_procura:        ['Outros'],
    Utilizou:             'Nao',
  };

  const result = await postToZoho(accessToken, record);
  console.log('Zoho response:', result.status, JSON.stringify(result.body));
  return result.body?.code === 3000;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { para, de, descricao, mensagem, codigo, canal, valor, data, telefone, enviadoPor, cadastradoPor } = req.body || {};

  if (!codigo || !para) {
    return res.status(400).json({ error: 'Campos obrigatórios: codigo, para' });
  }

  try {
    const accessToken = await getAccessToken();

    const d = new Date(data || Date.now());
    const zohoDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      .replace(/ /g, '-');

    const record = {
      Data_Liga_o:          zohoDate,
      N_mero_Vale_Presente: codigo,
      Nome:                 de || para || '',
      Nome_Presenteado:     para,
      Se_Outros:            descricao || '',
      Comprado:             canal || '',
      Valor_Vale_Presente:  parseFloat(valor) || 0,
      Telefone:             (telefone || '').replace(/\D/g, ''),
      Quem_VENDEU:          cadastradoPor || '',
      Enviado_por:          enviadoPor || '',
      O_que_procura:        ['Outros'],
      Utilizou:             'Nao',
    };

    const result = await postToZoho(accessToken, record);
    console.log('Zoho response:', result.status, JSON.stringify(result.body));

    if (result.status === 200 || result.status === 201) {
      res.status(200).json({ ok: true });
    } else {
      res.status(500).json({ error: 'Zoho retornou erro', detail: result.body });
    }
  } catch (err) {
    console.error('zoho-log error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = handler;
module.exports.logToZoho = logToZoho;
