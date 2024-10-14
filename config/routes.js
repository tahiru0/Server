import express from 'express';
import apiRoutes from '../routes/api.js';
import swaggerUi from 'swagger-ui-express';
import swaggerDocs from '../utils/swaggerConfig.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { decodeUrl } from '../utils/urlEncoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function configureRoutes(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
  app.use('/api', apiRoutes);
  app.use('/uploads', (req, res, next) => {
    const decodedPath = decodeURIComponent(req.path);
    const filePath = path.join(__dirname, '..', 'public', 'uploads', decodedPath);
    fs.access(filePath, fs.constants.F_OK, err => {
      if (err) {
        const defaultIconPath = path.join(__dirname, '..', 'assets', 'defaultIcon.svg');
        res.sendFile(defaultIconPath);
      } else {
        res.sendFile(filePath);
      }
    });
  });
  app.use('/default/:encodedData', (req, res) => {
    const encodedData = req.params.encodedData;
    const svg = decodeUrl(encodedData);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  });
}
