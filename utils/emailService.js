import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import Email from '../models/Email.js'; // Import Email model

dotenv.config();

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
    const mailOptions = {
        from: `"${process.env.SENDER_NAME}" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        html: htmlContent,
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.response);

        // Lưu email vào database với trường type
        const email = new Email({ to, subject, htmlContent, type });
        await email.save();
        return { success: true, message: 'Email sent successfully' };
    } catch (error) {
        console.error('Error sending email with primary credentials:', error);

        // Cấu hình lại transporter với EMAIL_USER2 và EMAIL_PASS2
        const transporter2 = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER2,
                pass: process.env.EMAIL_PASS2,
            },
            tls: {
                ciphers: 'SSLv3'
            }
        });

        try {
            let info = await transporter2.sendMail(mailOptions);
            console.log('Email sent with secondary credentials:', info.response);

            // Lưu email vào database với trường type
            const email = new Email({ to, subject, htmlContent, type });
            await email.save();
            return { success: true, message: 'Email sent successfully with secondary credentials' };
        } catch (error) {
            console.error('Error sending email with secondary credentials:', error);
            // Lưu email vào database với trạng thái lỗi
            const email = new Email({ to, subject, htmlContent, type, status: 'failed', error: error.message });
            await email.save();
            return { success: false, message: 'Failed to send email with both primary and secondary credentials', error: error.message };
        }
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