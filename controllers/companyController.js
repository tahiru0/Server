const path = require('path');
const Admin = require("../models/admin");
const User = require("../models/user");
const Company = require('../models/company');
const School = require('../models/school');
const Project = require('../models/project');
const utils = require('../utils/utils');
const { createUpload } = require('../utils/upload');
const { encodeUrl } = require('../utils/urlEncoder');
const uploadLogo = createUpload('../public/assets/company/logo');

const createCompany = async (req, res) => {
    try {
        const { username, password, email, name, description, phone, website } = req.body;
        let logo, backgroundImage;

        // Xử lý logo
        if (req.files && req.files['logo']) {
            logo = `${process.env.REACT_APP_API_URL}/public/assets/company/logo/${req.files['logo'][0].filename}`;
        } else {
            // Tạo URL mặc định nếu không có logo được upload
            logo = `${process.env.REACT_APP_API_URL}${encodeUrl(name)}`;
        }

        // Các bước kiểm tra và tạo mới công ty như cũ
        const existingCompany = await Company.findOne({ name });
        if (existingCompany) {
            return res.status(400).send({ error: 'Tên công ty đã tồn tại' });
        }

        const existingUserByPhone = await User.findOne({ phone });
        if (existingUserByPhone) {
            return res.status(400).send({ error: 'Số điện thoại đã tồn tại' });
        }

        const existingUserByUsername = await User.findOne({ username });
        if (existingUserByUsername) {
            return res.status(400).send({ error: 'Tên đăng nhập đã tồn tại' });
        }

        const hashedPassword = await utils.hashPassword(password);
        const newUser = new User({
            username,
            password: hashedPassword,
            email,
            phone,
            role: 'Company'
        });
        await newUser.save();

        const newCompany = new Company({
            name,
            logo,
            backgroundImage,
            description,
            phone,
            website,
            user: newUser._id
        });
        await newCompany.save();

        res.status(201).send({ message: 'Tạo tài khoản công ty thành công', company: newCompany });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
};

const updateCompany = async (req, res) => {
    const updates = Object.keys(req.body);
    const allowedUpdates = ['name', 'logo', 'description', 'phone', 'website', 'isActive'];
    const isValidOperation = utils.validateUpdates(updates, allowedUpdates);

    if (!isValidOperation) {
        return res.status(400).send({ error: 'Cập nhật không hợp lệ' });
    }

    try {
        const company = await utils.findDocumentById(Company, req.params.id);

        if (!company) {
            return res.status(404).send({ error: 'Không tìm thấy công ty' });
        }

        updates.forEach((update) => {
            company[update] = req.body[update];
        });

        if (req.file) {
            if (company.logo) {
                const oldLogoPath = path.join(__dirname, '..', company.logo);
                utils.deleteFile(oldLogoPath);
            }
            company.logo = `${process.env.REACT_APP_API_URL}/public/assets/company/logo/${req.file.filename}`;
        }

        await company.save();
        res.send({ message: 'Cập nhật công ty thành công', company });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).send({ error: 'Cập nhật không hợp lệ', details: messages.join(', ') });
        }
        res.status(500).send({ error: 'Cập nhật công ty không thành công', details: error.message });
    }
};

const listCompanies = async (req, res) => {
    try {
        const { search, sortField, sortOrder, limit = 10, page = 1, isActive, searchFields } = req.query;
        const filters = { isDeleted: false };

        if (isActive !== undefined) {
            filters.isActive = isActive === 'true';
        }

        const searchFieldsArray = searchFields ? searchFields.split(',') : ['name'];

        // Set default sortField and sortOrder if they are not provided
        const effectiveSortField = sortField || 'createdAt';
        const effectiveSortOrder = sortOrder || 'desc';

        const query = utils.searchAndFilter(Company, filters, searchFieldsArray, search, effectiveSortField, effectiveSortOrder)
            .populate('user')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const companies = await query.exec();
        const total = await utils.searchAndFilter(Company, filters, searchFieldsArray, search, effectiveSortField, effectiveSortOrder).countDocuments();

        const companiesWithIndex = companies.map((company, index) => ({
            ...company.toObject(),
            index: (page - 1) * limit + index + 1,
        }));

        res.send({ companies: companiesWithIndex, total });
    } catch (error) {
        res.status(500).send({ error: 'Lỗi khi lấy danh sách công ty', details: error.message });
    }
};

const getCompanyById = async (req, res) => {
    try {
        const companyId = req.params.id;

        const company = await Company.findById(companyId)
            .populate('user')
            .exec();

        if (!company) {
            return res.status(404).send({ error: 'Công ty không tồn tại' });
        }

        const projectCount = await Project.countDocuments({ company: companyId });
        const instructorCount = await Instructor.countDocuments({ company: companyId });

        res.send({
            company: company.toObject(),
            user: company.user,
            projectCount,
            instructorCount
        });
    } catch (error) {
        res.status(500).send({ error: 'Lỗi khi lấy thông tin công ty', details: error.message });
    }
};

export default {
    createCompany,
    updateCompany,
    listCompanies,
    getCompanyById,
    uploadLogo,
};