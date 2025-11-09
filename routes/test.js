/**
 * User API Routes (with JWT, roles + wallet)
 * Fully secured and extended
 */


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







    


/**
 */



