/**
 * Decorator Pattern — Higher-Order Function implementation for Express.
 *
 * Wraps async route handlers to automatically catch rejected promises
 * and forward errors to Express's centralized error-handling middleware,
 * eliminating repetitive try/catch blocks across all controllers.
 *
 * Before (repeated in every handler):
 *   async function getX(req, res) {
 *     try { ... } catch (err) { console.error(err); res.status(500).json({error:'...'}); }
 *   }
 *
 * After:
 *   async function getX(req, res) { ... }  // just throw on error
 *   router.get('/x', asyncHandler(getX));   // errors caught automatically
 *
 * @param {Function} fn - Async Express route handler (req, res, next) => Promise
 * @returns {Function} Wrapped handler with automatic error forwarding
 *
 * Design Pattern: Decorator (Gamma et al., 1994)
 * SOLID Principle: DRY — Don't Repeat Yourself
 *
 * @see {@link https://expressjs.com/en/guide/error-handling.html}
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
