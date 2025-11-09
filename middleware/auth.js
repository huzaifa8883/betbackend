const jwt = require('jsonwebtoken');
const config = require('../config'); // Tumhare secret key aur settings

// JWT Authentication middleware
const authMiddleware = (requiredRole = null) => {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    try {
      const decoded = jwt.verify(token, config.jwtSecret); // config.jwtSecret me tumhara secret key
      req.user = decoded; // req.user me JWT payload save
       
      // Role check
      if (requiredRole && decoded.role) {
        const rolesHierarchy = ['user','master','supermaster','admin'];
        const userIndex = rolesHierarchy.indexOf(decoded.role);
        const requiredIndex = rolesHierarchy.indexOf(requiredRole);
        if (userIndex < requiredIndex) {
          return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }
      }

      next();
    } catch (err) {
      console.error(err);
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  };
};

module.exports = authMiddleware;
