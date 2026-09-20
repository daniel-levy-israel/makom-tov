const ENDPOINT = 'https://019sms.co.il/api';

function configured() {
  return Boolean(process.env.SMS019_USERNAME && process.env.SMS019_API_TOKEN && process.env.SMS019_SOURCE);
}
function normalizeIsraeliPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) digits = `0${digits}`;
  return /^05\d{8}$/.test(digits) ? digits : '';
}
function success(payload) {
  const status = payload && (payload.status ?? payload.Status);
  return status === 0 || status === '0';
}
async function request(body) {
  if (!configured()) throw Object.assign(new Error('sms019_not_configured'), { code: 'not_configured' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS019_API_TOKEN}` },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { status: -1, message: text.slice(0, 200) }; }
    if (!response.ok || !success(payload)) {
      const error = new Error('sms019_rejected');
      error.code = 'provider_rejected'; error.providerStatus = String(payload.status ?? response.status);
      throw error;
    }
    return payload;
  } finally { clearTimeout(timer); }
}
async function sendOtp(phone) {
  const normalized = normalizeIsraeliPhone(phone);
  if (!normalized) throw Object.assign(new Error('invalid_destination'), { code: 'invalid_destination' });
  const appId = Number.parseInt(process.env.SMS019_APP_ID || '1', 10) || 1;
  return request({ send_otp: { user: { username: process.env.SMS019_USERNAME }, phone: normalized, app_id: appId,
    source: process.env.SMS019_SOURCE, max_tries: 5, valid_time: 5,
    text: process.env.SMS019_OTP_TEXT || 'קוד האימות שלך למקום טוב הוא [code]' } });
}
async function validateOtp(phone, code) {
  const normalized = normalizeIsraeliPhone(phone);
  if (!normalized || !/^\d{6}$/.test(String(code))) throw Object.assign(new Error('invalid_otp'), { code: 'invalid_otp' });
  const appId = Number.parseInt(process.env.SMS019_APP_ID || '1', 10) || 1;
  return request({ validate_otp: { user: { username: process.env.SMS019_USERNAME }, phone: normalized, app_id: appId, code: Number(code) } });
}
module.exports = { configured, normalizeIsraeliPhone, sendOtp, validateOtp };
