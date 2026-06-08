const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const sendOTP = async (email, code, username) => {
  await transporter.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: 'Your The Link verification code',
    html: `
      <div style="background:#0a0a0f;padding:40px;font-family:system-ui,sans-serif;">
        <div style="max-width:480px;margin:0 auto;background:#14141e;border:1px solid #22223a;border-radius:16px;padding:32px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);border-radius:12px;padding:12px 24px;display:inline-block;">
              <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:4px;">THE LINK</span>
            </div>
          </div>
          <h2 style="color:#f1f0ff;text-align:center;margin-bottom:8px;">Verify Your Account</h2>
          <p style="color:#a0a0c0;text-align:center;margin-bottom:28px;">Hi ${username || 'there'}, use the code below to verify your account.</p>
          <div style="background:#0a0a0f;border:1px solid #7c3aed;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
            <div style="font-size:36px;font-weight:900;color:#7c3aed;letter-spacing:8px;">${code}</div>
            <div style="font-size:12px;color:#606080;margin-top:8px;">Expires in 10 minutes</div>
          </div>
          <p style="color:#606080;font-size:12px;text-align:center;">If you didn't create an account, ignore this email.</p>
        </div>
      </div>
    `
  });
};

const sendDepositConfirmed = async (email, username, amount, credits) => {
  await transporter.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: 'Deposit Confirmed — The Link',
    html: `
      <div style="background:#0a0a0f;padding:40px;font-family:system-ui,sans-serif;">
        <div style="max-width:480px;margin:0 auto;background:#14141e;border:1px solid #22223a;border-radius:16px;padding:32px;">
          <h2 style="color:#22c55e;text-align:center;">✅ Deposit Confirmed</h2>
          <p style="color:#a0a0c0;text-align:center;">Hi ${username}, your deposit has been confirmed.</p>
          <div style="background:#0a2a14;border:1px solid #1a5a2a;border-radius:10px;padding:16px;margin:20px 0;text-align:center;">
            <div style="font-size:28px;font-weight:900;color:#22c55e;">+$${amount}</div>
            <div style="color:#606080;margin-top:4px;">⚡ ${credits} credits added</div>
          </div>
          <p style="color:#606080;font-size:12px;text-align:center;">Your balance has been updated. Visit The Link to start playing.</p>
        </div>
      </div>
    `
  });
};

const sendWithdrawalProcessed = async (email, username, amount, method) => {
  await transporter.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: 'Withdrawal Processed — The Link',
    html: `
      <div style="background:#0a0a0f;padding:40px;font-family:system-ui,sans-serif;">
        <div style="max-width:480px;margin:0 auto;background:#14141e;border:1px solid #22223a;border-radius:16px;padding:32px;">
          <h2 style="color:#f59e0b;text-align:center;">💸 Withdrawal Processed</h2>
          <p style="color:#a0a0c0;text-align:center;">Hi ${username}, your withdrawal of <b style="color:#fff;">$${amount}</b> via ${method} has been processed.</p>
          <p style="color:#606080;font-size:12px;text-align:center;">Please allow 24-48 hours for the funds to arrive. Contact support if you have issues.</p>
        </div>
      </div>
    `
  });
};

module.exports = { sendOTP, sendDepositConfirmed, sendWithdrawalProcessed };
