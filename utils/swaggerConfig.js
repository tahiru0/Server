import swaggerJsDoc from 'swagger-jsdoc';

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Thực Tập Doanh Nghiệp Ảo TechOne',
      version: '1.0.0',
      description: 'Tài liệu API cho phần mềm quản lý thực tập doanh nghiệp ảo',
    },
    servers: [
      {
        url: 'http://localhost:5000',
      },
    ],
    components: {
      securitySchemes: {
        companyBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Sử dụng cho Công ty',
        },
        adminBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Sử dụng cho Admin',
        },
        schoolAdminBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Sử dụng cho School Admin',
        },
        companyAdminBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Sử dụng cho Company Admin',
        },
        studentBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Sử dụng cho Sinh viên',
        },
      },
    },
  },
  apis: ['./routes/*.js', './models/*.js', './swagger/*.js'],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

export default swaggerDocs;
