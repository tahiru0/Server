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
import bcrypt from 'bcryptjs';

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

const realUniversities = [
  {
    name: 'Đại học Quốc gia Thành phố Hồ Chí Minh',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Quoc-Gia-TPHCM-VNUHCMVN-V.png',
    website: 'https://vnuhcm.edu.vn',
    address: 'Phường Linh Trung, Thành phố Thủ Đức, Thành phố Hồ Chí Minh',
    establishedDate: '1995-01-27'
  },
  {
    name: 'Đại học Thái Nguyên',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Cong-Nghe-Thong-Tin-UIT-V.png',
    website: 'https://www.tnu.edu.vn',
    address: 'Phường Tân Thịnh, Thành phố Thái Nguyên, Tỉnh Thái Nguyên',
    establishedDate: '1994-04-04'
  },
  {
    name: 'Đại học Huế',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Cong-Nghe-Thong-Tin-UIT-V.png',
    website: 'https://www.hueuni.edu.vn',
    address: '03 Lê Lợi, Phường Vĩnh Ninh, Thành phố Huế, Tỉnh Thừa Thiên Huế',
    establishedDate: '1957-03-01'
  },
  {
    name: 'Đại học Đà Nẵng',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-Truong-Dai-hoc-Bach-khoa-Dai-hoc-Da-Nang-DUT.png',
    website: 'https://www.udn.vn',
    address: '41 Lê Duẩn, Quận Hải Châu, Thành phố Đà Nẵng',
    establishedDate: '1994-04-04'
  },
  {
    name: 'Đại học Bách khoa Hà Nội',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Bach-Khoa-Ha-Noi-HUST.png',
    website: 'https://www.hust.edu.vn',
    address: 'Số 1 Đại Cồ Việt, Quận Hai Bà Trưng, Hà Nội',
    establishedDate: '1956-03-15'
  },
  {
    name: 'Đại học Kinh tế Thành phố Hồ Chí Minh',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Kinh-Te-TpHCM-UEH.png',
    website: 'https://www.ueh.edu.vn',
    address: '59C Nguyễn Đình Chiểu, Phường 6, Quận 3, Thành phố Hồ Chí Minh',
    establishedDate: '1976-10-27'
  },
  {
    name: 'Đại học Sư phạm Hà Nội',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-Dai-hoc-Su-pham-Ha-Noi-HNUE.png',
    website: 'http://hnue.edu.vn',
    address: '136 Xuân Thuỷ, Quận Cầu Giấy, Hà Nội',
    establishedDate: '1951-10-11'
  },
  {
    name: 'Đại học Y Hà Nội',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-Dai-Hoc-Duoc-Ha-Noi-HUP.png',
    website: 'https://www.hmu.edu.vn',
    address: '1 Tôn Thất Tùng, Quận Đống Đa, Hà Nội',
    establishedDate: '1902-11-14'
  },
  {
    name: 'Đại học Ngoại thương',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Ngoai-Ngu-Tin-Hoc-HUFLIT.png',
    website: 'https://www.ftu.edu.vn',
    address: '91 Chùa Láng, Quận Đống Đa, Hà Nội',
    establishedDate: '1960-11-08'
  },
  {
    name: 'Đại học Nguyễn Tất Thành',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Nguyen-Tat-Thanh.png',
    website: 'https://www.ntt.edu.vn',
    address: '300A Nguyễn Tất Thành, Phường 13, Quận 4, Thành phố Hồ Chí Minh',
    establishedDate: '2007-09-24'
  },
  {
    name: 'Đại học Cần Thơ',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-Dai-Hoc-Can-Tho-CTU.png',
    website: 'https://www.ctu.edu.vn',
    address: 'Khu II, đường 3/2, Phường Xuân Khánh, Quận Ninh Kiều, Thành phố Cần Thơ',
    establishedDate: '1966-03-31'
  },
  {
    name: 'Đại học Kinh tế Quốc dân',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Kinh-Te-Quoc-Dan-NEU.png',
    website: 'https://www.neu.edu.vn',
    address: '207 Giải Phóng, Quận Hai Bà Trưng, Hà Nội',
    establishedDate: '1956-01-25'
  },
  {
    name: 'Đại học Công nghiệp Hà Nội',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Cong-nghiep-Ha-Noi.png',
    website: 'https://www.haui.edu.vn',
    address: 'Số 298 đường Cầu Diễn, Quận Bắc Từ Liêm, Hà Nội',
    establishedDate: '1898-03-15'
  },
  {
    name: 'Đại học Mở Thành phố Hồ Chí Minh',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Mo-TPHCM-OU-H.png',
    website: 'https://ou.edu.vn',
    address: '97 Võ Văn Tần, Phường 6, Quận 3, Thành phố Hồ Chí Minh',
    establishedDate: '1993-06-15'
  },
  {
    name: 'Đại học Tôn Đức Thắng',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Ton-Duc-Thang-TDT.png',
    website: 'https://www.tdtu.edu.vn',
    address: '19 Nguyễn Hữu Thọ, Phường Tân Phong, Quận 7, Thành phố Hồ Chí Minh',
    establishedDate: '1997-09-24'
  },
  {
    name: 'Đại học Sư phạm Kỹ thuật Thành phố Hồ Chí Minh',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Su-Pham-Ky-Thuat-TP-Ho-Chi-Minh-HCMUTE.png',
    website: 'https://hcmute.edu.vn',
    address: '1 Võ Văn Ngân, Phường Linh Chiểu, Thành phố Thủ Đức, Thành phố Hồ Chí Minh',
    establishedDate: '1962-10-05'
  },
  {
    name: 'Đại học Công nghệ Thông tin (ĐH Quốc gia TP.HCM)',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Cong-Nghe-Thong-Tin-UIT-V.png',
    website: 'https://www.uit.edu.vn',
    address: 'Khu phố 6, Phường Linh Trung, Thành phố Thủ Đức, Thành phố Hồ Chí Minh',
    establishedDate: '2006-02-27'
  },
  {
    name: 'Đại học Văn Lang',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Van-Lang-H.png',
    website: 'https://www.vanlanguni.edu.vn',
    address: '45 Nguyễn Khắc Nhu, Phường Cô Giang, Quận 1, Thành phố Hồ Chí Minh',
    establishedDate: '1995-03-10'
  },
  {
    name: 'Đại học Hoa Sen',
    logo: 'http://localhost:5000/uploads/logos/school/Logo-DH-Hoa-Sen-VN.png',
    website: 'https://www.hoasen.edu.vn',
    address: '8 Nguyễn Văn Tráng, Phường Bến Thành, Quận 1, Thành phố Hồ Chí Minh',
    establishedDate: '1991-05-26'
  }
];

function generateLogoUrl(id) {
  const style = 'icons'; // Hoặc 'jdenticon' cho kiểu logo khác
  return `https://api.dicebear.com/6.x/${style}/svg?seed=${id}`;
}
function generateAvatarUrl() {
  const style = faker.helpers.arrayElement(['adventurer', 'avataaars', 'big-ears', 'bottts', 'croodles', 'fun-emoji', 'icons', 'identicon', 'initials', 'lorelei', 'micah', 'miniavs', 'open-peeps', 'personas', 'pixel-art']);
  const seed = faker.string.alphanumeric(10);
  return `https://api.dicebear.com/6.x/${style}/svg?seed=${seed}`;
}

/**
 * @swagger
 * /api/fake-data/create-skills:
 *   post:
 *     summary: Tạo kỹ năng ngẫu nhiên
 *     description: Tạo các kỹ năng ngẫu nhiên
 *     tags: [Fake-Data]
 *     responses:
 *       200:
 *         description: Kỹ năng ngẫu nhiên đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Kỹ năng ngẫu nhiên đã được tạo thành công.
 *       500:
 *         description: Đã xảy ra lỗi khi tạo kỹ năng ngẫu nhiên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xảy ra lỗi khi tạo kỹ năng ngẫu nhiên.
 *                 error:
 *                   type: string
 */
router.post('/create-skills', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existingSkills = await Skill.find({}, 'name');
    const existingSkillNames = new Set(existingSkills.map(skill => skill.name));
    const createdSkills = new Set();

    while (createdSkills.size < 10) {
      const skillName = faker.helpers.arrayElement(realSkills);
      if (!existingSkillNames.has(skillName) && !createdSkills.has(skillName)) {
        const skill = new Skill({
          name: skillName,
          description: faker.lorem.sentence(),
        });

        await skill.save({ session });
        createdSkills.add(skillName);
      }
    }

    await session.commitTransaction();
    res.status(200).json({ message: 'Kỹ năng thực tế đã được tạo thành công' });
  } catch (error) {
    console.error('Lỗi khi tạo kỹ năng thực tế:', error);
    await session.abortTransaction();
    res.status(500).json({ message: 'Đã xảy ra lỗi khi tạo kỹ năng thực tế', error: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * @swagger
 * /api/fake-data/create-majors:
 *   post:
 *     summary: Tạo ngành học ngẫu nhiên
 *     description: Tạo các ngành học ngẫu nhiên
 *     tags: [Fake-Data]
 *     responses:
 *       200:
 *         description: Ngành học ngẫu nhiên đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ngành học ngẫu nhiên đã được tạo thành công.
 *       500:
 *         description: Đã xảy ra lỗi khi tạo ngành học ngẫu nhiên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xảy ra lỗi khi tạo ngành học ngẫu nhiên.
 *                 error:
 *                   type: string
 */
router.post('/create-majors', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existingMajors = await Major.find({}, 'name');
    const existingMajorNames = new Set(existingMajors.map(major => major.name));
    const createdMajors = new Set();

    while (createdMajors.size < 10) {
      const majorName = faker.helpers.arrayElement(realMajors);
      if (!existingMajorNames.has(majorName) && !createdMajors.has(majorName)) {
        const major = new Major({
          name: majorName,
          description: faker.lorem.sentence(),
        });

        await major.save({ session });
        createdMajors.add(majorName);
      }
    }

    await session.commitTransaction();
    res.status(200).json({ message: 'Ngành học ngẫu nhiên đã được tạo thành công' });
  } catch (error) {
    console.error('Lỗi khi tạo ngành học ngẫu nhiên:', error);
    await session.abortTransaction();
    res.status(500).json({ message: 'Đã xảy ra lỗi khi tạo ngành học ngẫu nhiên', error: error.message });
  } finally {
    session.endSession();
  }
});
/**
 * @swagger
 * /api/fake-data/create-companies:
 *   post:
 *     summary: Tạo công ty ngẫu nhiên
 *     description: Tạo 5 công ty với 1 tài khoản admin và 5 tài khoản mentor cho mỗi công ty
 *     tags: [Fake-Data]
 *     responses:
 *       200:
 *         description: Công ty ngẫu nhiên đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Công ty ngẫu nhiên đã được tạo thành công.
 *       500:
 *         description: Đã xảy ra lỗi khi tạo công ty ngẫu nhiên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xảy ra lỗi khi tạo công ty ngẫu nhiên.
 *                 error:
 *                   type: string
 */
router.post('/create-companies', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (let i = 0; i < 6; i++) {
      const company = new Company({
        name: faker.company.name(),
        email: faker.internet.email(),
        address: faker.location.streetAddress(),
        logo: generateLogoUrl(faker.string.uuid()),
        isActive: faker.datatype.boolean(),
        accounts: [
          {
            name: faker.name.fullName(),
            email: faker.internet.email(),
            password: '123456',
            role: 'admin',
            avatar: generateAvatarUrl(),
          },
          ...Array.from({ length: 5 }).map(() => ({
            name: faker.name.fullName(),
            email: faker.internet.email(),
            password: '123456',
            role: 'mentor',
            avatar: generateAvatarUrl(),
          })),
        ],
      });

      await company.save({ session });
    }

    await session.commitTransaction();
    res.status(200).json({ message: 'Công ty ngẫu nhiên đã được tạo thành công' });
  } catch (error) {
    console.error('Lỗi khi tạo công ty ngẫu nhiên:', error);
    await session.abortTransaction();
    res.status(500).json({ message: 'Đã xảy ra lỗi khi tạo công ty ngẫu nhiên', error: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * @swagger
 * /api/fake-data/create-schools:
 *   post:
 *     summary: Tạo trường học thật
 *     description: Tạo các trường đại học thật với logo thật, 1 tài khoản admin và 5 tài khoản với vai trò khoa ngành cho mỗi trường
 *     tags: [Fake-Data]
 *     responses:
 *       200:
 *         description: Trường học đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Trường học đã được tạo thành công.
 *       500:
 *         description: Đã xảy ra lỗi khi tạo trường học
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xảy ra lỗi khi tạo trường học.
 *                 error:
 *                   type: string
 */
router.post('/create-schools', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const university of realUniversities) {
      const school = new School({
        name: university.name,
        address: university.address,
        website: university.website,
        establishedDate: new Date(university.establishedDate),
        logo: university.logo,
        isActive: true,
        accounts: [
          {
            name: faker.person.fullName(),
            email: `admin@${new URL(university.website).hostname}`,
            password: '123456',
            role: { name: 'admin' },
            avatar: generateAvatarUrl(),
          },
          ...Array.from({ length: 5 }).map(() => ({
            name: faker.person.fullName(),
            email: faker.internet.email(),
            password: '123456',
            role: {
              name: faker.helpers.arrayElement(['department-head', 'faculty-head']),
              department: faker.commerce.department()
            },
            avatar: generateAvatarUrl(),
          })),
        ],
      });

      for (const account of school.accounts) {
        account.passwordHash = await bcrypt.hash(account.password, 12);
      }

      await school.save({ session });
    }

    await session.commitTransaction();
    res.status(200).json({ message: 'Trường học đã được tạo thành công' });
  } catch (error) {
    console.error('Lỗi khi tạo trường học:', error);
    await session.abortTransaction();
    res.status(500).json({ message: 'Đã xảy ra lỗi khi tạo trường học', error: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * @swagger
 * /api/fake-data/create-students:
 *   post:
 *     summary: Tạo sinh viên ngẫu nhiên
 *     description: Tạo các sinh viên ngẫu nhiên
 *     tags: [Fake-Data]
 *     responses:
 *       200:
 *         description: Sinh viên ngẫu nhiên đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Sinh viên ngẫu nhiên đã được tạo thành công.
 *       500:
 *         description: Đã xảy ra lỗi khi tạo sinh viên ngẫu nhiên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xảy ra lỗi khi tạo sinh viên ngẫu nhiên.
 *                 error:
 *                   type: string
 */
router.post('/create-students', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const schools = await School.find({ isActive: true }).session(session);
    const majors = await Major.find().session(session);
    const skills = await Skill.find().session(session);

    for (let i = 0; i < 100; i++) {
      const school = faker.helpers.arrayElement(schools);
      const major = faker.helpers.arrayElement(majors);
      const studentSkills = faker.helpers.arrayElements(skills, faker.number.int({ min: 1, max: 5 }));

      const student = new Student({
        name: faker.name.fullName(),
        email: faker.internet.email(),
        password: '123456',
        studentId: faker.number.int({ min: 1000000000, max: 9999999999 }).toString(),
        school: school._id,
        major: major._id,
        skills: studentSkills.map(skill => skill._id),
        dateOfBirth: faker.date.past(20, new Date(2003, 0, 1)),
        gender: faker.helpers.arrayElement(['Nam', 'Nữ', 'Khác']),
        phoneNumber: faker.phone.number('0#########').replace(/\s+/g, ''),
        address: faker.location.streetAddress(),
        isApproved: faker.datatype.boolean(),
        avatar: generateAvatarUrl(),
      });

      student.passwordHash = await bcrypt.hash(student.password, 12);
      await student.save({ session });
    }

    await session.commitTransaction();
    res.status(200).json({ message: 'Sinh viên ngẫu nhiên đã được tạo thành công' });
  } catch (error) {
    console.error('Lỗi khi tạo sinh viên ngẫu nhiên:', error);
    await session.abortTransaction();
    res.status(500).json({ message: 'Đã xảy ra lỗi khi tạo sinh viên ngẫu nhiên', error: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * @swagger
 * /api/fake-data/create-random-projects:
 *   post:
 *     summary: Tạo dự án ngẫu nhiên
 *     description: Tạo các dự án ngẫu nhiên cho các công ty với các mentor và sinh viên được chọn ngẫu nhiên
 *     tags: [Fake-Data]
 *     responses:
 *       200:
 *         description: Dự án ngẫu nhiên đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dự án ngẫu nhiên đã được tạo thành công.
 *       500:
 *         description: Đã xảy ra lỗi khi tạo dự án ngẫu nhiên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xảy ra lỗi khi tạo dự án ngẫu nhiên.
 *                 error:
 *                   type: string
 */
router.post('/create-random-projects', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const companies = await Company.find({ isActive: true }).session(session);
    const students = await Student.find().session(session);
    const majors = await Major.find().session(session);
    const skills = await Skill.find().session(session);

    for (let i = 0; i < 100; i++) {
      const company = faker.helpers.arrayElement(companies);
      const mentors = company.accounts.filter(account => account.role === 'mentor' && account.isActive);
      if (mentors.length === 0) continue; // Bỏ qua nếu công ty không có mentor

      const mentor = faker.helpers.arrayElement(mentors);
      const major = faker.helpers.arrayElement(majors);
      let relatedSkills = skills.filter(skill => skill.major && skill.major.toString() === major._id.toString());

      // Nếu không có kỹ năng liên quan, sử dụng tất cả các kỹ năng
      if (relatedSkills.length === 0) {
        relatedSkills = skills;
      }

      const isRecruiting = faker.datatype.boolean();
      const applicants = [];
      const selectedApplicants = [];
      const usedStudentIds = new Set();

      const applicationStart = isRecruiting ? new Date() : undefined;

      let applicationEnd;
      if (isRecruiting) {
        const oneWeekLater = new Date(applicationStart);
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);

        const twoMonthsLater = new Date(applicationStart);
        twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);

        applicationEnd = faker.date.between({ from: oneWeekLater, to: twoMonthsLater });
      } else {
        applicationEnd = undefined;
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
        requiredSkills: faker.helpers.arrayElements(relatedSkills, { min: 1, max: 5 }).map(skill => skill._id),
        relatedMajors: [major._id],
        objectives: faker.lorem.sentence(10),
        isRecruiting: isRecruiting,
        maxApplicants: isRecruiting ? faker.number.int({ min: 1, max: 10 }) : undefined,
        applicationStart: applicationStart,
        applicationEnd: applicationEnd
      });

      if (isRecruiting) {
        // Lấy ngẫu nhiên 0-5 sinh viên từ DB và thêm vào applicants
        const numApplicants = faker.number.int({ min: 0, max: 5 });
        for (let j = 0; j < numApplicants; j++) {
          const student = faker.helpers.arrayElement(students);
          if (student && !usedStudentIds.has(student._id.toString())) {
            applicants.push({ applicantId: student._id, appliedDate: new Date() });
            usedStudentIds.add(student._id.toString());
          }
        }
      }

      // Lấy ngẫu nhiên 0-5 sinh viên từ DB và thêm vào selectedApplicants
      const numSelectedApplicants = faker.number.int({ min: 0, max: 5 });
      for (let j = 0; j < numSelectedApplicants; j++) {
        const student = faker.helpers.arrayElement(students);
        const isAlreadyApplicant = applicants.some(applicant => applicant.applicantId.toString() === student._id.toString());
        const isAlreadySelected = await Project.findOne({
          'selectedApplicants.studentId': student._id,
          company: { $ne: company._id }
        });

        if (student && !usedStudentIds.has(student._id.toString()) && !isAlreadyApplicant && !isAlreadySelected) {
          if (selectedApplicants.length < project.maxApplicants) {
            selectedApplicants.push({ studentId: student._id, appliedDate: new Date(), acceptedAt: new Date() });
            usedStudentIds.add(student._id.toString());
            student.currentProject = project._id;
            await student.save({ session });
          } else {
            break; // Dừng vòng lặp nếu đã đạt đến số lượng ứng viên tối đa
          }
        }
      }
      project.applicants = applicants;
      project.selectedApplicants = selectedApplicants;

      await project.save({ session });
    }

    await session.commitTransaction();
    res.status(200).json({ message: 'Dự án ngẫu nhiên đã được tạo thành công' });
  } catch (error) {
    console.error('Lỗi khi tạo dự án ngẫu nhiên:', error);
    await session.abortTransaction();
    res.status(500).json({ message: 'Đã xảy ra lỗi khi tạo dự án ngẫu nhiên', error: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * @swagger
 * /api/fake-data/create-tasks:
 *   post:
 *     summary: Tạo công việc ngẫu nhiên
 *     description: Tạo các công việc ngẫu nhiên cho các sinh viên (selectedApplicants) trong các dự án
 *     tags: [Fake-Data]
 *     responses:
 *       200:
 *         description: Công việc ngẫu nhiên đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Công việc ngẫu nhiên đã được tạo thành công.
 *       500:
 *         description: Đã xảy ra lỗi khi tạo công việc ngẫu nhiên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xảy ra lỗi khi tạo công việc ngẫu nhiên.
 *                 error:
 *                   type: string
 */
router.post('/create-tasks', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const projects = await Project.find().populate('selectedApplicants.studentId').session(session);

    let totalTasks = 100;
    while (totalTasks > 0) {
      for (const project of projects) {
        if (project.selectedApplicants.length === 0) {
          continue; // Bỏ qua nếu không có selectedApplicants
        }

        const selectedApplicant = faker.helpers.arrayElement(project.selectedApplicants);

        const task = new Task({
          name: faker.hacker.verb() + ' ' + faker.hacker.noun(),
          description: faker.hacker.phrase(),
          deadline: faker.date.soon(7),
          status: faker.helpers.arrayElement(['Pending', 'In Progress', 'Completed', 'Overdue']),
          project: project._id,
          assignedTo: selectedApplicant.studentId._id,
        });

        await task.save({ session });
        totalTasks--;

        if (totalTasks <= 0) {
          break;
        }
      }
    }

    await session.commitTransaction();
    res.status(200).json({ message: 'Công việc ngẫu nhiên đã được tạo thành công' });
  } catch (error) {
    console.error('Lỗi khi tạo công việc ngẫu nhiên:', error);
    await session.abortTransaction();
    res.status(500).json({ message: 'Đã xảy ra lỗi khi tạo công việc ngẫu nhiên', error: error.message });
  } finally {
    session.endSession();
  }
});

export default router;