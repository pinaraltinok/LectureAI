/**
 * Operational Error class for controlled HTTP error responses.
 *
 * Extends the native Error with an HTTP status code and an `isOperational`
 * flag so the global error handler can distinguish between expected errors
 * (e.g. "Rapor bulunamadı", 404) and unexpected programming bugs (500).
 *
 * Usage:
 *   throw new AppError('Rapor bulunamadı.', 404);
 *   throw new AppError('jobId ve teacherId gereklidir.', 400);
 *
 * The global error handler in app.js reads `statusCode` and `isOperational`
 * to decide whether to expose the message to the client or return a generic
 * "Sunucu hatası" response.
 *
 * @see app.js — Global Error Handler
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error description (Turkish)
   * @param {number} statusCode - HTTP status code (400, 401, 403, 404, 409, 500)
   */
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
