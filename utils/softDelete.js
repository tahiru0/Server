const softDeletePlugin = function(schema) {
    schema.add({ isDeleted: { type: Boolean, default: false } });
  
    // Áp dụng cho tất cả các truy vấn
    const excludeDeletedDocsQuery = { isDeleted: { $ne: true } };
  
    schema.pre('find', function() {
      this.where(excludeDeletedDocsQuery);
    });
  
    schema.pre('findOne', function() {
      this.where(excludeDeletedDocsQuery);
    });
  
    schema.pre('countDocuments', function() {
      this.where(excludeDeletedDocsQuery);
    });
  
    schema.pre('estimatedDocumentCount', function() {
      this.where(excludeDeletedDocsQuery);
    });
  
    // Áp dụng cho các phương thức cập nhật
    ['findOneAndUpdate', 'findByIdAndUpdate'].forEach(method => {
      schema.pre(method, function() {
        this.where(excludeDeletedDocsQuery);
      });
    });
  
    // Áp dụng cho các phương thức xóa
    ['findOneAndDelete', 'findByIdAndDelete'].forEach(method => {
      schema.pre(method, function() {
        this.where(excludeDeletedDocsQuery);
      });
    });
  
    // Thêm phương thức softDelete
    schema.methods.softDelete = function() {
      this.isDeleted = true;
      return this.save();
    };
  
    // Thêm phương thức restore
    schema.methods.restore = function() {
      this.isDeleted = false;
      return this.save();
    };
  
    // Thêm phương thức tĩnh để tìm cả các bản ghi đã bị xóa mềm
    schema.statics.findWithDeleted = function() {
      return this.find().where('isDeleted').ne(undefined);
    };
  };
  
  export default softDeletePlugin;
