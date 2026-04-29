const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/constants');

/**
 * JWT authentication middleware.
 * Extracts the Bearer token from the Authorization header,
 * OR from a `token` query parameter (for <video>/<iframe> src URLs).
 * Verifies it, and attaches the decoded user payload to `req.user`.
 */
function auth(req, res, next) {
  let token = null;

  // 1. Try Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Fallback: try query parameter (needed for <video src="...?token=...">)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Yetkilendirme token\'ı gerekli.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, role, email, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token.' });
  }
}

module.exports = auth;
