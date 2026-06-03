'use strict';

/**
 * Standard API success response wrapper
 */
class ApiResponse {
  constructor(statusCode, message, data = null, meta = null) {
    this.success = true;
    this.statusCode = statusCode;
    this.message = message;
    if (data !== null) this.data = data;
    if (meta !== null) this.meta = meta;
  }

  static send(res, statusCode, message, data = null, meta = null) {
    const response = new ApiResponse(statusCode, message, data, meta);
    return res.status(statusCode).json(response);
  }

  static ok(res, message, data = null, meta = null) {
    return ApiResponse.send(res, 200, message, data, meta);
  }

  static created(res, message, data = null) {
    return ApiResponse.send(res, 201, message, data);
  }

  static noContent(res) {
    return res.status(204).send();
  }
}

module.exports = ApiResponse;
