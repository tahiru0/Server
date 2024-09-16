import express from 'express';
import Project from '../models/Project.js'; 
import authenticate from '../middlewares/authenticate.js'; 

const router = express.Router();

const findCompanyAccountById = async (decoded) => {
    const company = await Company.findById(decoded.companyId);
    if (!company) return null;
    const account = company.accounts.id(decoded._id);
    return account ? { ...account.toObject(), company: company._id, role: account.role } : null;
};


export default router;
