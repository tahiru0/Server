import express from 'express';
import dotenv from 'dotenv-safe';
import chalk from 'chalk';
import gradient from 'gradient-string';
import configureMiddleware from './config/middleware.js';
import configureRoutes from './config/routes.js';
import connectDatabase from './config/database.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Cấu hình middleware
configureMiddleware(app);

// Cấu hình routes
configureRoutes(app);

// Kết nối database
connectDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(gradient.cristal(`Server đang chạy ở cổng ${port}`));
      console.log(`Mở trang Swagger UI tại: http://localhost:${port}/api-docs`);
    });

  })
  .catch(error => {
    console.error(chalk.red('Không thể khởi động server:'), error);
    process.exit(1);
  });
