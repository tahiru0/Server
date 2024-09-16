import express from 'express';
import createCrudRouter from '../utils/crudModule.js';
import Student from '../models/Student.js';

const router = express.Router();

router.use('/', createCrudRouter(Student));

export default router;
