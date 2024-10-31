import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import flash from "connect-flash";
import MongoStore from 'connect-mongo';

export default function configureMiddleware(app) {
  // Cấu hình CORS với function kiểm tra origin
  app.use(cors({
    origin: function(origin, callback) {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost',
        'https://techone.kcntt.edu.vn'
      ];
      
      // Cho phép requests không có origin (như mobile apps hoặc curl)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, origin);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization',
      'Access-Control-Allow-Methods',
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Origin'
    ],
    credentials: true,
    optionsSuccessStatus: 200
  }));

  // Helmet config
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", "data:", "https:", "http:", "https://techone.kcntt.edu.vn"],
        connectSrc: [
          "'self'", 
          "http://localhost:3000",
          "http://localhost",
          "http://localhost:5000",
          "https://techone.kcntt.edu.vn"
        ],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }));

  // Session config với credentials
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/InternshipManagement',
      ttl: 24 * 60 * 60, // 1 day
      autoRemove: 'native',
      touchAfter: 24 * 3600 // time period in seconds
    }),
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(bodyParser.json());
  app.use(flash());

  app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    next();
  });
}
