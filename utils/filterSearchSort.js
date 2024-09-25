import mongoose from 'mongoose';

export async function filterSearchSort(Model, options) {
  const {
    page = 1,
    limit = 10,
    search,
    sort,
    order,
    filterFields,
    searchFields,
    populateFields,
    select
  } = options;

  let query = Model.find();

  // Áp dụng tìm kiếm
  if (search && searchFields) {
    const searchRegex = new RegExp(search, 'i');
    const searchConditions = searchFields.map(field => ({ [field]: searchRegex }));
    query = query.or(searchConditions);
  }

  // Áp dụng lọc
  if (filterFields) {
    Object.entries(filterFields).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query = query.where(key).equals(value);
      }
    });
  }

  // Áp dụng sắp xếp
  if (sort) {
    const sortOrder = order === 'desc' ? -1 : 1;
    query = query.sort({ [sort]: sortOrder });
  }

  // Áp dụng populate
  if (populateFields) {
    query = query.populate(populateFields);
  }

  // Áp dụng select
  if (select) {
    query = query.select(select);
  }

  // Đếm tổng số documents
  const totalItems = await Model.countDocuments(query);

  // Áp dụng phân trang
  const totalPages = Math.ceil(totalItems / limit);
  const skip = (page - 1) * limit;
  query = query.skip(skip).limit(limit);

  // Thực hiện truy vấn
  const data = await query;

  return {
    data,
    currentPage: page,
    totalPages,
    totalItems,
    itemsPerPage: limit
  };
}

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
