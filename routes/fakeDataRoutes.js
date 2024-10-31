import express from 'express';
import School from '../models/School.js';
import { faker } from '@faker-js/faker/locale/vi';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Company from '../models/Company.js';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

const industries = [
    'Công nghệ thông tin',
    'Tài chính - Ngân hàng',
    'Giáo dục & Đào tạo',
    'Bất động sản',
    'Sản xuất & Chế tạo',
    'Thương mại điện tử',
    'Logistics & Vận tải',
    'Viễn thông',
    'Xây dựng',
    'Du lịch & Khách sạn'
];

const avatarStyles = [
    'adventurer', 'adventurer-neutral', 'avataaars', 'big-ears',
    'big-ears-neutral', 'big-smile', 'bottts', 'croodles',
    'fun-emoji', 'icons', 'identicon', 'initials', 'lorelei',
    'micah', 'miniavs', 'personas'
];

const logoStyles = [
    'identicon',    // Mẫu hình học
    'bottts',       // Robot icons
    'pixel-art',    // Pixel art
    'initials'      // Chữ cái đầu
];

const generateRandomString = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Hàm tạo avatar từ dicebear API
const generateAvatar = async (seed, style = null) => {
    try {
        const randomStyle = style || avatarStyles[Math.floor(Math.random() * avatarStyles.length)];
        return `https://api.dicebear.com/6.x/${randomStyle}/svg?seed=${encodeURIComponent(seed)}`;
    } catch (error) {
        console.error('Lỗi khi tạo avatar:', error);
        return null;
    }
};

const generateVietnameseAddress = async () => {
    try {
        const response = await axios.get('https://www.bestrandoms.com/random-address-in-vn');
        const addressHtml = response.data;
        // Trích xuất địa chỉ từ HTML response
        const addressMatch = addressHtml.match(/<div class="content">(.*?)<\/div>/);
        return addressMatch ? addressMatch[1].trim() : faker.location.streetAddress(true);
    } catch (error) {
        console.error('Lỗi khi lấy địa chỉ:', error);
        return faker.location.streetAddress(true);
    }
};

const generateLogo = async () => {
    try {
        const randomStyle = logoStyles[Math.floor(Math.random() * logoStyles.length)];
        const randomSeed = generateRandomString();
        return `https://api.dicebear.com/6.x/${randomStyle}/svg?seed=${randomSeed}`;
    } catch (error) {
        console.error('Lỗi khi tạo logo:', error);
        return null;
    }
};

const removeVietnameseTones = (str) => {
    str = str.toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/\s+/g, ''); // Xóa khoảng trắng
    str = str.replace(/[^a-z0-9]/g, ''); // Chỉ giữ lại chữ và số
    return str;
};

const generateSchoolEmail = (fullName, symbol) => {
    // Tách tên thành các phần
    const nameParts = fullName.split(' ');
    const lastName = removeVietnameseTones(nameParts[nameParts.length - 1]).toLowerCase();
    const otherNames = nameParts.slice(0, -1).map(part => 
        removeVietnameseTones(part).toLowerCase().charAt(0)
    ).join('');
    
    // Tạo email format: nguyenvana@vnu-hn.edu.vn
    return `${lastName}${otherNames}@${symbol.toLowerCase()}.edu.vn`;
};

// Route để tạo dữ liệu giả cho Company
router.get('/generate-companies', async (req, res) => {
    try {
        const fakeCompanies = [];
        const numberOfCompanies = faker.number.int({ min: 5, max: 10 });

        for (let i = 0; i < numberOfCompanies; i++) {
            const companyId = {
                $oid: new mongoose.Types.ObjectId().toString()
            };
            const accounts = [];
            
            // Tạo 1 admin account
            accounts.push({
                _id: {
                    $oid: new mongoose.Types.ObjectId().toString()
                },
                name: faker.person.fullName(),
                email: faker.internet.email(),
                passwordHash: await bcrypt.hash('123456', 10),
                role: 'admin',
                isActive: true,
                avatar: await generateAvatar(faker.person.firstName()),
                projects: []
            });

            // Tạo 5-10 mentor accounts
            const numberOfMentors = faker.number.int({ min: 5, max: 10 });
            for (let j = 0; j < numberOfMentors; j++) {
                accounts.push({
                    _id: {
                        $oid: new mongoose.Types.ObjectId().toString()
                    },
                    name: faker.person.fullName(),
                    email: faker.internet.email(),
                    passwordHash: await bcrypt.hash('123456', 10),
                    role: 'mentor',
                    isActive: true,
                    avatar: await generateAvatar(faker.person.firstName()),
                    projects: []
                });
            }

            const company = {
                _id: companyId,
                name: faker.company.name(),
                email: faker.internet.email(),
                description: faker.company.catchPhrase(),
                website: faker.internet.url(),
                address: await generateVietnameseAddress(),
                logo: await generateLogo(),
                accounts: accounts,
                isActive: true,
                isDeleted: false,
                industry: industries[Math.floor(Math.random() * industries.length)],
                foundedYear: faker.number.int({ min: 1990, max: new Date().getFullYear() }),
                employeeCount: faker.number.int({ min: 50, max: 1000 }),
                socialMedia: {
                    facebook: `https://facebook.com/${faker.internet.userName()}`,
                    linkedin: `https://linkedin.com/company/${faker.internet.userName()}`,
                    twitter: `https://twitter.com/${faker.internet.userName()}`
                },
                createdAt: {
                    $date: new Date().toISOString()
                },
                updatedAt: {
                    $date: new Date().toISOString()
                }
            };

            fakeCompanies.push(company);
        }

        await fs.writeFile(
            path.join(process.cwd(), 'data', 'companies.json'),
            JSON.stringify(fakeCompanies, null, 2),
            'utf8'
        );

        res.json({
            success: true,
            message: 'Đã tạo và lưu dữ liệu giả thành công',
            data: fakeCompanies
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo dữ liệu giả',
            error: error.message
        });
    }
});

// Đọc và parse majors data với ID
const getMajorsWithIds = async () => {
    const majorsData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'major.json'), 'utf8'));
    // Kiểm tra xem dữ liệu có đúng định dạng không
    const majors = Array.isArray(majorsData) ? majorsData : (majorsData.majors || []);
    
    return majors.map(major => ({
        ...major,
        _id: major._id?.$oid || new mongoose.Types.ObjectId().toString()
    }));
};

const getMajorsForFaculty = (facultyName, allMajors) => {
    const majorMap = {
        'Khoa Công nghệ Thông tin': ['Công nghệ Thông tin', 'Kỹ thuật Phần mềm', 'Khoa học Máy tính', 'An toàn Thông tin'],
        'Khoa Kinh tế': ['Quản trị Kinh doanh', 'Marketing', 'Tài chính Ngân hàng', 'Kế toán'],
        'Khoa Quản trị': ['Quản trị Kinh doanh', 'Marketing'],
        'Khoa Quản trị Kinh doanh': ['Quản trị Kinh doanh', 'Marketing'],
        'Khoa Tài chính': ['Tài chính Ngân hàng', 'Kế toán'],
        'Khoa Marketing': ['Marketing', 'Quản trị Kinh doanh'],
        'Khoa Kế toán': ['Kế toán', 'Tài chính Ngân hàng'],
        'Khoa Kiến trúc - Xây dựng': ['Kiến trúc', 'Kỹ thuật Xây dựng'],
        'Khoa Y': ['Y đa khoa'],
        'Khoa Dược': ['Dược học'],
        'Khoa Du lịch và Việt Nam học': ['Du lịch', 'Việt Nam học'],
        'Khoa Ngoại ngữ': ['Ngôn ngữ Anh', 'Ngôn ngữ Nhật'],
        'Khoa Điện - Điện tử': ['Kỹ thuật Điện', 'Kỹ thuật Điện tử'],
        'Khoa Điện tử Viễn thông': ['Kỹ thuật Điện tử'],
        'Khoa Điện tử - Viễn thông': ['Kỹ thuật Điện tử'],
        'Khoa Cơ khí': ['Công nghệ Kỹ thuật Ô tô', 'Kỹ thuật Cơ khí']
    };

    const facultyMajors = majorMap[facultyName] || [];
    if (facultyMajors.length === 0) {
        console.warn(`Warning: No majors defined for faculty: ${facultyName}`);
    }
    return allMajors.filter(major => facultyMajors.includes(major.name));
};

router.get('/school', async (req, res) => {
    try {
        const allMajors = await getMajorsWithIds();
        const rawSchoolsData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'schools.json'), 'utf8'));
        
        // Đảm bảo schoolsData là một mảng
        const schools = Array.isArray(rawSchoolsData) ? rawSchoolsData : 
                       (rawSchoolsData.schools || []);

        const processedSchools = [];

        for (let school of schools) {
            const accounts = [];
            
            // Tạo admin account
            const adminName = faker.person.fullName();
            accounts.push({
                _id: {
                    $oid: new mongoose.Types.ObjectId().toString()
                },
                name: adminName,
                email: generateSchoolEmail(adminName, school.symbol),
                passwordHash: await bcrypt.hash('123456', 10),
                role: {
                    name: 'admin'
                },
                isActive: true,
                avatar: await generateAvatar(faker.person.firstName(), 'initials')
            });

            if (school.faculties) {
                school.faculties = school.faculties.map(faculty => {
                    const facultyMajors = getMajorsForFaculty(faculty.name, allMajors);
                    const facultyId = new mongoose.Types.ObjectId().toString();
                    
                    return {
                        ...faculty,
                        _id: {
                            $oid: facultyId
                        },
                        majors: facultyMajors.map(m => ({
                            $oid: m._id
                        }))
                    };
                });

                // Xử lý faculty accounts
                for (let faculty of school.faculties) {
                    const facultyHeadId = new mongoose.Types.ObjectId();
                    const headName = faker.person.fullName();
                    accounts.push({
                        _id: facultyHeadId,
                        name: headName,
                        email: generateSchoolEmail(headName, school.symbol),
                        passwordHash: await bcrypt.hash('123456', 10),
                        role: {
                            name: 'faculty-head',
                            faculty: faculty._id
                        },
                        isActive: true,
                        avatar: await generateAvatar(faker.person.firstName(), 'initials')
                    });
                    faculty.facultyHead = facultyHeadId;

                    const numStaff = faker.number.int({ min: 2, max: 3 });
                    for (let i = 0; i < numStaff; i++) {
                        const staffName = faker.person.fullName();
                        accounts.push({
                            _id: new mongoose.Types.ObjectId(),
                            name: staffName,
                            email: generateSchoolEmail(staffName, school.symbol),
                            passwordHash: await bcrypt.hash('123456', 10),
                            role: {
                                name: 'faculty-staff',
                                faculty: faculty._id
                            },
                            isActive: true,
                            avatar: await generateAvatar(faker.person.firstName(), 'initials')
                        });
                    }
                }
            }

            processedSchools.push({
                ...school,
                _id: {
                    $oid: new mongoose.Types.ObjectId().toString()
                },
                accounts: accounts,
                createdAt: {
                    $date: new Date().toISOString()
                },
                updatedAt: {
                    $date: new Date().toISOString()
                }
            });
        }

        // Lưu dữ liệu đã xử lý
        await fs.writeFile(
            path.join(process.cwd(), 'data', 'schools.json'),
            JSON.stringify(processedSchools, null, 2),
            'utf8'
        );

        res.json({
            success: true,
            message: 'Đã gán tài khoản và ngành học cho các trường thành công',
            data: processedSchools
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gán tài khoản và ngành học cho trường',
            error: error.message
        });
    }
});

// Hàm mapping major với skills
const getMajorSkills = (majorName) => {
    const skillMap = {
        'Công nghệ Thông tin': ['JavaScript', 'Python', 'Java', 'React', 'Node.js', 'MongoDB', 'Git'],
        'Kỹ thuật Phần mềm': ['JavaScript', 'TypeScript', 'React', 'Angular', 'Vue.js', 'Git', 'Agile'],
        'Khoa học Máy tính': ['Python', 'Machine Learning', 'Data Analysis', 'TypeScript', 'AWS'],
        'An toàn Thông tin': ['Python', 'AWS', 'Docker', 'Kubernetes', 'DevOps'],
        'Quản trị Kinh doanh': ['Digital Marketing', 'Market Research', 'Data Analysis'],
        'Marketing': ['Digital Marketing', 'Market Research', 'UI/UX Design'],
        'Tài chính Ngân hàng': ['Financial Analysis', 'Risk Management', 'Data Analysis'],
        'Kế toán': ['Financial Analysis', 'Data Analysis'],
        'Kiến trúc': ['AutoCAD', '3D Modeling', 'UI/UX Design'],
        'Kỹ thuật Xây dựng': ['AutoCAD', '3D Modeling'],
        'Y đa khoa': ['Clinical Skills', 'Patient Care'],
        'Dược học': ['Pharmaceutical Analysis', 'Drug Development'],
        'Ngôn ngữ Anh': ['Translation', 'IELTS Teaching'],
        'Ngôn ngữ Nhật': ['Translation'],
        'Du lịch': ['Tourism Planning', 'Hotel Management'],
        'Kỹ thuật Điện': ['Circuit Design', 'Power Systems'],
        'Kỹ thuật Điện tử': ['Circuit Design', 'Python', 'Machine Learning']
    };
    return skillMap[majorName] || [];
};

// Hàm lấy ngẫu nhiên n phần tử từ mảng
const getRandomElements = (array, n) => {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n);
};

router.get('/student', async (req, res) => {
    try {
        const rawSchoolsData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'schools.json'), 'utf8'));
        const skillsData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'skills.json'), 'utf8'));
        const majorData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'major.json'), 'utf8'));
        const fakeStudents = [];

        // Đảm bảo schoolsData là một mảng
        const schools = Array.isArray(rawSchoolsData) ? rawSchoolsData : 
                       (rawSchoolsData.schools || []);

        for (const school of schools) {
            // Kiểm tra và đảm bảo faculties tồn tại
            if (!school.faculties || !Array.isArray(school.faculties)) {
                console.warn(`Warning: School ${school.name} has no faculties`);
                continue;
            }

            // Lọc ra các faculty có majors
            const validFaculties = school.faculties.filter(faculty => 
                faculty && faculty.majors && Array.isArray(faculty.majors) && faculty.majors.length > 0
            );

            if (validFaculties.length === 0) {
                console.warn(`Warning: No valid faculties found for school ${school.name}`);
                continue;
            }

            // Tạo 5 sinh viên cho mỗi trường
            for (let i = 0; i < 5; i++) {
                const randomFaculty = validFaculties[Math.floor(Math.random() * validFaculties.length)];
                const randomMajorId = randomFaculty.majors[Math.floor(Math.random() * randomFaculty.majors.length)];
                
                // Tìm thông tin major từ majorData (đã là mảng)
                const major = majorData.find(m => m._id.$oid === randomMajorId.$oid);
                if (!major) {
                    console.warn(`Warning: Major not found for ID ${randomMajorId.$oid}`);
                    continue;
                }

                // Lấy skills phù hợp với major
                const majorSkillNames = getMajorSkills(major.name);
                const availableSkills = skillsData.filter(skill => 
                    majorSkillNames.includes(skill.name)
                );

                if (availableSkills.length === 0) {
                    console.warn(`Warning: No skills found for major ${major.name}`);
                    continue;
                }

                // Chọn ngẫu nhiên 2-4 skills
                const numSkills = Math.floor(Math.random() * 3) + 2;
                const selectedSkills = getRandomElements(availableSkills, numSkills);

                const studentName = faker.person.fullName();
                const student = {
                    _id: {
                        $oid: new mongoose.Types.ObjectId().toString()
                    },
                    name: studentName,
                    email: generateSchoolEmail(studentName, school.symbol),
                    passwordHash: await bcrypt.hash('123456', 10),
                    studentId: generateStudentId(school.symbol),
                    school: {
                        $oid: school._id.$oid
                    },
                    major: {
                        $oid: major._id.$oid
                    },
                    faculty: {
                        $oid: randomFaculty._id.$oid
                    },
                    skills: selectedSkills.map(skill => ({
                        $oid: skill._id.$oid
                    })),
                    isApproved: false,
                    isDeleted: false,
                    avatar: await generateAvatar(studentName, 'initials'),
                    phoneNumber: generateVietnamesePhoneNumber(),
                    address: await generateVietnameseAddress(),
                    createdAt: {
                        $date: new Date().toISOString()
                    },
                    updatedAt: {
                        $date: new Date().toISOString()
                    }
                };

                fakeStudents.push(student);
            }
        }

        await fs.writeFile(
            path.join(process.cwd(), 'data', 'students.json'),
            JSON.stringify(fakeStudents, null, 2),
            'utf8'
        );

        res.json({
            success: true,
            message: 'Đã tạo dữ liệu sinh viên giả thành công',
            data: fakeStudents
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo dữ liệu sinh viên giả',
            error: error.message
        });
    }
});

// Hàm tạo mã số sinh viên
const generateStudentId = (schoolSymbol) => {
    const year = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${schoolSymbol}${year}${random}`;
};

// Hàm tạo số điện thoại Việt Nam
const generateVietnamesePhoneNumber = () => {
    const prefixes = ['032', '033', '034', '035', '036', '037', '038', '039', '070', '079', '077', '076', '078', '083', '084', '085', '081', '082'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
    return `${prefix}${suffix}`;
};

router.get('/project', async (req, res) => {
    try {
        const companiesData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'companies.json'), 'utf8'));
        const fakeProjects = [];
        
        // Lấy danh sách mentor từ tất cả các công ty
        const mentors = companiesData.companies.reduce((acc, company) => {
            const companyMentors = company.accounts.filter(acc => acc.role === 'mentor')
                .map(mentor => ({...mentor, companyId: company._id, companyName: company.name}));
            return [...acc, ...companyMentors];
        }, []);

        // Tạo ngày bắt đầu từ hôm qua
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // Tạo 5 project cho mỗi mentor
        for (const mentor of mentors) {
            for (let i = 0; i < 5; i++) {
                const isRecruiting = faker.datatype.boolean();
                const applicationStart = isRecruiting ? yesterday : null;
                const applicationEnd = isRecruiting ? new Date(yesterday.getTime() + (i + 1) * 24 * 60 * 60 * 1000) : null;

                const project = {
                    _id: {
                        $oid: new mongoose.Types.ObjectId().toString()
                    },
                    title: faker.company.catchPhrase(),
                    description: faker.lorem.paragraphs(2),
                    company: {
                        $oid: mentor.companyId
                    },
                    mentor: {
                        $oid: mentor._id
                    },
                    status: 'Open',
                    isRecruiting,
                    maxApplicants: isRecruiting ? faker.number.int({ min: 5, max: 20 }) : null,
                    applicationStart: isRecruiting ? {
                        $date: applicationStart.toISOString()
                    } : null,
                    applicationEnd: isRecruiting ? {
                        $date: applicationEnd.toISOString()
                    } : null,
                    applicants: [],
                    selectedApplicants: [],
                    objectives: faker.lorem.paragraph(),
                    startDate: {
                        $date: faker.date.future().toISOString()
                    },
                    endDate: {
                        $date: faker.date.future().toISOString()
                    },
                    createdAt: {
                        $date: new Date().toISOString()
                    },
                    updatedAt: {
                        $date: new Date().toISOString()
                    },
                    projectStatus: 'Đang thực hiện',
                    requiredSkills: [],
                    relatedMajors: [],
                    skillRequirements: faker.lorem.sentences(2),
                    isDeleted: false,
                    pinnedProject: false,
                    removedStudents: [],
                    internshipSchedule: generateInternshipSchedule(),
                    weeklyReportDueDay: faker.number.int({ min: 0, max: 6 }),
                    weeklyReports: [],
                    tasks: []
                };
                fakeProjects.push(project);
            }
        }

        await fs.writeFile(
            path.join(process.cwd(), 'data', 'projects.json'),
            JSON.stringify({ projects: fakeProjects }, null, 2),
            'utf8'
        );

        res.json({
            success: true,
            message: 'Đã tạo dữ liệu project thành công',
            data: fakeProjects
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo dữ liệu project',
            error: error.message
        });
    }
});

// Hàm tạo lịch thực tập
const generateInternshipSchedule = () => {
    const schedule = [];
    const numDays = faker.number.int({ min: 2, max: 5 });
    const usedDays = new Set();

    for (let i = 0; i < numDays; i++) {
        let dayOfWeek;
        do {
            dayOfWeek = faker.number.int({ min: 0, max: 6 });
        } while (usedDays.has(dayOfWeek));
        
        usedDays.add(dayOfWeek);
        
        schedule.push({
            dayOfWeek,
            startTime: `${faker.number.int({ min: 7, max: 9 })}:00`,
            endTime: `${faker.number.int({ min: 16, max: 18 })}:00`
        });
    }
    return schedule;
};

router.get('/assign-students', async (req, res) => {
    try {
        const projectsData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'projects.json'), 'utf8'));
        const studentsData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'students.json'), 'utf8'));
        
        const availableStudents = new Set(studentsData.students.map(s => s._id));
        const assignedStudents = new Set();

        for (const project of projectsData.projects) {
            // Xóa dữ liệu cũ
            project.selectedApplicants = [];
            project.applicants = [];

            // Số lượng sinh viên được chọn (1-3)
            const numSelected = faker.number.int({ min: 1, max: 6 });
            
            // Chọn sinh viên cho selectedApplicants
            for (let i = 0; i < numSelected; i++) {
                const availableArray = Array.from(availableStudents);
                if (availableArray.length === 0) break;

                const randomIndex = faker.number.int({ min: 0, max: availableArray.length - 1 });
                const studentId = availableArray[randomIndex];
                
                project.selectedApplicants.push({
                    studentId: {
                        $oid: studentId
                    },
                    appliedDate: {
                        $date: faker.date.past().toISOString()
                    },
                    acceptedAt: {
                        $date: faker.date.recent().toISOString()
                    }
                });

                availableStudents.delete(studentId);
                assignedStudents.add(studentId);
            }

            // Thêm applicants nếu project đang tuyển dụng
            if (project.isRecruiting) {
                const numApplicants = faker.number.int({ min: 2, max: 5 });
                const now = new Date();
                
                if (now >= project.applicationStart && now <= project.applicationEnd) {
                    for (let i = 0; i < numApplicants; i++) {
                        const availableArray = Array.from(availableStudents);
                        if (availableArray.length === 0) break;

                        const randomIndex = faker.number.int({ min: 0, max: availableArray.length - 1 });
                        const studentId = availableArray[randomIndex];

                        project.applicants.push({
                            applicantId: {
                                $oid: studentId
                            },
                            appliedDate: {
                                $date: faker.date.between({
                                    from: project.applicationStart.$date,
                                    to: Math.min(now, new Date(project.applicationEnd.$date))
                                }).toISOString()
                            }
                        });

                        availableStudents.delete(studentId);
                        assignedStudents.add(studentId);
                    }
                }
            }
        }

        // Cập nhật currentProjects và appliedProjects cho sinh viên
        for (const student of studentsData.students) {
            student.currentProjects = [];
            student.appliedProjects = [];

            for (const project of projectsData.projects) {
                if (project.selectedApplicants.some(a => a.studentId === student._id)) {
                    student.currentProjects.push(project._id);
                }
                if (project.applicants.some(a => a.applicantId === student._id)) {
                    student.appliedProjects.push(project._id);
                }
            }
        }

        // Lưu dữ liệu
        await Promise.all([
            fs.writeFile(
                path.join(process.cwd(), 'data', 'projects.json'),
                JSON.stringify({ projects: projectsData.projects }, null, 2),
                'utf8'
            ),
            fs.writeFile(
                path.join(process.cwd(), 'data', 'students.json'),
                JSON.stringify({ students: studentsData.students }, null, 2),
                'utf8'
            )
        ]);

        res.json({
            success: true,
            message: 'Đã gán sinh viên vào các dự án thành công',
            assignedStudents: assignedStudents.size
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gán sinh viên vào dự án',
            error: error.message
        });
    }
});

const convertToMongoFormat = (obj) => {
  // Các trường không nên chuyển thành $oid
  const numericFields = ['foundedYear', 'employeeCount', 'maxApplicants', 'dayOfWeek', 'weeklyReportDueDay'];
  
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'string' && item.length === 24 && mongoose.Types.ObjectId.isValid(item)) {
        return {
          $oid: item
        };
      }
      return convertToMongoFormat(item);
    });
  }
  
  if (obj && typeof obj === 'object') {
    const converted = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Xử lý các trường số
      if (numericFields.includes(key)) {
        converted[key] = value;
        continue;
      }
      
      // Xử lý các trường đặc biệt là mảng ID
      if (['skills', 'currentProjects', 'appliedProjects', 'removedStudents', 'requiredSkills', 'relatedMajors'].includes(key) && Array.isArray(value)) {
        converted[key] = value.map(id => {
          if (typeof id === 'string' && id.length === 24 && mongoose.Types.ObjectId.isValid(id)) {
            return {
              $oid: id
            };
          }
          return id;
        });
      } else if (typeof value === 'string' && value.length === 24 && mongoose.Types.ObjectId.isValid(value)) {
        converted[key] = {
          $oid: value.toString()
        };
      } else if (value instanceof Date) {
        converted[key] = {
          $date: value.toISOString()
        };
      } else if (Array.isArray(value)) {
        converted[key] = convertToMongoFormat(value);
      } else if (value && typeof value === 'object') {
        converted[key] = convertToMongoFormat(value);
      } else {
        converted[key] = value;
      }
    }
    return converted;
  }
  
  return obj;
};

router.get('/convert-format', async (req, res) => {
  try {
    // Đọc tất cả các file JSON cần chuyển đổi
    const files = ['projects.json', 'students.json', 'companies.json', 'schools.json', 'major.json', 'skills.json'];
    
    for (const file of files) {
      const filePath = path.join(process.cwd(), 'data', file);
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      // Chuyển đổi định dạng
      const convertedData = convertToMongoFormat(data);
      
      // Ghi lại file
      await fs.writeFile(
        filePath,
        JSON.stringify(convertedData, null, 2),
        'utf8'
      );
    }

    res.json({
      success: true,
      message: 'Đã chuyển đổi định dạng thành công'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi chuyển đổi định dạng',
      error: error.message
    });
  }
});

export default router;
