const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  host: env.mail.host,
  port: env.mail.port,
  secure: env.mail.port === 465,
  auth: {
    user: env.mail.user,
    pass: env.mail.password,
  },
});

/**
 * 이메일 발송
 * @param {string} to - 수신자 이메일
 * @param {string} subject - 제목
 * @param {string} html - HTML 본문
 */
const sendMail = async (to, subject, html) => {
  const mailOptions = {
    from: `"Magic Book" <${env.mail.from}>`,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
};

/**
 * 인증번호 이메일 발송
 * @param {string} to - 수신자 이메일
 * @param {string} code - 6자리 인증번호
 */
const sendVerificationEmail = async (to, code) => {
  const subject = '[Magic Book] 이메일 인증번호';
  const html = `
    <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #333; margin-bottom: 20px;">이메일 인증번호</h2>
      <p style="color: #666; font-size: 14px;">아래 인증번호를 입력해주세요. (5분간 유효)</p>
      <div style="background: #f4f4f4; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
      </div>
      <p style="color: #999; font-size: 12px;">본인이 요청하지 않은 경우 이 이메일을 무시해주세요.</p>
    </div>
  `;

  return sendMail(to, subject, html);
};

/**
 * 비밀번호 재설정 이메일 발송
 * @param {string} to - 수신자 이메일
 * @param {string} code - 6자리 인증번호
 */
const sendPasswordResetEmail = async (to, code) => {
  const subject = '[Magic Book] 비밀번호 재설정';
  const html = `
    <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #333; margin-bottom: 20px;">비밀번호 재설정</h2>
      <p style="color: #666; font-size: 14px;">아래 인증번호를 입력하여 비밀번호를 재설정해주세요. (5분간 유효)</p>
      <div style="background: #f4f4f4; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
      </div>
      <p style="color: #999; font-size: 12px;">본인이 요청하지 않은 경우 이 이메일을 무시해주세요.</p>
    </div>
  `;

  return sendMail(to, subject, html);
};

module.exports = { sendMail, sendVerificationEmail, sendPasswordResetEmail };
