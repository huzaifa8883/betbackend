const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');

// Get users collection
const getUsersCollection = () => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB connection not established');
  }
  return mongoose.connection.db.collection(config.database.collections.users);
};

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username & password required' });

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ username: { $regex: new RegExp('^' + username + '$', 'i') } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid password' });

    // Create JWT
    const token = jwt.sign({
      _id: user._id.toString(),
      username: user.username,
      role: user.role
    }, config.jwtSecret, { expiresIn: '12h' });

    res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
