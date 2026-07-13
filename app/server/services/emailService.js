const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

const sendChallengeFailed = async (email, accountLabel, finalBalance, maxLoss) => {
  try {
    await getTransporter().sendMail({
      from: `"FxQuant Trading" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "FxQuant Challenge Failed",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #0a0a0c; color: #ffffff; border-radius: 12px;">
          <h2 style="text-align: center; color: #ef4444; margin-bottom: 24px;">Challenge Failed</h2>
          <p style="text-align: center; color: #a1a1aa; font-size: 16px; line-height: 1.6;">
            Unfortunately, your <strong style="color: #ffffff;">${accountLabel}</strong> prop firm challenge has ended.
          </p>
          <div style="text-align: center; padding: 20px; margin: 20px 0; background: #18181b; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3);">
            <div style="font-size: 14px; color: #a1a1aa; margin-bottom: 8px;">Final Balance</div>
            <div style="font-size: 28px; font-weight: 700; color: #ef4444;">$${finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div style="font-size: 13px; color: #a1a1aa; margin-top: 8px;">Maximum loss of $${maxLoss.toLocaleString()} was reached</div>
          </div>
          <p style="text-align: center; color: #a1a1aa; font-size: 14px; line-height: 1.6;">
            Don't give up! Log back in to select a new challenge and try again.
          </p>
          <p style="text-align: center; color: #71717a; font-size: 12px; margin-top: 24px;">FxQuant Trading Platform</p>
        </div>
      `,
    });
    console.log(`[Email] Challenge failed email sent to ${email}`);
  } catch (error) {
    console.error("[Email] Failed to send challenge failed email:", error);
  }
};

const sendChallengePassed = async (email, accountLabel, finalBalance, profitTarget) => {
  try {
    await getTransporter().sendMail({
      from: `"FxQuant Trading" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Congratulations! FxQuant Challenge Passed!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #0a0a0c; color: #ffffff; border-radius: 12px;">
          <h2 style="text-align: center; color: #22c55e; margin-bottom: 24px;">Congratulations!</h2>
          <p style="text-align: center; color: #a1a1aa; font-size: 16px; line-height: 1.6;">
            You have successfully passed the <strong style="color: #ffffff;">${accountLabel}</strong> prop firm challenge!
          </p>
          <div style="text-align: center; padding: 20px; margin: 20px 0; background: #18181b; border-radius: 8px; border: 1px solid rgba(34, 197, 94, 0.3);">
            <div style="font-size: 14px; color: #a1a1aa; margin-bottom: 8px;">Final Balance</div>
            <div style="font-size: 28px; font-weight: 700; color: #22c55e;">$${finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div style="font-size: 13px; color: #a1a1aa; margin-top: 8px;">Profit target of $${profitTarget.toLocaleString()} was reached</div>
          </div>
          <p style="text-align: center; color: #a1a1aa; font-size: 14px; line-height: 1.6;">
            Great trading! Log back in to start a new challenge or try a higher account size.
          </p>
          <p style="text-align: center; color: #71717a; font-size: 12px; margin-top: 24px;">FxQuant Trading Platform</p>
        </div>
      `,
    });
    console.log(`[Email] Challenge passed email sent to ${email}`);
  } catch (error) {
    console.error("[Email] Failed to send challenge passed email:", error);
  }
};

module.exports = {
  getTransporter,
  sendChallengeFailed,
  sendChallengePassed,
};
