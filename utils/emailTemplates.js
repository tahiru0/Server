export const accountActivationTemplate = ({ accountName, companyName, activationLink }) => `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; border-radius: 8px;">
        <div style="max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
            <h2 style="color: #007BFF;">Kính gửi ${accountName},</h2>
            <p style="font-size: 16px; line-height: 1.5;">Chúng tôi xin chân thành cảm ơn bạn đã đăng ký tài khoản cho công ty <strong>${companyName}</strong>.</p>
            <p style="font-size: 16px; line-height: 1.5;">Để hoàn tất quá trình đăng ký và kích hoạt tài khoản của bạn, vui lòng nhấp vào liên kết bên dưới:</p>
            <p style="text-align: center;">
                <a href="${activationLink}" style="background-color: #007BFF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Xác nhận tài khoản của bạn</a>
            </p>
            <p style="font-size: 16px; line-height: 1.5;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
            <p style="font-size: 16px; line-height: 1.5;">Trân trọng,</p>
            <p style="font-size: 16px; line-height: 1.5;">Đội ngũ <strong>TECH ONE</strong></p>
        </div>
    </div>
`;

export const passwordResetTemplate = ({ accountName, resetLink }) => `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; border-radius: 8px;">
        <div style="max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
            <h2 style="color: #007BFF;">Xin chào ${accountName},</h2>
            <p style="font-size: 16px; line-height: 1.5;">Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản của mình.</p>
            <p style="font-size: 16px; line-height: 1.5;">Để đặt lại mật khẩu của bạn, vui lòng nhấp vào liên kết bên dưới:</p>
            <p style="text-align: center;">
                <a href="${resetLink}" style="background-color: #007BFF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Đặt lại mật khẩu</a>
            </p>
            <p style="font-size: 16px; line-height: 1.5;">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
            <p style="font-size: 16px; line-height: 1.5;">Trân trọng,</p>
            <p style="font-size: 16px; line-height: 1.5;">Đội ngũ <strong>TECH ONE</strong></p>
        </div>
    </div>
`;

export const emailChangeConfirmationTemplate = ({ accountName, companyName, confirmationLink, newEmail }) => `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Xác nhận thay đổi email</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 20px auto;
            padding: 20px;
            background-color: #f9f9f9;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #007BFF;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
        }
        .content {
            background-color: white;
            padding: 20px;
            border-radius: 0 0 8px 8px;
        }
        .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #007BFF;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            margin-top: 20px;
        }
        .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Xác nhận thay đổi email</h1>
        </div>
        <div class="content">
            <p>Kính gửi ${accountName},</p>
            <p>Chúng tôi nhận được yêu cầu thay đổi địa chỉ email cho tài khoản của bạn tại ${companyName}.</p>
            <p>Email mới của bạn sẽ là: <strong>${newEmail}</strong></p>
            <p>Để xác nhận thay đổi này, vui lòng nhấp vào nút bên dưới:</p>
            <p style="text-align: center;">
                <a href="${confirmationLink}" class="button">Xác nhận thay đổi email</a>
            </p>
            <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này hoặc liên hệ với bộ phận hỗ trợ của chúng tôi.</p>
            <p>Trân trọng,<br>Đội ngũ TECH ONE</p>
        </div>
        <div class="footer">
            <p>© 2024 TECH ONE. Bảo lưu mọi quyền.</p>
            <p>Đây là email tự động, vui lòng không trả lời email này.</p>
        </div>
    </div>
</body>
</html>
`;

export const newAccountCreatedTemplate = ({ accountName, companyName, email, role }) => `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tài khoản mới đã được tạo</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
        }
        .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .header {
            background-color: #007BFF;
            color: white;
            padding: 20px;
            text-align: center;
        }
        .content {
            padding: 20px;
        }
        .footer {
            background-color: #f8f9fa;
            color: #6c757d;
            text-align: center;
            padding: 10px;
            font-size: 12px;
        }
        .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #007BFF;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
        }
        .info-box {
            background-color: #e9ecef;
            border-radius: 5px;
            padding: 15px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Chào mừng bạn đến với ${companyName}</h1>
        </div>
        <div class="content">
            <p>Kính gửi ${accountName},</p>
            <p>Chúng tôi vui mừng thông báo rằng tài khoản của bạn đã được tạo thành công tại ${companyName}.</p>
            <div class="info-box">
                <h3>Thông tin tài khoản của bạn:</h3>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Vai trò:</strong> ${role}</p>
            </div>
            <p>Để bắt đầu sử dụng tài khoản của bạn, vui lòng liên hệ với quản trị viên để nhận thông tin đăng nhập.</p>
            <p>Nếu bạn có bất kỳ câu hỏi nào, đừng ngần ngại liên hệ với chúng tôi.</p>
            <p>Chúc bạn có những trải nghiệm tuyệt vời!</p>
            <p>Trân trọng,<br>Đội ngũ ${companyName}</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} ${companyName}. Bảo lưu mọi quyền.</p>
            <p>Đây là email tự động, vui lòng không trả lời email này.</p>
        </div>
    </div>
</body>
</html>
`;

// Add more templates as needed
