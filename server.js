import express from 'express';
import dotenv from 'dotenv-safe';
import chalk from 'chalk';
import gradient from 'gradient-string';
import configureMiddleware from './config/middleware.js';
import configureRoutes from './config/routes.js';
import connectDatabase from './config/database.js';
import { initializeBackupSchedule } from './utils/backup.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

// Cấu hình middleware
configureMiddleware(app);

// Cấu hình routes
configureRoutes(app);

// Phục vụ tệp HTML cho trang chủ từ thư mục assets
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'assets', 'index.html'));
});

// Kết nối database
connectDatabase()
  .then(async () => {
    await initializeBackupSchedule();

    app.listen(port, () => {
      console.log(gradient.cristal(`Server đang chạy ở cổng ${port}`));
      console.log(`Mở trang Swagger UI tại: http://localhost:${port}/api-docs`);
    });

  })
  .catch(error => {
    console.error(chalk.red('Không thể khởi động server:'), error);
    process.exit(1);
  });
