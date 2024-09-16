export const handleError = (error) => {
  console.error('Lỗi:', error);
  
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(err => err.message);
    return { status: 400, message: messages.join(', ') };
  }
  
  if (error.code === 11000) {
    return { status: 400, message: 'Thông tin đã tồn tại trong hệ thống.' };
  }
  
  if (error.name === 'JsonWebTokenError') {
    return { status: 401, message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' };
  }
  
  if (error.status === 429) {
    return { status: 429, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' };
  }
  
  if (error.message.includes('không được để trống') ||
      error.message.includes('không hợp lệ')) {
    return { status: 400, message: error.message };
  }
  
  if (error.message === 'Thông tin đăng nhập không chính xác.' ||
      error.message === 'Trường không tồn tại.') {
    return { status: 401, message: error.message };
  }
  
  if (error.message.includes('Cast to ObjectId failed')) {
    return { status: 400, message: 'ID không hợp lệ.' };
  }
  
  return { status: 500, message: error.message || 'Đã xảy ra lỗi. Vui lòng thử lại sau.' };
};
