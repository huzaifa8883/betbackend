// // routes/userRoutes.js
// const express = require("express");
// const { ObjectId } = require("mongodb");
// const User = require("../models/User"); // mongoose model
// const router = express.Router();

// // role hierarchy mapping
// const ROLE_HIERARCHY = {
//   superadmin: ["admin", "supermaster", "master", "user"],
//   admin: ["supermaster", "user"],
//   supermaster: ["master", "user"],
//   master: ["user"],
//   user: []
// };

// // create user route
// router.post("/create", async (req, res) => {
//   try {
//     const { creatorId, username, role,  phone, passwordHash } = req.body;

//     // find creator (the one who is creating new user)
//     const creator = await User.findById(creatorId);
//     if (!creator) {
//       return res.status(404).json({ error: "Creator not found" });
//     }

//     // check if creator has permission to create this role
//     const allowedRoles = ROLE_HIERARCHY[creator.role] || [];
//     if (!allowedRoles.includes(role)) {
//       return res.status(403).json({ error: `You cannot create a user with role: ${role}` });
//     }

//     // create new user
//     const newUser = new User({
//       username,
      
//       password_hash: passwordHash,
//       role,
      
//       phone,
//       parent_id: creator._id,
//       created_at: new Date(),
//       updated_at: new Date(),
//       wallet_balance: 0.0,
//       status: "active"
//     });

//     await newUser.save();

//     // add child reference to creator
//     creator.children.push(newUser._id);
//     await creator.save();

//     return res.json({ success: true, user: newUser.toObject() });

//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ error: "Server error" });
//   }
// });

// module.exports = router;
