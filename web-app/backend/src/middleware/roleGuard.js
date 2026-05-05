/**
 * Role-based access control middleware factory.
 * Usage: roleGuard('ADMIN')  or  roleGuard('ADMIN', 'TEACHER')
 *
 * Must be used AFTER the auth middleware so that `req.user` exists.
 */
function roleGuard(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Önce giriş yapmalısınız.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Bu işlem için yetkiniz yok. Gerekli rol: ${allowedRoles.join(' veya ')}`,
      });
    }

    next();
  };
}

module.exports = roleGuard;
