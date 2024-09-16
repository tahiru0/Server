import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import { handleError as globalHandleError } from './errorHandler.js';

function createCrudRouter(Model, options = {}) {
  const {
    populateFields = [],
    getFields = [],
    postFields = [],
    populateOptions = {},
    relatedModels = [],
    defaultValues = {},
    defaultRelatedValues = {},
    beforeCreate, afterCreate,
    beforeUpdate, afterUpdate,
    beforeDelete, afterDelete,
    beforeGet, afterGet,
    uploadOptions = { enabled: false, single: false, fieldName: 'files' },
    disableRoutes = [],
    maxLimit = 100,
  } = options;

  const router = express.Router();

  // Cấu hình multer cho upload ảnh
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/') // Đảm bảo thư mục này tồn tại
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname))
    }
  });

  const upload = multer({ storage: storage });

  // Hàm Create
  const createItem = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    let transactionCommitted = false;

    try {
      const body = req.body;
      if (beforeCreate) {
        await beforeCreate(body, req.files);
      }

      // Filter the body based on postFields
      const filteredBody = postFields.length === 0 ? body : postFields.reduce((acc, field) => {
        if (!field.startsWith('-') && body[field] !== undefined) {
          acc[field] = body[field];
        }
        return acc;
      }, {});

      // Assign default values if not provided
      for (const [key, value] of Object.entries(defaultValues)) {
        if (filteredBody[key] === undefined) {
          filteredBody[key] = value;
        }
      }

      let newItem = new Model(filteredBody);

      // Process related models
      for (let relatedField of relatedModels) {
        if (body[relatedField]) {
          const RelatedModel = mongoose.model(relatedField);
          const relatedItems = Array.isArray(body[relatedField]) ? body[relatedField] : [body[relatedField]];

          const savedRelatedItems = await RelatedModel.create(relatedItems.map(item => ({
            ...item,
            [Model.modelName.toLowerCase()]: newItem._id
          })), { session });
          newItem[relatedField] = savedRelatedItems.map(item => item._id);
        } else if (defaultRelatedValues[relatedField]) {
          const RelatedModel = mongoose.model(relatedField);
          const defaultItem = { ...defaultRelatedValues[relatedField], [Model.modelName.toLowerCase()]: newItem._id };
          const savedItem = await RelatedModel.create(defaultItem, { session });
          newItem[relatedField] = savedItem._id;
        }
      }

      await newItem.save({ session });

      if (afterCreate) {
        await afterCreate(newItem, req.files);
      }

      await session.commitTransaction();
      transactionCommitted = true;

      // Populate related fields
      for (let field of populateFields) {
        newItem = await newItem.populate({
          path: field,
          select: populateOptions[field] || ''
        });
      }

      res.status(201).json(newItem);
    } catch (error) {
      if (!transactionCommitted) {
        await session.abortTransaction();
      }
      const handleError = (res, error) => {
        console.error('Lỗi:', error);
        const { status, message } = globalHandleError(error);
        res.status(status).json({ error: message });
      };
      handleError(res, error);
    } finally {
      session.endSession();
    }
  };

  // Hàm Read (Get all)
  const getItems = async (req, res) => {
    try {
      const { page = 1, limit = 10, sort, filter, search, select = '', count } = req.query;
      const query = { isDeleted: false };

      // Xử lý filter
      if (filter) {
        const filterParams = filter.split(',');
        filterParams.forEach(param => {
          const [key, value] = param.split('=');
          if (!getFields.length || getFields.includes(key)) {
            query[key] = value;
          }
        });
      }

      // Xử lý tìm kiếm
      if (search) {
        query.$or = Object.keys(Model.schema.paths)
          .filter(field => {
            const fieldType = Model.schema.paths[field].instance;
            return (!getFields.length || getFields.includes(field)) && fieldType === 'String';
          })
          .map(field => {
            const searchObj = {};
            searchObj[field] = { $regex: search, $options: 'i' };
            return searchObj;
          });
      }

      // Xử lý sắp xếp
      const sortOption = sort ? { [sort.replace('-', '')]: sort.startsWith('-') ? -1 : 1 } : {};

      // Truy vấn tổng số bản ghi
      const total = await Model.countDocuments(query);
      // If count is requested, return the total count
      if (count) {
        return res.json({ total });
      }

      // Xử lý select
      const selectFields = getFields.length ? getFields.filter(field => !field.startsWith('-')).join(',') : '';

      if (beforeGet) {
        await beforeGet(req);
      }

      // Truy vấn dữ liệu
      const limitValue = Math.min(Number(limit), maxLimit); // Giới hạn số lượng bản ghi
      const data = await Model.find(query)
        .sort(sortOption)
        .skip((page - 1) * limitValue)
        .limit(limitValue)
        .select(selectFields)
        .populate(populateFields.map(field => ({
          path: field,
          select: populateOptions[field] || ''
        })))
        .exec();

      if (afterGet) {
        await afterGet(data, req);
      }

      res.json({
        data,
        total,
        page: Number(page),
        limit: limitValue,
        totalPages: Math.ceil(total / limitValue)
      });
    } catch (error) {
      handleError(res, error);
    }
  };

  // Hàm Read (Get by ID)
  const getItemById = async (req, res) => {
    // Kiểm tra ID hợp lệ
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID không hợp lệ.' });
    }

    const { field, fieldId } = req.query; // Expecting field and fieldId as query parameters

    try {
      let item = await Model.findOne({ _id: req.params.id, isDeleted: false })
        .populate(populateFields.map(field => ({
          path: field,
          select: populateOptions[field] || ''
        })));

      // Populate các mô hình liên quan
      for (let relatedModel of relatedModels) {
        item = await item.populate(relatedModel);
      }

      if (!item) {
        return res.status(404).json({ error: 'Không tìm thấy' });
      }

      // If field and fieldId are provided, retrieve the specific item from the array
      if (field && fieldId) {
        if (Array.isArray(item[field])) {
          const specificItem = item[field].find(subItem => subItem._id.toString() === fieldId);
          if (!specificItem) {
            return res.status(404).json({ error: 'Không tìm thấy mục trong thuộc tính đã cho.' });
          }
          return res.json(specificItem);
        } else {
          return res.status(400).json({ error: 'Thuộc tính không phải là một mảng.' });
        }
      }

      res.json(item);
    } catch (error) {
      handleError(res, error);
    }
  };

  // Hàm Update
  const updateItem = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID không hợp lệ.' });
    }

    try {
      const updatedData = req.body;
      
      // Xử lý file upload nếu có
      if (req.file) {
        updatedData.image = req.file.filename; // Lưu tên file vào trường image
      }

      if (beforeUpdate) {
        await beforeUpdate(req.params.id, updatedData, req.file);
      }

      let document = await Model.findOne({ _id: req.params.id, isDeleted: false }).session(session);

      if (!document) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
      }

      // Lọc dữ liệu cập nhật dựa trên postFields
      const filteredData = postFields.length === 0 ? updatedData : Object.keys(updatedData).reduce((acc, key) => {
        if (!postFields.includes(`-${key}`) && updatedData[key] !== undefined) {
          acc[key] = updatedData[key];
        }
        return acc;
      }, {});

      // Cập nhật trường trong document
      for (const [key, value] of Object.entries(filteredData)) {
        if (document[key] !== undefined) {
          document.set(key, value);
        }
      }

      // Xử lý các trường nested nếu có
      if (options.nestedFields) {
        for (const nestedField of options.nestedFields) {
          if (filteredData[nestedField] && typeof filteredData[nestedField] === 'object') {
            for (const [key, value] of Object.entries(filteredData[nestedField])) {
              document.set(`${nestedField}.${key}`, value);
            }
          }
        }
      }

      await document.save({ session });
      
      if (afterUpdate) {
        await afterUpdate(document, req.file);
      }
      
      await session.commitTransaction();

      // Populate các trường cần thiết trước khi trả về response
      await document.populate(populateFields.map(field => ({
        path: field,
        select: populateOptions[field] || ''
      })));

      res.json(document);
    } catch (error) {
      await session.abortTransaction();
      handleError(res, error);
    } finally {
      session.endSession();
    }
  };

  // Hàm Delete
  const deleteItem = async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID không hợp lệ.' });
    }
    try {
      if (beforeDelete) {
        await beforeDelete(req.params.id);
      }
      const deletedItem = await Model.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        { isDeleted: true },
        { new: true }
      );

      if (!deletedItem) {
        return res.status(404).json({ error: 'Không tìm thấy' });
      }

      // Populate các mô hình liên quan sau khi xóa
      for (let relatedModel of relatedModels) {
        await deletedItem.populate(relatedModel);
      }
      if (afterDelete) {
        await afterDelete(deletedItem);
      }
      res.json({ message: 'Đã xóa mềm thành công' });
    } catch (error) {
      handleError(res, error);
    }
  };

  // Đăng ký các route
  if (!disableRoutes.includes('GET')) {
    router.get('/', getItems);
  }

  if (!disableRoutes.includes('POST')) {
    router.post('/', uploadOptions.enabled ? upload[uploadOptions.single ? 'single' : 'array'](uploadOptions.fieldName) : (req, res, next) => next(), createItem);
  }

  if (!disableRoutes.includes('PUT')) {
    router.put('/:id', upload.single('image'), updateItem);
  }

  if (!disableRoutes.includes('GET_BY_ID')) {
    router.get('/:id', getItemById);
  }

  if (!disableRoutes.includes('DELETE')) {
    router.delete('/:id', deleteItem);
  }

  return router;
}

export default createCrudRouter;
