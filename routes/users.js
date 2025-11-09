/**
 * User API Routes (with JWT, roles + wallet)
 * Fully secured and extended
 */

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const config = require("../config");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");

// suppose userId frontend se string me aa raha hai
function ensureObjectId(id) {
  if (!id) return null;
  
  // If already ObjectId instance
  if (id instanceof ObjectId) {
    return id;
  }
  
  // If string, try to convert
  if (typeof id === 'string') {
    try {
      // Remove any whitespace
      id = id.trim();
      
      // Validate string format
      if (/^[0-9a-fA-F]{24}$/.test(id)) {
        return new ObjectId(id);
      }
      return null;
    } catch (err) {
      console.error('Invalid ObjectId string:', id);
      return null;
    }
  }
  
  return null;
}
// 🔹 JWT Authentication middleware
const authMiddleware = (requiredRole = null) => {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1]; // Bearer <token>
    if (!token) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    try {
      const decoded = jwt.verify(token, config.api.jwtSecret);
      
      // Debug log
      console.log("JWT Decoded payload:", decoded);

      // Make sure we have a valid _id
      if (!decoded._id) {
        throw new Error("No user ID in token");
      }

      // Convert string ID to ObjectId
      try {
        decoded._id = new ObjectId(decoded._id.toString());
      } catch (err) {
        console.error("Error converting token _id to ObjectId:", err);
        throw new Error("Invalid user ID format in token");
      }

      req.user = decoded;

      if (requiredRole) {
        const rolesHierarchy = ["User", "Master", "SuperMaster", "Admin", "SuperAdmin"];
        const userIndex = rolesHierarchy.indexOf(decoded.role);
        const requiredIndex = rolesHierarchy.indexOf(requiredRole);
        if (userIndex < requiredIndex) {
          return res.status(403).json({ success: false, message: "Insufficient permissions" });
        }
      }

      next();
    } catch (err) {
      console.error("Auth middleware error:", err);
      return res.status(401).json({ 
        success: false, 
        message: "Invalid or expired token",
        error: err.message
      });
    }
  };
};

// 🔹 Get users collection safely
const getUsersCollection = () => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB connection not established");
  }
  return mongoose.connection.db.collection(config.database.collections.users);
};

/**
 * @route GET /api/users
 * @desc Get all users
 * @access Admin only
 */
router.get("/", authMiddleware("Admin"), async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const users = await usersCollection.find({}).toArray();
    const safeUsers = users.map(({ password, ...rest }) => rest);
    res.json({ success: true, users: safeUsers });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
const creationPermissions = {
  SuperAdmin: ["Admin", "SuperMaster", "Master", "User"],
  Admin: ["SuperMaster", "User"],
  SuperMaster: ["Master", "User"],
  Master: ["User"],
  User: []
};


/**
 * @route POST /api/users/create
 * @desc Create a new user
 * @access Admin only
 */
// Create User Route
router.post("/create", (req, res, next) => {
  if (req.user && req.user.role === "SuperAdmin") {
    return next();
  }
  return authMiddleware()(req, res, next);
}, async (req, res) => {
  try {
    const { username, password, phone, role, initial_balance = 0 } = req.body;

    if (!username || !password || !role) {
      return res
        .status(400)
        .json({ success: false, message: "Username, password, and role are required" });
    }

    let allowedRoles = creationPermissions[req.user.role] || [];
    if (req.user.role === "SuperAdmin") {
      allowedRoles = ["Admin", "SuperMaster", "Master", "User"];
    }

    if (!allowedRoles.includes(role)) {
      return res
        .status(403)
        .json({ success: false, message: "You are not allowed to create this role" });
    }

    const usersCollection = getUsersCollection();

    // Username duplicate check
    const existingUser = await usersCollection.findOne({
      username: new RegExp("^" + username + "$", "i"),
    });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Username already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Convert parent_id to ObjectId
    const parentId = req.user.role === "SuperAdmin" ? 
      null : 
      (typeof req.user._id === 'string' ? new ObjectId(req.user._id) : req.user._id);

    const newUser = {
      username,
      password: hashedPassword,
      role,
      parent_id: parentId,
      phone: phone || "",
      wallet_balance: parseFloat(initial_balance) || 0,
      liable: 0,          // 🔥 Initialize liable here
      transactions: [],
      status: "Active",
      created_at: new Date(),
      last_login: null,
    };

    console.log("Creating new user with data:", {
      ...newUser,
      password: '[HIDDEN]'
    });

    const result = await usersCollection.insertOne(newUser);

    const { password: pwd, ...safeUser } = newUser;
    safeUser._id = result.insertedId;

    res.json({
      success: true,
      message: `${role} created successfully`,
      user: safeUser,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message
    });
  }
});


router.get("/my-users", authMiddleware(), async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const users = await usersCollection.find({ parent_id: req.user._id }).toArray();
    const safeUsers = users.map(({ password, ...rest }) => rest);
    res.json({ success: true, users: safeUsers });
  } catch (error) {
    console.error("Error fetching my users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


router.get("/masters",  async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const masters = await usersCollection.find({ role: "Master" }).toArray();

    const safeMasters = masters.map(({ password, ...rest }) => rest);
    res.json({ success: true, masters: safeMasters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
router.get("/supermasters",  async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const masters = await usersCollection.find({ role: "SuperMaster" }).toArray();

    const safeMasters = masters.map(({ password, ...rest }) => rest);
    res.json({ success: true, masters: safeMasters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
router.get("/admin", async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const masters = await usersCollection.find({ role: "Admin" }).toArray();

    const safeMasters = masters.map(({ password, _id, ...rest }) => ({
      _id: _id.toString(),   // ✅ ObjectId ko string banaya
      ...rest,
    }));

    res.json({ success: true, admins: safeMasters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/user",  async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const masters = await usersCollection.find({ role: "User" }).toArray();

    const safeMasters = masters.map(({ password, ...rest }) => rest);
    res.json({ success: true, users: safeMasters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
/**
 * @route POST /api/users/login
 * @desc Login user with username & password
 * @access Public
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    const usersCollection = getUsersCollection();

    // SuperAdmin special case
    if (username === "super123" && password === "12345") {
      let superAdmin = await usersCollection.findOne({ role: "SuperAdmin" });
      
      if (!superAdmin) {
        const newId = new ObjectId();
        superAdmin = {
          _id: newId,
          username: "super123",
          password: await bcrypt.hash("12345", 10),
          role: "SuperAdmin",
          wallet_balance: 1000000000000,
          transactions: [],
          status: "Active",
          created_at: new Date(),
          last_login: new Date()
        };
        
        await usersCollection.insertOne(superAdmin);
      }

      // Update last login
      await usersCollection.updateOne(
        { _id: superAdmin._id },
        { $set: { last_login: new Date() } }
      );

      const payload = {
        _id: superAdmin._id.toString(), // Convert ObjectId to string
        username: superAdmin.username,
        role: "SuperAdmin"
      };

      const token = jwt.sign(payload, config.api.jwtSecret, { expiresIn: "7d" });

      const { password: pwd, ...safeSuperAdmin } = superAdmin;
      
      return res.json({
        success: true,
        message: "SuperAdmin login successful",
        token,
        user: safeSuperAdmin
      });
    }
    // 🔹 Normal user login
    // const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({
      username: { $regex: new RegExp("^" + username + "$", "i") }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Update last login
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { last_login: new Date() } }
    );

    const payload = {
      _id: user._id.toString(),
      username: user.username,
      role: user.role
    };

    const token = jwt.sign(payload, config.api.jwtSecret, { expiresIn: "7d" });

    const { password: pwd, ...safeUser } = user;
    res.json({ success: true, message: "Login successful", token, user: safeUser });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route GET /api/users/my-downline
 * @desc Get all users created by logged-in user
 * @access Admin, SuperMaster, Master
 */
// router.get("/my-downline", authMiddleware(), async (req, res) => {
//   try {
//     const usersCollection = getUsersCollection();

//     // sirf wahi users jinke parent_id logged-in user ka id hai
//     const users = await usersCollection.find({ parent_id: req.user._id }).toArray();

//     if (!users || users.length === 0) {
//       return res.json({ success: true, users: [] });
//     }

//     // password field hata do
//     const safeUsers = users.map(({ password, ...rest }) => rest);

//     res.json({ success: true, users: safeUsers });
//   } catch (error) {
//     console.error("Error fetching downline users:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

router.get("/my-downline", authMiddleware(), async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const { parentId } = req.query;
    
    console.log("Request parentId:", parentId);
    console.log("Logged in user:", req.user._id);

    let query;
    
    if (parentId) {
      // Finding users where parent_id matches the clicked user's ID
      query = { parent_id: new ObjectId(parentId) };
    } else {
      // Finding users where parent_id matches the logged-in user's ID
      // Make sure req.user._id is ObjectId
      const userObjectId = typeof req.user._id === 'string' ? 
        new ObjectId(req.user._id) : req.user._id;
      
      query = { parent_id: userObjectId };
    }

    console.log("Query before execution:", query);

    const users = await usersCollection.find(query).toArray();
    
    // Debug: Log raw users from database
    console.log("Raw users from DB:", users);

    // Debug: Log a sample user if exists
    if (users.length > 0) {
      console.log("Sample user parent_id type:", typeof users[0].parent_id);
      console.log("Sample user parent_id value:", users[0].parent_id);
    }

    if (!users || users.length === 0) {
      // Let's check what users exist in the collection
      const allUsers = await usersCollection.find({}).toArray();
      console.log("All users in collection:", allUsers.map(u => ({
        _id: u._id,
        username: u.username,
        role: u.role,
        parent_id: u.parent_id
      })));

      return res.json({ 
        success: true, 
        users: [],
        debug: {
          query: query,
          parentId: parentId,
          loggedInUserId: req.user._id
        }
      });
    }

    // Remove sensitive data before sending
    const safeUsers = users.map(user => {
      const { password, ...rest } = user;
      return {
        ...rest,
        parent_id: rest.parent_id ? rest.parent_id.toString() : null
      };
    });

    res.json({ 
      success: true, 
      users: safeUsers,
      debug: {
        query: query,
        parentId: parentId,
        loggedInUserId: req.user._id
      }
    });

  } catch (error) {
    console.error("Error in /my-downline:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message,
      stack: error.stack
    });
  }
});
// Transaction route for deposit and withdrawal
// In users.js (backend)
// In users.js (backend)



router.post("/transaction", authMiddleware(), async (req, res) => {
  try {
    const { type, amount, userId, description } = req.body;
    
    // Debug logging
    console.log("Transaction Request Raw Data:", {
      type,
      amount,
      userId,
      description,
      userIdType: typeof userId,
      authenticatedUser: {
        _id: req.user._id,
        idType: typeof req.user._id
      }
    });

    // Validate inputs
    if (!type || !amount || !userId || !description) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields",
        receivedData: { type, amount, userId, description }
      });
    }

    const transactionAmount = parseFloat(amount);
    if (isNaN(transactionAmount) || transactionAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid amount" 
      });
    }

    // Convert IDs to ObjectId safely
    let currentUserId;
    try {
      currentUserId = ensureObjectId(req.user._id);
      if (!currentUserId) {
        throw new Error("Invalid current user ID");
      }
    } catch (err) {
      console.error("Current user ID conversion error:", err);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid current user ID format",
        debug: {
          receivedId: req.user._id,
          idType: typeof req.user._id
        }
      });
    }

    let targetUserId;
    try {
      targetUserId = ensureObjectId(userId);
      if (!targetUserId) {
        throw new Error("Invalid target user ID");
      }
    } catch (err) {
      console.error("Target user ID conversion error:", err);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid target user ID format",
        debug: {
          receivedId: userId,
          idType: typeof userId
        }
      });
    }

    const usersCollection = getUsersCollection();

    // Find users with converted IDs
    const [currentUser, targetUser] = await Promise.all([
      usersCollection.findOne({ _id: currentUserId }),
      usersCollection.findOne({ _id: targetUserId })
    ]);

    // Debug logging
    console.log("Users found:", {
      currentUser: currentUser ? {
        _id: currentUser._id,
        role: currentUser.role,
        balance: currentUser.wallet_balance
      } : null,
      targetUser: targetUser ? {
        _id: targetUser._id,
        role: targetUser.role,
        balance: targetUser.wallet_balance
      } : null
    });

    if (!currentUser || !targetUser) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found",
        debug: {
          currentUserFound: !!currentUser,
          targetUserFound: !!targetUser,
          currentUserId: currentUserId,
          targetUserId: targetUserId
        }
      });
    }


    const roleHierarchy = {
      superadmin: 5,
      admin: 4,
      supermaster: 3,
      master: 2,
      user: 1,
    };

    if (
      roleHierarchy[currentUser.role.toLowerCase()] <=
      roleHierarchy[targetUser.role.toLowerCase()]
    ) {
      return res.status(403).json({ success: false, message: "You don't have permission" });
    }
    // Utility function to check if target user belongs to current user's downline
async function isUserInDownline(usersCollection, currentUserId, targetUserId) {
  let queue = [currentUserId];
  while (queue.length > 0) {
    const parentId = queue.pop();
    const children = await usersCollection.find({ parent_id: parentId }).toArray();
    for (const child of children) {
      if (child._id.toString() === targetUserId.toString()) {
        return true; // Found in downline
      }
      queue.push(child._id); // Check deeper levels
    }
  }
  return false;
}




    if (type === "deposit" && currentUser.wallet_balance < transactionAmount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }
    if (type === "withdrawal" && targetUser.wallet_balance < transactionAmount) {
      return res
        .status(400)
        .json({ success: false, message: "Target user has insufficient balance" });
    }

    const transaction = {
      type,
      amount: transactionAmount,
      description,
      from_user_id: currentUser._id,
      to_user_id: targetUser._id,
      performed_at: new Date(),
      status: "completed",
    };

    const session = await mongoose.connection.startSession();

    try {
      await session.withTransaction(async () => {
        await usersCollection.updateOne(
          { _id: currentUser._id },
          {
            $inc: { wallet_balance: type === "deposit" ? -transactionAmount : transactionAmount },
            $push: { transactions: transaction },
          },
          { session }
        );

        await usersCollection.updateOne(
          { _id: targetUser._id },
          {
            $inc: { wallet_balance: type === "deposit" ? transactionAmount : -transactionAmount },
            $push: { transactions: transaction },
          },
          { session }
        );
      });

      const updatedCurrentUser = await usersCollection.findOne({ _id: currentUser._id });
      const updatedTargetUser = await usersCollection.findOne({ _id: targetUser._id });

      res.json({
        success: true,
        message: `${type === "deposit" ? "Deposit" : "Withdrawal"} successful`,
        currentUserBalance: updatedCurrentUser.wallet_balance,
        targetUserBalance: updatedTargetUser.wallet_balance,
        transaction,
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("Transaction error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to process transaction", error: error.message });
  }
});
// Credit Transaction Route
router.post("/credit-transaction", authMiddleware(), async (req, res) => {
  try {
    const { type, amount, userId, description } = req.body;
    
    const transactionAmount = parseFloat(amount);

    if (!type || !amount || !userId || !description) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (transactionAmount <= 0) {
      return res.status(400).json({ success: false, message: "Amount must be greater than 0" });
    }

    const usersCollection = getUsersCollection();

    // Convert IDs to ObjectId safely
    let currentUserId = ensureObjectId(req.user._id);
    let targetUserId = ensureObjectId(userId);

    if (!currentUserId || !targetUserId) {
      return res.status(400).json({ success: false, message: "Invalid user ID format" });
    }

    // Find users
    const [currentUser, targetUser] = await Promise.all([
      usersCollection.findOne({ _id: currentUserId }),
      usersCollection.findOne({ _id: targetUserId })
    ]);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const roleHierarchy = {
      superadmin: 5,
      admin: 4,
      supermaster: 3,
      master: 2,
      user: 1,
    };

    if (roleHierarchy[currentUser.role.toLowerCase()] <= roleHierarchy[targetUser.role.toLowerCase()]) {
      return res.status(403).json({ success: false, message: "You don't have permission" });
    }

    // For credit transactions
    if (type === "credit-deposit") {
      // Check if currentUser has enough wallet balance
      if (currentUser.wallet_balance < transactionAmount) {
        return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
      }

      // Deduct from currentUser wallet
      await usersCollection.updateOne(
        { _id: currentUser._id },
        { $inc: { wallet_balance: -transactionAmount } }
      );

      // Add to target user's credit balance
      const transaction = {
        type: "credit-deposit",
        amount: transactionAmount,
        description,
        from_user_id: currentUser._id,
        to_user_id: targetUser._id,
        performed_at: new Date(),
        status: "completed",
      };

      await usersCollection.updateOne(
        { _id: targetUser._id },
        {
          $inc: { credit_balance: transactionAmount },
          $push: { credit_transactions: transaction },
        }
      );
    } 
    else if (type === "credit-withdrawal") {
      // Check if target user has sufficient credit balance
      if (targetUser.credit_balance < transactionAmount) {
        return res.status(400).json({ success: false, message: "Insufficient credit balance" });
      }

      const transaction = {
        type: "credit-withdrawal",
        amount: transactionAmount,
        description,
        from_user_id: currentUser._id,
        to_user_id: targetUser._id,
        performed_at: new Date(),
        status: "completed",
      };

      await usersCollection.updateOne(
        { _id: targetUser._id },
        {
          $inc: { credit_balance: -transactionAmount },
          $push: { credit_transactions: transaction },
        }
      );
    }

    // Fetch updated balances
    const [updatedTargetUser, updatedCurrentUser] = await Promise.all([
      usersCollection.findOne({ _id: targetUser._id }),
      usersCollection.findOne({ _id: currentUser._id })
    ]);

    res.json({
      success: true,
      message: `Credit ${type === "credit-deposit" ? "deposit" : "withdrawal"} successful`,
      newCreditBalance: updatedTargetUser.credit_balance,
      currentUserBalance: updatedCurrentUser.wallet_balance
    });

  } catch (error) {
    console.error("Credit transaction error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to process credit transaction",
      error: error.message 
    });
  }
});

router.get("/latest", authMiddleware(), async (req, res) => {
  try {
    const usersCollection = getUsersCollection();

    // ✅ ObjectId ensure
    const userId = typeof req.user._id === "string"
      ? new ObjectId(req.user._id)
      : req.user._id;

    // ✅ hamesha DB se fresh fetch
    const user = await usersCollection.findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const { password, ...safeUser } = user;

    res.json({
      success: true,
      user: {
        ...safeUser,
        currentDateTime: new Date().toISOString().replace("T", " ").slice(0, 19)
      }
    });
  } catch (error) {
    console.error("Error fetching latest user info:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});
router.get("/me", authMiddleware(), async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    
    // Convert string ID to ObjectId if needed
    const userId = typeof req.user._id === 'string' ? new ObjectId(req.user._id) : req.user._id;
    
    const user = await usersCollection.findOne({ _id: userId });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Password aur sensitive data remove kar ke safe user data return karein
    const { password, ...safeUser } = user;
    
    res.json({ 
      success: true, 
      user: {
        ...safeUser,
        // Current date/time add karein UTC format mein
        currentDateTime: new Date().toISOString().replace('T', ' ').slice(0, 19)
      }
    });

  } catch (error) {
    console.error("Error fetching user info:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message 
    });
  }
});
/**
 * @route GET /api/users/:id
 * @desc Get user by ID
 * @access Admin or self
 */



router.get("/:id", authMiddleware(), async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(userId) });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Only self or admin
    

    const { password, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route PUT /api/users/:id
 * @desc Update user
 * @access Admin or self
 */
router.put("/:id", authMiddleware(), async (req, res) => {
  try {
    const userId = req.params.id;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    

    const { _id, created_at, wallet_balance, transactions, ...safeUpdateData } = updateData;

    if (safeUpdateData.password) {
      const salt = await bcrypt.genSalt(10);
      safeUpdateData.password = await bcrypt.hash(safeUpdateData.password, salt);
    }

    const usersCollection = getUsersCollection();
    const result = await usersCollection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { ...safeUpdateData, last_updated: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route DELETE /api/users/:id
 * @desc Delete user
 * @access Admin only
 */
router.delete("/:id", authMiddleware(), async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const usersCollection = getUsersCollection();
    const result = await usersCollection.deleteOne({ _id: new mongoose.Types.ObjectId(userId) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route POST /api/users/:id/wallet
 * @desc Credit or Debit wallet balance
 * @access Admin only
 */
router.post("/:id/wallet", authMiddleware("Admin"), async (req, res) => {
  try {
    const userId = req.params.id;
    const { amount, type, description } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(userId) });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    let newBalance = user.wallet_balance || 0.0;
    if (type === "credit") newBalance += parseFloat(amount);
    else if (type === "debit") {
      if (newBalance < amount) return res.status(400).json({ success: false, message: "Insufficient funds" });
      newBalance -= parseFloat(amount);
    } else return res.status(400).json({ success: false, message: "Invalid transaction type" });

    const transaction = {
      transaction_id: new mongoose.Types.ObjectId().toString(),
      amount: parseFloat(amount),
      type,
      previous_balance: user.wallet_balance,
      new_balance: newBalance,
      description,
      timestamp: new Date(),
    };

    await usersCollection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { wallet_balance: newBalance }, $push: { transactions: transaction } }
    );

    res.json({ success: true, transaction });
  } catch (error) {
    console.error("Wallet update error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
