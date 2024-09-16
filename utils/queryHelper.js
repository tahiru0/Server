import mongoose from 'mongoose';

export const handleQuery = (Model, req, additionalFilters = {}) => {
  let query = Model.find();

  // Xử lý additionalFilters
  Object.keys(additionalFilters).forEach(key => {
    if (additionalFilters[key] != null) {
      if (mongoose.Types.ObjectId.isValid(additionalFilters[key])) {
        query = query.where(key).equals(new mongoose.Types.ObjectId(additionalFilters[key]));
      } else {
        query = query.where(key).equals(additionalFilters[key]);
      }
    }
  });

  // Xử lý các trường filter đặc biệt
  const specialFilters = ['sort', 'select', 'page', 'limit', 'sortBy', 'sortOrder', 'search'];
  Object.keys(req.query).forEach(key => {
    if (!specialFilters.includes(key) && req.query[key] != null && req.query[key] !== '') {
      if (mongoose.Types.ObjectId.isValid(req.query[key])) {
        query = query.where(key).equals(new mongoose.Types.ObjectId(req.query[key]));
      } else {
        query = query.where(key).equals(req.query[key]);
      }
    }
  });

  // Xử lý sort
  if (req.query.sortBy && req.query.sortOrder) {
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
    query = query.sort({ [req.query.sortBy]: sortOrder });
  } else if (req.query.sort) {
    const sortFields = req.query.sort.split(',').join(' ');
    query = query.sort(sortFields);
  }

  if (req.query.select) {
    const selectFields = req.query.select.split(',').join(' ');
    query = query.select(selectFields);
  }

  // Xử lý search nếu cần
  if (req.query.search && req.query.search.trim() !== '') {
    query = query.or([
      { title: { $regex: req.query.search, $options: 'i' } },
      { description: { $regex: req.query.search, $options: 'i' } }
    ]);
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  query = query.skip(skip).limit(limit);

  return query;
};
