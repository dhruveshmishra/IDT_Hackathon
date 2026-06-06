const nodemailer = require('nodemailer');

async function sendEmail({ to, subject, text, html }) {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    console.log(`[Mock Email] To: ${to} | Subject: ${subject} | Text: ${text}`);
    return true;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    const info = await transporter.sendMail({
      from: `"RentIt Support" <${emailUser}>`,
      to,
      subject,
      text,
      html
    });

    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error.message);
    console.log(`[Email Fallback] Logged to console:\nTo: ${to}\nSubject: ${subject}\nBody: ${text}`);
    return false;
  }
}

module.exports = sendEmail;
