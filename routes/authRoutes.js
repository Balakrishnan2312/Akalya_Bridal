const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const { ensureDbConnected } = require('../utils/db');

const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    if (!(await ensureDbConnected())) {
      return res.status(503).json({
        success: false,
        message: 'Admin login is unavailable while the database is offline.'
      });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(503).json({
        success: false,
        message: 'Admin authentication is not configured on the server.'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const admin = await Admin.findOne({ email: normalizedEmail }).select('+password');
    const isMatch = admin ? await bcrypt.compare(String(password), admin.password) : false;

    if (!admin || !isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.'
      });
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '12h';
    const adminPayload = { id: admin._id, email: admin.email, name: admin.name, role: admin.role };

    const token = jwt.sign(adminPayload, jwtSecret, { expiresIn });

    res.json({
      success: true,
      message: 'Login successful',
      token
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error during authentication.' });
  }
};

router.post('/login', handleLogin);
router.post('/', handleLogin);

module.exports = router;
