const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/constants');

/**
 * JWT authentication middleware.
 * Reads the token from:
 *   1. httpOnly cookie (primary — secure, invisible to JS)
 *   2. Authorization header (fallback — for Swagger/Postman)
 *   3. Query parameter (for <video> src URLs)
 */
function auth(req, res, next) {
  let token = null;

  // 1. Try httpOnly cookie (most secure — F12 cannot see this)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // 2. Fallback: Authorization header (for API clients like Postman)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  // 3. Fallback: query parameter (needed for <video src="...?token=...">)
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
