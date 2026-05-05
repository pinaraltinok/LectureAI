/**
 * Schema Validation Middleware — using Zod.
 *
 * Factory function that creates Express middleware to validate
 * request data (body, params, or query) against a Zod schema.
 *
 * Design Pattern: Chain of Responsibility (middleware pipeline)
 * Principle: Fail-Fast Validation, Separation of Concerns
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @param {'body'|'params'|'query'} source - Request property to validate
 * @returns {Function} Express middleware
 *
 * @example
 *   const { z } = require('zod');
 *   const validate = require('../middleware/validate');
 *   const schema = z.object({ email: z.string().email() });
 *   router.post('/login', validate(schema), asyncHandler(login));
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const issues = result.error.issues || result.error.errors || [];
    const errors = issues.map(e => `${(e.path || []).join('.')}: ${e.message}`);
    return res.status(400).json({ error: 'Doğrulama hatası', details: errors });
  }
  req[source] = result.data;
  next();
};

module.exports = validate;
