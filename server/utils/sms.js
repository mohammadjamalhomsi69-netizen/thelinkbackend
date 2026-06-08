const twilio = require('twilio');

let client = null;

const getClient = () => {
  if (!client && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
};

const sendOTP = async (phone, code) => {
  const c = getClient();
  if (!c) {
    console.log(`[SMS MOCK] OTP ${code} for ${phone}`);
    return;
  }
  await c.messages.create({
    body: `Your The Link verification code is: ${code}. Expires in 10 minutes.`,
    from: process.env.TWILIO_PHONE,
    to: phone
  });
};

const sendDepositConfirmed = async (phone, amount) => {
  const c = getClient();
  if (!c) return;
  await c.messages.create({
    body: `The Link: Your deposit of $${amount} has been confirmed. Funds added to your account.`,
    from: process.env.TWILIO_PHONE,
    to: phone
  });
};

module.exports = { sendOTP, sendDepositConfirmed };
