import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import Email from '../models/Email.js'; // Import Email model
import Config from '../models/Config.js';

dotenv.config();

export const getEmailConfig = async () => {
  const config = await Config.findOne();
  if (config && config.email) {
    return {
      service: config.email.service,
      auth: {
        user: config.email.user,
        pass: config.email.pass
      },
      host: config.email.host,
      port: config.email.port,
      senderName: config.email.senderName
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
  try {
    const config = await getEmailConfig();
    const transporter = nodemailer.createTransport({
      service: config.service,
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass
      }
    });

    const mailOptions = {
      from: `"${config.email.senderName}" <${config.email.user}>`,
      to,
      subject,
      html: htmlContent,
    };

    console.log('Attempting to send email...');
    console.log('Email configuration:', {
      service: config.service,
      host: config.host,
      port: config.port,
      user: config.auth.user
    });

    let info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);

    const email = new Email({ to, subject, htmlContent, type });
    await email.save();
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    
    const failedEmail = new Email({
      to,
      subject,
      htmlContent,
      type,
      status: 'failed',
      error: error.message
    });
    await failedEmail.save();
    
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
