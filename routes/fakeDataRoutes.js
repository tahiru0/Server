import express from 'express';
import { faker } from '@faker-js/faker/locale/vi';
import School from '../models/School.js';
import Company from '../models/Company.js';
import Student from '../models/Student.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Major from '../models/Major.js';
import Skill from '../models/Skill.js';
import mongoose from 'mongoose';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const realMajors = [
    'Khoa học Máy tính', 'Quản trị Kinh doanh', 'Kỹ thuật Cơ khí', 
    'Kỹ thuật Điện', 'Kỹ thuật Xây dựng', 'Sinh học', 'Hóa học', 
    'Vật lý', 'Toán học', 'Kinh tế học', 'Tâm lý học', 'Xã hội học', 
    'Khoa học Chính trị', 'Lịch sử', 'Văn học Anh', 'Trí tuệ Nhân tạo',
    'Khoa học Dữ liệu', 'An ninh Mạng', 'Thiết kế Đồ họa', 'Marketing Số',
    'Công nghệ Nano', 'Kỹ thuật Y Sinh', 'Khoa học Môi trường', 'Năng lượng Tái tạo',
    'Quản lý Chuỗi Cung ứng', 'Khoa học Thần kinh', 'Robotics', 'Khoa học Vũ trụ',
    'Công nghệ Thực phẩm', 'Quản lý Dự án'
];

const realSkills = [
    'JavaScript', 'Python', 'Java', 'C++', 'Quản lý Dự án', 
    'Phân tích Dữ liệu', 'Học máy', 'Giao tiếp', 'Làm việc nhóm', 
    'Giải quyết vấn đề', 'Tư duy phản biện', 'Lãnh đạo', 'Quản lý thời gian', 
    'Sáng tạo', 'Thích ứng', 'React', 'Node.js', 'Angular', 'Vue.js',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'Google Cloud', 'DevOps',
    'CI/CD', 'Blockchain', 'IoT', 'AR/VR', 'Cybersecurity', 'UI/UX Design',
    'SEO', 'Content Marketing', 'Data Visualization', 'Big Data',
    'NoSQL', 'GraphQL', 'Agile Methodologies', 'Scrum', 'TensorFlow',
    'Natural Language Processing', 'Computer Vision', 'Ethical Hacking'
];

const createDirectory = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

const downloadImage = async (url, filepath) => {
    const response = await axios({
        url,
        responseType: 'stream',
    });
    return new Promise((resolve, reject) => {
        response.data.pipe(fs.createWriteStream(filepath))
            .on('finish', () => resolve())
            .on('error', e => reject(e));
    });
};

const getRandomSquareImage = (size = 300) => {
    return `https://picsum.photos/${size}`;
};

const getRelatedSkills = (major, skills, numSkills = 3) => {
    const relatedSkills = skills.filter(skill => 
        skill.name.toLowerCase().includes(major.name.toLowerCase()) ||
        major.name.toLowerCase().includes(skill.name.toLowerCase())
    );
    if (relatedSkills.length < numSkills) {
        const additionalSkills = faker.helpers.arrayElements(
            skills.filter(s => !relatedSkills.includes(s)),
            numSkills - relatedSkills.length
        );
        relatedSkills.push(...additionalSkills);
    }
    return faker.helpers.arrayElements(relatedSkills, numSkills);
};

/**
 * @swagger
 * /api/fake-data:
 *   post:
 *     summary: Tạo dữ liệu giả cho hệ thống
 *     description: Tạo dữ liệu giả cho các mô hình Major, Skill, School, Company, Student, Project và Task
 *     tags: [FakeData]
 *     responses:
 *       201:
 *         description: Dữ liệu giả đã được chèn thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dữ liệu giả đã được chèn thành công.
 *       500:
 *         description: Lỗi server khi chèn dữ liệu giả
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xảy ra lỗi khi chèn dữ liệu giả.
 *                 error:
 *                   type: string
 */
router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Tạo dữ liệu giả cho các mô hình khác nhau
    const skills = await createSkills(session);
    const majors = await createMajors(session);
    const schools = await createSchools(session);
    const companies = await createCompanies(session);
    const students = await createStudents(session, schools, majors, skills);
    await createProjects(session, companies, students, majors, skills);

    await session.commitTransaction();
    res.status(200).json({ message: 'Dữ liệu giả đã được tạo thành công' });
  } catch (error) {
    console.error('Lỗi khi tạo dữ liệu giả:', error);
    res.status(500).json({ message: 'Đã xảy ra lỗi khi tạo dữ liệu giả', error: error.message });
  } finally {
    session.endSession();
  }
});

async function createSkills(session) {
  try {
    const skills = await Promise.all(realSkills.map(async (skillName) => {
      let skill = await Skill.findOne({ name: skillName }).session(session);
      if (!skill) {
        skill = new Skill({
          name: skillName,
          description: faker.lorem.sentence()
        });
        await skill.save({ session });
      }
      return skill;
    }));
    return skills;
  } catch (error) {
    console.error('Lỗi khi tạo skills:', error);
    return []; // Trả về mảng rỗng nếu có lỗi
  }
}

async function createMajors(session) {
  try {
    const majors = await Promise.all(realMajors.map(async (majorName) => {
      let major = await Major.findOne({ name: majorName }).session(session);
      if (!major) {
        major = new Major({
          name: majorName,
          description: faker.lorem.sentence()
        });
        await major.save({ session });
      }
      return major;
    }));
    return majors;
  } catch (error) {
    console.error('Lỗi khi tạo majors:', error);
    return []; // Trả về mảng rỗng nếu có lỗi
  }
}

async function createSchools(session) {
  try {
    const schools = await Promise.all(Array(5).fill().map(async () => {
      const school = new School({
        name: faker.company.name() + ' University',
        address: faker.location.streetAddress(),
        isActive: true,
        accounts: [{
          name: faker.person.fullName(),
          email: faker.internet.email(),
          password: '123456',
          role: { name: 'admin' },
          isActive: true
        }]
      });

      // Tải logo hình vuông ngẫu nhiên cho School
      const logoUrl = getRandomSquareImage();
      const logoDir = path.join(__dirname, '..', 'public', 'uploads', 'schools');
      createDirectory(logoDir);
      const logoPath = path.join(logoDir, `${school._id}.jpg`);
      await downloadImage(logoUrl, logoPath);
      school.logo = `/uploads/schools/${school._id}.jpg`;

      await school.save({ session });

      // Tạo thêm các tài khoản phụ cho School
      for (let j = 0; j < 5; j++) {
        school.accounts.push({
          name: faker.person.fullName(),
          email: faker.internet.email(),
          password: '123456',
          role: { name: faker.helpers.arrayElement(['sub-admin', 'department-head', 'faculty-head']) },
          isActive: true
        });
      }
      await school.save({ session });
      return school;
    }));
    return schools;
  } catch (error) {
    console.error('Lỗi khi tạo schools:', error);
    return []; // Trả về mảng rỗng nếu có lỗi
  }
}

async function createCompanies(session) {
  try {
    const companies = await Promise.all(Array(2).fill().map(async () => {
      const company = new Company({
        name: faker.company.name(),
        address: faker.location.streetAddress(),
        isActive: true,
        accounts: [{
          name: faker.person.fullName(),
          email: faker.internet.email(),
          password: '123456',
          role: 'admin',
          isActive: true
        }]
      });

      // Tải logo hình vuông ngẫu nhiên cho Company
      const logoUrl = getRandomSquareImage();
      const logoDir = path.join(__dirname, '..', 'public', 'uploads', 'companies');
      createDirectory(logoDir);
      const logoPath = path.join(logoDir, `${company._id}.jpg`);
      await downloadImage(logoUrl, logoPath);
      company.logo = `/uploads/companies/${company._id}.jpg`;

      await company.save({ session });

      // Tạo thêm các tài khoản mentor cho Company
      for (let j = 0; j < 6; j++) {
        company.accounts.push({
          name: faker.person.fullName(),
          email: faker.internet.email(),
          password: '123456',
          role: 'mentor',
          isActive: true
        });
      }
      await company.save({ session });
      return company;
    }));
    return companies;
  } catch (error) {
    console.error('Lỗi khi tạo companies:', error);
    return []; // Trả về mảng rỗng nếu có lỗi
  }
}

async function createStudents(session, schools, majors, skills) {
  try {
    const students = await Promise.all(Array(100).fill().map(async () => {
      const school = faker.helpers.arrayElement(schools);
      const major = faker.helpers.arrayElement(majors);
      const relatedSkills = getRelatedSkills(major, skills, 5);

      const student = new Student({
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: '123456',
        studentId: faker.string.numeric(10),
        school: school._id,
        isApproved: true,
        isActive: true,
        dateOfBirth: faker.date.birthdate(),
        gender: faker.helpers.arrayElement(['Nam', 'Nữ', 'Khác']),
        phoneNumber: faker.phone.number('09######').replace(/\s+/g, ''), // Loại bỏ dấu cách
        address: faker.location.streetAddress(),
        major: major._id,
        skills: relatedSkills.map(skill => skill._id)
      });
      await student.save({ session });
      return student;
    }));
    return students;
  } catch (error) {
    console.error('Lỗi khi tạo students:', error);
    return []; // Trả về mảng rỗng nếu có lỗi
  }
}

async function createProjects(session, companies, students, majors, skills) {
  try {
    for (const company of companies) {
      for (let i = 0; i < 5; i++) { // Mỗi công ty có 5 project
        try {
          const mentor = faker.helpers.arrayElement(company.accounts.filter(account => account.role === 'mentor'));
          const major = faker.helpers.arrayElement(majors);
          const relatedSkills = getRelatedSkills(major, skills, 5);

          const applicants = [];
          const selectedApplicants = [];
          const usedStudentIds = new Set();

          for (let j = 0; j < 10 && applicants.length < 10; j++) {
            const student = faker.helpers.arrayElement(students.filter(s => 
              s.major.toString() === major._id.toString() || 
              s.skills.some(skill => relatedSkills.map(s => s._id.toString()).includes(skill.toString()))
            ));
            if (student && !usedStudentIds.has(student._id.toString())) {
              applicants.push({ applicantId: student._id, appliedDate: new Date() });
              usedStudentIds.add(student._id.toString());

              if (selectedApplicants.length < 5) {
                selectedApplicants.push({ studentId: student._id, appliedDate: new Date(), acceptedAt: new Date() });
              }
            }
          }

          const project = new Project({
            title: faker.commerce.productName(),
            description: faker.lorem.paragraph(),
            company: company._id,
            mentor: mentor._id,
            applicants: applicants,
            selectedApplicants: selectedApplicants,
            startDate: faker.date.recent(),
            endDate: faker.date.future(),
            status: 'Open',
            requiredSkills: relatedSkills.map(skill => skill._id),
            relatedMajors: [major._id],
            objectives: faker.lorem.sentence(),
            isRecruiting: faker.datatype.boolean() // Thêm trường isRecruiting
          });
          await project.save({ session });

          // Tạo task mới cho mỗi project và gán cho selectedApplicants
          if (selectedApplicants.length > 0) {
            const numTasks = faker.number.int({ min: 1, max: 3 });
            for (let j = 0; j < numTasks; j++) {
              const selectedApplicant = faker.helpers.arrayElement(selectedApplicants);
              if (selectedApplicant && selectedApplicant.studentId) {
                try {
                  const task = new Task({
                    name: faker.lorem.words(5),
                    description: faker.lorem.paragraph(),
                    deadline: faker.date.future(),
                    project: project._id,
                    assignedTo: selectedApplicant.studentId,
                    status: faker.helpers.arrayElement(['Pending', 'In Progress', 'Completed', 'Overdue'])
                  });
                  await task.save({ session });
                } catch (error) {
                  console.error(`Lỗi khi tạo task cho project ${project._id}:`, error.message);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Lỗi khi tạo project cho company ${company._id}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('Lỗi khi tạo projects:', error);
  }
}

export default router;