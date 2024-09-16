import mongoose from 'mongoose';

export const filterSearchSort = async (Model, query, options = {}) => {
  const {
    filterFields = [],
    searchFields = [],
    defaultSortField = 'createdAt',
    defaultSortOrder = 'desc',
    populateFields = [],
    page = 1,
    limit = 10,
    select = '',
  } = options;

  let mongooseQuery = Model.find({ isDeleted: false });

  // Xử lý filter
  filterFields.forEach(field => {
    if (query[field]) {
      mongooseQuery = mongooseQuery.where(field).equals(query[field]);
    }
  });

  // Xử lý tìm kiếm
  if (query.search && searchFields.length > 0) {
    const searchRegex = new RegExp(query.search, 'i');
    const searchConditions = searchFields.map(field => ({ [field]: searchRegex }));
    mongooseQuery = mongooseQuery.or(searchConditions);
  }

  // Xử lý sắp xếp
  const sortField = query.sortBy || defaultSortField;
  const sortOrder = query.order === 'asc' ? 1 : -1;
  mongooseQuery = mongooseQuery.sort({ [sortField]: sortOrder });

  // Xử lý phân trang
  const skip = (page - 1) * limit;
  mongooseQuery = mongooseQuery.skip(skip).limit(Number(limit));

  // Xử lý select fields
  if (select) {
    mongooseQuery = mongooseQuery.select(select);
  }

  // Xử lý populate
  populateFields.forEach(field => {
    mongooseQuery = mongooseQuery.populate(field);
  });

  // Thực hiện truy vấn
  const results = await mongooseQuery.exec();
  const total = await Model.countDocuments(mongooseQuery.getFilter());

  return {
    data: results,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / limit)
  };
};

export const applyFilters = (query, filterFields) => {
  const filters = {};
  filterFields.forEach(field => {
    if (query[field]) {
      filters[field] = query[field];
    }
  });
  return filters;
};

export const applySearch = (query, searchFields) => {
  if (query.search && searchFields.length > 0) {
    const searchRegex = new RegExp(query.search, 'i');
    return {
      $or: searchFields.map(field => ({ [field]: searchRegex }))
    };
  }
  return {};
};

export const applySorting = (query, defaultSortField = 'createdAt', defaultSortOrder = 'desc') => {
  const sortField = query.sortBy || defaultSortField;
  const sortOrder = query.order === 'asc' ? 1 : -1;
  return { [sortField]: sortOrder };
};
