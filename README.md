# 🚀 Thực Tập Doanh Nghiệp Số TechOne

<img src="/assets/icons/logo.png" alt="TechOne Logo" width="100"/>

## 📖 Giới thiệu

Dự án Thực Tập Doanh Nghiệp Số TechOne là một nền tảng quản lý thực tập sinh và dự án thực tập. Hệ thống này giúp kết nối sinh viên với các doanh nghiệp, tạo điều kiện cho việc quản lý và theo dõi quá trình thực tập một cách hiệu quả.

### 🌟 Tính năng chính

- Đăng ký và quản lý tài khoản cho sinh viên và doanh nghiệp
- Tạo và quản lý dự án thực tập
- Hệ thống matching tự động giữa sinh viên và dự án
- Theo dõi tiến độ và đánh giá thực tập sinh
- Giao tiếp trực tuyến giữa mentor và thực tập sinh

## 🛠 Cài đặt

### Yêu cầu hệ thống

- Node.js (v14.0.0 trở lên)
- MongoDB (v4.4 trở lên)

### Các bước cài đặt

1. **Clone repository**

   ```bash
   git clone https://github.com/your-username/techone-internship.git
   cd techone-internship
   ```

2. **Cài đặt dependencies**

   ```bash
   npm install
   ```

3. **Cấu hình môi trường**

   Tạo file `.env` trong thư mục gốc của dự án và thêm các biến môi trường sau:

   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/techone_internship
   JWT_SECRET=your_jwt_secret_key
   EMAIL_USER=your_email@example.com
   EMAIL_PASS=your_email_password
   SENDER_NAME=TechOne Internship
   ```

   Thay thế các giá trị với thông tin cụ thể của bạn.

4. **Khởi động server**

   ```bash
   npm start
   ```

   Server sẽ chạy tại `http://localhost:5000`.

## 📚 Tài liệu API

Tài liệu API có sẵn thông qua Swagger UI. Sau khi khởi động server, truy cập:
 http://localhost:5000/api-docs
