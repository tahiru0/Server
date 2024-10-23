import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import Email from '../models/Email.js'; // Import Email model
import Config from '../models/Config.js';

dotenv.config();

const getEmailConfig = async () => {
  const config = await Config.findOne();
  if (config) {
    return {
      service: config.emailService,
      auth: {
        user: config.emailUser,
        pass: config.emailPass
      },
      host: config.emailHost,
      port: config.emailPort,
      senderName: config.senderName
    };
  }
  return {
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    senderName: process.env.SENDER_NAME
  };
};

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        ciphers: 'SSLv3'
    }
});

// Function to send an email using plain HTML content
export const sendEmail = async (to, subject, htmlContent, type = 'sent') => {
  const emailConfig = await getEmailConfig();
  
  const transporterConfig = {
    service: emailConfig.service,
    auth: emailConfig.auth
  };

  if (emailConfig.service === 'custom') {
    transporterConfig.host = emailConfig.host;
    transporterConfig.port = emailConfig.port;
    delete transporterConfig.service;
  }

  const transporter = nodemailer.createTransport(transporterConfig);

  const mailOptions = {
    from: `"${emailConfig.senderName}" <${emailConfig.auth.user}>`,
    to: to,
    subject: subject,
    html: htmlContent,
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);

    const email = new Email({ to, subject, htmlContent, type });
    await email.save();
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    const email = new Email({ to, subject, htmlContent, type, status: 'failed', error: error.message });
    await email.save();
    return { success: false, message: 'Failed to send email', error: error.message };
  }
};

// Function to restore a soft-deleted email
export const restoreEmail = async (id) => {
    try {
        const email = await Email.findById(id);
        if (!email) {
            throw new Error('Không tìm thấy email.');
        }

        await email.restore();
        return email;
    } catch (error) {
        console.error('Lỗi khi khôi phục email:', error);
        throw error;
    }
};
