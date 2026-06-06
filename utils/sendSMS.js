const twilio = require('twilio');

/**
 * sendSMS — sends a plain SMS message via Twilio Messaging API.
 * Falls back to console log if credentials missing.
 */
async function sendSMS({ to, body }) {
  const accountSid  = process.env.TWILIO_ACCOUNT_SID;
  const authToken   = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE;

  if (!accountSid || !authToken) {
    console.log(`[Mock SMS] To: ${to} | Msg: ${body}`);
    return true;
  }

  if (!twilioPhone) {
    console.warn('[SMS] TWILIO_PHONE not set — cannot send SMS.');
    return false;
  }

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({ body, from: twilioPhone, to });
    console.log('SMS sent. SID:', message.sid);
    return true;
  } catch (error) {
    console.error('Twilio SMS error:', error.message);
    return false;
  }
}

/**
 * sendOTP — sends a Twilio Verify OTP to a phone number.
 * Requires TWILIO_VERIFY_SERVICE_SID in .env
 * @param {string} to   — E.164 phone e.g. +919876543210
 * @param {string} channel — 'sms' (default) | 'whatsapp' | 'call'
 */
async function sendOTP({ to, channel = 'sms' }) {
  const accountSid  = process.env.TWILIO_ACCOUNT_SID;
  const authToken   = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid  = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !serviceSid) {
    const mockOtp = Math.floor(100000 + Math.random() * 900000);
    console.log(`[Mock OTP] To: ${to} | OTP: ${mockOtp}`);
    return { success: true, mock: true, otp: mockOtp };
  }

  try {
    const client = twilio(accountSid, authToken);
    const verification = await client.verify.v2
      .services(serviceSid)
      .verifications.create({ to, channel });
    console.log('Twilio Verify OTP sent. Status:', verification.status);
    return { success: true, mock: false };
  } catch (error) {
    console.error('Twilio Verify sendOTP error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * verifyOTP — checks OTP code with Twilio Verify.
 * @param {string} to   — same phone used in sendOTP
 * @param {string} code — 6-digit code user entered
 */
async function verifyOTP({ to, code }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !serviceSid) {
    console.log(`[Mock OTP Verify] To: ${to} | Code: ${code} → APPROVED (mock)`);
    return { success: true, approved: true };
  }

  try {
    const client = twilio(accountSid, authToken);
    const check = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({ to, code });
    
    const approved = check.status === 'approved';
    console.log(`Twilio OTP verify status for ${to}: ${check.status}`);
    return { success: true, approved };
  } catch (error) {
    console.error('Twilio Verify checkOTP error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendSMS, sendOTP, verifyOTP };
