import express from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project.js';
import Skill from '../models/Skill.js';
import Major from '../models/Major.js';
import Company from '../models/Company.js';
import { handleError } from '../utils/errorHandler.js';
import optionalAuthenticate from '../middlewares/optionalAuthenticate.js';
import Student from '../models/Student.js';

const router = express.Router();

/**
 * @swagger
 * /api/guest/projects:
 *   get:
 *     summary: Lấy danh sách dự án công khai
 *     tags: [Projects]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Từ khóa tìm kiếm
 *       - in: query
 *         name: filters
 *         schema:
 *           type: object
 *           properties:
 *             skills:
 *               type: array
 *               items:
 *                 type: string
 *             status:
 *               type: string
 *             major:
 *               type: string
 *         description: Các bộ lọc tìm kiếm
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số lượng dự án trên mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách dự án và thông tin phân trang
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       companyName:
 *                         type: string
 *                       status:
 *                         type: string
 *                       isRecruiting:
 *                         type: boolean
 *                       maxApplicants:
 *                         type: number
 *                       pinnedProject:
 *                         type: boolean
 *                       relatedMajors:
 *                         type: array
 *                         items:
 *                           type: string
 *                       requiredSkills:
 *                         type: array
 *                         items:
 *                           type: string
 *                       applicationStart:
 *                         type: string
 *                         format: date-time
 *                       applicationEnd:
 *                         type: string
 *                         format: date-time
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 totalProjects:
 *                   type: integer
 *       500:
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get('/projects', optionalAuthenticate(Student, Student.findById), async (req, res) => {
  try {
    const { query, skills, status, major, page = 1, limit = 10 } = req.query;
    let filters = {};

    if (skills) filters.skills = skills.split(',').map(id => new mongoose.Types.ObjectId(id));
    if (status) filters.status = status;
    if (major) filters.major = new mongoose.Types.ObjectId(major);

    const result = await Project.getPublicProjects(query, filters, parseInt(page), parseInt(limit));
    res.json(result);
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/guest/projects/{id}:
 *   get:
 *     summary: Lấy chi tiết dự án công khai
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của dự án
 *     responses:
 *       200:
 *         description: Chi tiết dự án
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 description:
 *                   type: string
 *                 companyName:
 *                   type: string
 *                 status:
 *                   type: string
 *                 isRecruiting:
 *                   type: boolean
 *                 maxApplicants:
 *                   type: number
 *                 applicationStart:
 *                   type: string
 *                   format: date-time
 *                 applicationEnd:
 *                   type: string
 *                   format: date-time
 *                 objectives:
 *                   type: string
 *                 startDate:
 *                   type: string
 *                   format: date-time
 *                 endDate:
 *                   type: string
 *                   format: date-time
 *                 projectStatus:
 *                   type: string
 *                 relatedMajors:
 *                   type: array
 *                   items:
 *                     type: string
 *                 requiredSkills:
 *                   type: array
 *                   items:
 *                     type: string
 *                 skillRequirements:
 *                   type: string
 *       404:
 *         description: Không tìm thấy dự án
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get('/projects/:id', optionalAuthenticate(Student), async (req, res) => {
  try {
    const projectId = req.params.id;
    const studentId = req.user ? req.user._id : null;
    const projectDetails = await Project.getPublicProjectDetails(projectId, studentId);

    if (!projectDetails) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    res.json(projectDetails);
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/guest/skills:
 *   get:
 *     summary: Lấy danh sách kỹ năng
 *     tags: [Skills]
 *     responses:
 *       200:
 *         description: Danh sách kỹ năng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   name:
 *                     type: string
 *       500:
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get('/skills', async (req, res) => {
  try {
    const skills = await Skill.find().select('_id name');
    res.json(skills);
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/guest/majors:
 *   get:
 *     summary: Lấy danh sách ngành học
 *     tags: [Majors]
 *     responses:
 *       200:
 *         description: Danh sách ngành học
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   name:
 *                     type: string
 *       500:
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get('/majors', async (req, res) => {
  try {
    const majors = await Major.find().select('_id name');
    res.json(majors);
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/guest/companies/{id}:
 *   get:
 *     summary: Lấy thông tin công khai của công ty
 *     tags: [Companies]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của công ty
 *     responses:
 *       200:
 *         description: Thông tin công khai của công ty
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 logo:
 *                   type: string
 *                 website:
 *                   type: string
 *                 address:
 *                   type: string
 *                 projects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       title:
 *                         type: string
 *       404:
 *         description: Không tìm thấy công ty
 *       500:
 *         description: Lỗi máy chủ
 */
router.get('/companies/:id', async (req, res) => {
  try {
    const companyId = req.params.id;
    const company = await Company.findById(companyId)
      .select('name description logo website address')
      .lean();

    if (!company) {
      return res.status(404).json({ message: 'Không tìm thấy công ty' });
    }

    // Lấy danh sách dự án công khai của công ty
    const projects = await Project.find({ company: companyId, isPublic: true })
      .select('_id title')
      .lean();

    const publicCompanyInfo = {
      ...company,
      logo: company.logo ? `http://localhost:5000${company.logo}` : null,
      projects
    };

    res.json(publicCompanyInfo);
  } catch (error) {
    handleError(error, res);
  }
});

export default router;
