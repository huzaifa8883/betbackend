// orders.js (backend route)
const express = require("express");
const axios = require("axios");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");
const config = require("../config");
let orders = [];

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
const getUsersCollection = () => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB connection not established");
  }
  return mongoose.connection.db.collection(config.database.collections.users);
};




// const APP_KEY = '8sCvSYczC1qAr27v'; // ✅ your actual Betfair App Key
// const USERNAME = 'latifsohu@hotmail.com'; // ✅ your Betfair username
// const PASSWORD = 'Bahria@2026'; // ✅ your Betfair password

const USERNAME = process.env.BETFAIR_USERNAME
const PASSWORD = process.env.BETFAIR_PASSWORD
const APP_KEY = process.env.BETFAIR_APP_KEY
// console.log('Username:', USERNAME);
// console.log('Password:', PASSWORD ? '******' : 'No Password');
// console.log('App Key:', APP_KEY);

// // 🔐 Get session token from Betfair login API


  

// 🚀 Fetch live
//  markets (auto-login)


const eventTypeMap = {
  1: "Football",       // Football
  2: "Tennis",
  4: "Cricket",
  7: "Horse Racing",
  4339: "Greyhound",
  // ... aur jo chahe add karo
};


// 🚀 Fetch live markets for multiple sports

let cachedSessionToken = null;
let tokenExpiryTime = null;  // timestamp jab token expire ho jayega

async function getSessionToken() {
  const now = Date.now();

  // Agar token exist karta hai aur expire nahi hua
  if (cachedSessionToken && tokenExpiryTime && now < tokenExpiryTime) {
    return cachedSessionToken;
  }

  // Naya token generate karo
  try {
    const response = await axios.post(
      'https://identitysso.betfair.com/api/login',
      new URLSearchParams({
        username: USERNAME,
        password: PASSWORD
      }),
      {
        headers: {
          'X-Application': APP_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const data = response.data;

    if (data.status === 'SUCCESS') {
      cachedSessionToken = data.token;

      // Token ki expiry approx 30 mins hoti hai, aap Betfair docs check karen
      tokenExpiryTime = now + 29 * 60 * 1000; // 29 minutes baad expire kar do

      console.log('New session token generated');

      return cachedSessionToken;
    } else {
      throw new Error(`Login failed: ${data.error}`);
    }
  } catch (err) {
    console.error('❌ Failed to login to Betfair:', err.message);
    throw err;
  }
}
const sportMapById = {
  1: "Soccer",
  2: "Tennis", 
  4: "Cricket",
  7: "Horse Racing",
  4339: "Greyhound Racing",
  61420: "Football",
  2378961: "Tennis",
  4: "Cricket",
  7524: "Basketball",
  468328: "Volleyball",
  7522: "Ice Hockey"
};

async function getEventDetailsFromBetfair(marketId) {
  try {
    const sessionToken = await getSessionToken();

    const response = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [{
        jsonrpc: '2.0',
        method: 'SportsAPING/v1.0/listMarketCatalogue',
        params: {
          filter: { marketIds: [marketId] },
          maxResults: '1',
          marketProjection: ['EVENT', 'EVENT_TYPE'] // Add EVENT_TYPE to projection
        },
        id: 1
      }],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Betfair API Response:', JSON.stringify(response.data, null, 2)); // Debug log

    const market = response.data[0]?.result?.[0];
    if (!market || !market.event) {
      console.log('No market data found for marketId:', marketId);
      return { eventName: "Unknown Event", category: "Other" };
    }

    const eventName = market.event.name;
    const eventTypeId = market.eventType.id.toString();
    const category = sportMapById[eventTypeId] || market.eventType.name || "Other";

    console.log('Processed Event Details:', { 
      marketId,
      eventName, 
      eventTypeId,
      category
    });

    return { eventName, category };

  } catch (err) {
    console.error("Betfair API error for marketId:", marketId, err.response?.data || err.message);
    return { eventName: "Unknown Event", category: "Other" };
  }
}
  




const BETFAIR_API = "https://api.betfair.com/exchange/betting/json-rpc/v1";

// 📡 Fetch runner data
async function getMarketBookFromBetfair(marketId, selectionId) {
  try {
    const sessionToken = await getSessionToken();

    const body = [
      {
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketBook",
        params: {
          marketIds: [marketId],
          priceProjection: {
            priceData: ["EX_BEST_OFFERS"],
            virtualise: true
          }
        },
        id: 1
      }
    ];

    const response = await axios.post(BETFAIR_API, body, {
      headers: {
        "X-Application": APP_KEY,
        "X-Authentication": sessionToken,
        "Content-Type": "application/json"
      }
    });

    const marketBooks = response.data[0]?.result || [];
    if (!marketBooks.length) return null;

    const runner = marketBooks[0].runners.find(r => r.selectionId === selectionId);
    return runner || null;
  } catch (err) {
    console.error("❌ Betfair MarketBook error:", err.response?.data || err.message);
    return null;
  }
}

/* ---------------- Matching Engine ---------------- */
function checkMatch(order, runner) {
  let matchedSize = 0;
  let status = "PENDING";
  let executedPrice = order.price;

  const backs = runner.ex.availableToBack || [];
  const lays = runner.ex.availableToLay || [];

  // BACK BET LOGIC
  if (order.type === "BACK" || order.side === "B") {
    if (backs.length > 0) {
      const backPrices = backs.map(b => b.price);
      const highestBack = Math.max(...backPrices);
      const lowestBack = Math.min(...backPrices);
      const selectedPrice = Number(order.price);

      // Rule 1: If selected odd ≤ smallest available odd → MATCHED
      if (selectedPrice <= lowestBack) {
        // Match at highest available back odd
        executedPrice = highestBack;
        matchedSize = order.size;
        status = "MATCHED";
      }
      // Rule 2: If selected odd > largest available odd → PENDING
      else if (selectedPrice > highestBack) {
        status = "PENDING";
      }
      // Rule 3: If selected odd is between current odds → MATCHED at highest available back odd
      else {
        // Selected odd is between lowestBack and highestBack
        executedPrice = highestBack;
        matchedSize = order.size;
        status = "MATCHED";
      }
    } else {
      // No back odds available, keep as pending
      status = "PENDING";
    }
  }

  // LAY BET LOGIC (opposite of back)
  else if (order.type === "LAY" || order.side === "L") {
    if (lays.length > 0) {
      const layPrices = lays.map(l => l.price);
      const lowestLay = Math.min(...layPrices);
      const highestLay = Math.max(...layPrices);
      const selectedPrice = Number(order.price);

      // Rule 1: If selected odd ≥ largest available odd → MATCHED
      if (selectedPrice >= highestLay) {
        // Match at lowest available lay odd
        executedPrice = lowestLay;
        matchedSize = order.size;
        status = "MATCHED";
      }
      // Rule 2: If selected odd < smallest available odd → PENDING
      else if (selectedPrice < lowestLay) {
        status = "PENDING";
      }
      // Rule 3: If selected odd is between current odds → MATCHED at lowest available lay odd
      else {
        // Selected odd is between lowestLay and highestLay
        executedPrice = lowestLay;
        matchedSize = order.size;
        status = "MATCHED";
      }
    } else {
      // No lay odds available, keep as pending
      status = "PENDING";
    }
  }

  return { matchedSize, status, executedPrice };
}

/* ---------------- Auto-match Pending Bets ---------------- */
async function autoMatchPendingBets(marketId, selectionId) {
  try {
    const usersCollection = getUsersCollection();
    const runner = await getMarketBookFromBetfair(marketId, selectionId);
    if (!runner) return;

    // Find all users with pending bets for this market/selection
    const users = await usersCollection.find({
      "orders.marketId": marketId,
      "orders.selectionId": selectionId,
      "orders.status": "PENDING"
    }).toArray();

    for (const user of users) {
      const pendingBets = (user.orders || []).filter(
        o => o.marketId === marketId && 
             o.selectionId === selectionId && 
             o.status === "PENDING"
      );

      for (const bet of pendingBets) {
        const { matchedSize, status, executedPrice } = checkMatch(bet, runner);

        if (status === "MATCHED") {
          // Update bet to matched
          await usersCollection.updateOne(
            { _id: user._id, "orders.requestId": bet.requestId },
            {
              $set: {
                "orders.$.matched": matchedSize,
                "orders.$.status": "MATCHED",
                "orders.$.price": executedPrice,
                "orders.$.updated_at": new Date()
              }
            }
          );

          // Recalculate liability after matching
          await recalculateUserLiableAndPnL(user._id);

          // Notify via socket
          if (global.io) {
            global.io.to("match_" + marketId).emit("ordersUpdated", {
              userId: user._id,
              newOrders: [{ ...bet, matched: matchedSize, status: "MATCHED", price: executedPrice }]
            });
          }

          console.log(`✅ Auto-matched pending bet ${bet.requestId} for user ${user._id}`);
        }
      }
    }
  } catch (err) {
    console.error("❌ Auto-match pending bets error:", err);
  }
}




// GET /orders/event
router.get("/event", (req, res) => {
  try {
    const { eventId, marketId, maxResults, token } = req.query;

    if (!token) {
      return res.status(401).json({ error: "Invalid session" });
    }

    // filter orders by eventId & marketId
    let filtered = orders.filter(o => 
      (!eventId || o.eventId == eventId) && 
      (!marketId || o.marketId == marketId)
    );

    if (maxResults && parseInt(maxResults) > 0) {
      filtered = filtered.slice(0, parseInt(maxResults));
    }

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/// POST /orders
// router.post("/", authMiddleware(), async (req, res) => {
//   try {
//     const user = req.user;
//     if (!user || user.role !== "User") {
//       return res.status(403).json({ error: "Only users can place bets" });
//     }

//     const orders = req.body;
//     if (!Array.isArray(orders) || orders.length === 0) {
//       return res.status(400).json({ error: "Orders must be an array" });
//     }

//     const usersCollection = getUsersCollection();
//     const dbUser = await usersCollection.findOne({ _id: new ObjectId(user._id) });
//     if (!dbUser) return res.status(404).json({ error: "User not found" });

//     /* ---------------- Add Event Details ---------------- */
//     await Promise.all(
//       orders.map(async (order) => {
//         const { eventName, category } = await getEventDetailsFromBetfair(order.marketId);
//         order.event = eventName;
//         order.category = category;
//       })
//     );

//     /* ---------------- Normalize Orders ---------------- */
//     const normalizedOrders = orders.map(order => {
//       const price = parseFloat(order.price);
//       const size = parseFloat(order.size);

//       // 🧮 Liable calculation
//       // Back bet -> liable = stake
//       // Lay bet -> liable = (price - 1) * stake
//       const liable = order.side === "B" ? size : (price - 1) * size;

//       return {
//         ...order,
//         price,
//         size,
//         type: order.side === "B" ? "BACK" : "LAY",
//         position: order.side === "B" ? "BACK" : "LAY",
//         status: "PENDING",
//         matched: 0,
//         requestId: Date.now() + Math.floor(Math.random() * 1000),
//         userId: user._id,
//         created_at: new Date(),
//         updated_at: new Date(),
//         liable
//       };
//     });

//     /* ---------------- Balance Check ---------------- */
//     const totalLiability = normalizedOrders.reduce((sum, o) => sum + o.liable, 0);
//     if (dbUser.wallet_balance < totalLiability) {
//       return res.status(400).json({ error: "Insufficient balance" });
//     }

//     /* ---------------- Deduct Liable & Save Orders ---------------- */
//     /* ---------------- Deduct Liable & Save Orders ---------------- */
// await usersCollection.updateOne(
//   { _id: new ObjectId(user._id) },
//   {
//     $inc: { 
//       wallet_balance: -totalLiability,
//       liable: totalLiability   // 🔥 Yeh add karo
//     },
//     $push: {
//       transactions: {
//         type: "BET_PLACED",
//         amount: -totalLiability,
//         created_at: new Date()
//       },
//       orders: { $each: normalizedOrders }
//     }
//   }
// );

//     /* ---------------- Run Matching ---------------- */
//     for (let order of normalizedOrders) {
//       const runner = await getMarketBookFromBetfair(order.marketId, order.selectionId);
//       if (!runner) continue;

//       const { matchedSize, status, executedPrice } = checkMatch(order, runner);

//       await usersCollection.updateOne(
//         { _id: new ObjectId(user._id), "orders.requestId": order.requestId },
//         {
//           $set: {
//             "orders.$.matched": matchedSize,
//             "orders.$.status": status,
//             "orders.$.price": executedPrice,
//             "orders.$.updated_at": new Date()
//           }
//         }
//       );
//     }

//     /* ---------------- Recheck Unmatched Orders ---------------- */
//     const freshUser = await usersCollection.findOne({ _id: new ObjectId(user._id) });
//     for (let order of freshUser.orders.filter(o => o.status === "UNMATCHED")) {
//       const runner = await getMarketBookFromBetfair(order.marketId, order.selectionId);
//       if (!runner) continue;

//       const { matchedSize, status, executedPrice } = checkMatch(order, runner);

//       if (status === "MATCHED") {
//         await usersCollection.updateOne(
//           { _id: new ObjectId(user._id), "orders.requestId": order.requestId },
//           {
//             $set: {
//               "orders.$.matched": matchedSize,
//               "orders.$.status": status,
//               "orders.$.price": executedPrice,
//               "orders.$.updated_at": new Date()
//             }
//           }
//         );

//         // 🔥 Notify via socket
//         global.io.to("match_" + order.marketId).emit("ordersUpdated", {
//           userId: user._id,
//           newOrders: [{ ...order, matched: matchedSize, status, price: executedPrice }]
//         });
//       }
//     }

//     res.status(202).json(normalizedOrders);
//   } catch (err) {
//     console.error("❌ Bet place error:", err);
//     res.status(500).json({ error: err.message });
//   }
// });
// router.post("/", authMiddleware(), async (req, res) => {
//   try {
//     const user = req.user;
//     if (!user || user.role !== "User") {
//       return res.status(403).json({ error: "Only users can place bets" });
//     }

//     const orders = req.body;
//     if (!Array.isArray(orders) || orders.length === 0) {
//       return res.status(400).json({ error: "Orders must be an array" });
//     }

//     const usersCollection = getUsersCollection();
//     const dbUser = await usersCollection.findOne({ _id: new ObjectId(user._id) });
//     if (!dbUser) return res.status(404).json({ error: "User not found" });

//     /* ---------------- Calculate available balance ---------------- */
//     const walletBalance = dbUser.wallet_balance || 0;

//     // 🧮 Team-wise profit (from stored runnerPnL or similar)
//     // Positive profit counts, negative ignored
//     const teamProfits = Object.values(dbUser.runnerPnL || {}).filter(p => p > 0);
//     const totalPositiveProfit = teamProfits.reduce((a, b) => a + b, 0);

//     // ✅ Only positive profit can be added for lay betting
//     const availableForLay = walletBalance + totalPositiveProfit;

//     /* ---------------- Add Event Details ---------------- */
//     await Promise.all(
//       orders.map(async (order) => {
//         const { eventName, category } = await getEventDetailsFromBetfair(order.marketId);
//         order.event = eventName;
//         order.category = category;
//       })
//     );

//     /* ---------------- Normalize Orders ---------------- */
//     const normalizedOrders = orders.map(order => {
//       const price = parseFloat(order.price);
//       const size = parseFloat(order.size);
//       const liable = order.side === "B" ? size : (price - 1) * size;

//       return {
//         ...order,
//         price,
//         size,
//         type: order.side === "B" ? "BACK" : "LAY",
//         position: order.side === "B" ? "BACK" : "LAY",
//         status: "PENDING",
//         matched: 0,
//         requestId: Date.now() + Math.floor(Math.random() * 1000),
//         userId: user._id,
//         created_at: new Date(),
//         updated_at: new Date(),
//         liable
//       };
//     });

//     /* ---------------- Balance Check ---------------- */
//     let totalBackLiability = 0;
//     let totalLayLiability = 0;

//     for (const order of normalizedOrders) {
//       if (order.side === "B") totalBackLiability += order.liable;
//       else if (order.side === "L") totalLayLiability += order.liable;
//     }

//     // 🧩 BACK bets → only wallet balance used
//     if (totalBackLiability > walletBalance) {
//       return res.status(400).json({ error: "Insufficient wallet balance for BACK bets" });
//     }

//     // 🧩 LAY bets → can use wallet + positive profit only
//     if (totalLayLiability > availableForLay) {
//       return res.status(400).json({ error: "Insufficient funds (wallet + positive profit) for LAY bets" });
//     }

//     // 🧮 Total liability deduction (wallet only)
//     const totalLiability = Math.min(walletBalance, totalBackLiability + totalLayLiability);

//     await usersCollection.updateOne(
//       { _id: new ObjectId(user._id) },
//       {
//         $inc: {
//           wallet_balance: -totalLiability,
//           liable: totalLiability
//         },
//         $push: {
//           transactions: {
//             type: "BET_PLACED",
//             amount: -totalLiability,
//             created_at: new Date()
//           },
//           orders: { $each: normalizedOrders }
//         }
//       }
//     );

//     /* ---------------- Run Matching ---------------- */
//     for (let order of normalizedOrders) {
//       const runner = await getMarketBookFromBetfair(order.marketId, order.selectionId);
//       if (!runner) continue;

//       const { matchedSize, status, executedPrice } = checkMatch(order, runner);

//       await usersCollection.updateOne(
//         { _id: new ObjectId(user._id), "orders.requestId": order.requestId },
//         {
//           $set: {
//             "orders.$.matched": matchedSize,
//             "orders.$.status": status,
//             "orders.$.price": executedPrice,
//             "orders.$.updated_at": new Date()
//           }
//         }
//       );
//     }

//     /* ---------------- Recheck Unmatched Orders ---------------- */
//     const freshUser = await usersCollection.findOne({ _id: new ObjectId(user._id) });
//     for (let order of freshUser.orders.filter(o => o.status === "UNMATCHED")) {
//       const runner = await getMarketBookFromBetfair(order.marketId, order.selectionId);
//       if (!runner) continue;

//       const { matchedSize, status, executedPrice } = checkMatch(order, runner);

//       if (status === "MATCHED") {
//         await usersCollection.updateOne(
//           { _id: new ObjectId(user._id), "orders.requestId": order.requestId },
//           {
//             $set: {
//               "orders.$.matched": matchedSize,
//               "orders.$.status": status,
//               "orders.$.price": executedPrice,
//               "orders.$.updated_at": new Date()
//             }
//           }
//         );

//         global.io.to("match_" + order.marketId).emit("ordersUpdated", {
//           userId: user._id,
//           newOrders: [{ ...order, matched: matchedSize, status, price: executedPrice }]
//         });
//       }
//     }

//     res.status(202).json(normalizedOrders);
//   } catch (err) {
//     console.error("❌ Bet place error:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// --- Route: place bets ---
// router.post("/", authMiddleware(), async (req, res) => {
//   try {
//     const user = req.user;
//     if (!user || user.role !== "User") {
//       return res.status(403).json({ error: "Only users can place bets" });
//     }

//     const orders = req.body;
//     if (!Array.isArray(orders) || orders.length === 0) {
//       return res.status(400).json({ error: "Orders must be an array" });
//     }

//     const usersCollection = getUsersCollection();
//     const dbUser = await usersCollection.findOne({ _id: new ObjectId(user._id) });
//     if (!dbUser) return res.status(404).json({ error: "User not found" });

//     /* ---------------- Wallet & Profit Calculation ---------------- */
//     const walletBalance = dbUser.wallet_balance || 0;
//     const teamProfits = Object.values(dbUser.runnerPnL || {}).filter(p => p > 0);
//     const totalPositiveProfit = teamProfits.reduce((a, b) => a + b, 0);
//     const availableForLay = walletBalance + totalPositiveProfit;

//     /* ---------------- Add Event Info ---------------- */
//     await Promise.all(
//       orders.map(async (order) => {
//         const { eventName, category } = await getEventDetailsFromBetfair(order.marketId);
//         order.event = eventName;
//         order.category = category;
//       })
//     );

//     /* ---------------- Normalize Orders ---------------- */
//     const normalizedOrders = orders.map((order) => {
//       const price = parseFloat(order.price);
//       const size = parseFloat(order.size);
//       const liable = order.side === "B" ? size : (price - 1) * size;
//       return {
//         ...order,
//         price,
//         size,
//         liable,
//         type: order.side === "B" ? "BACK" : "LAY",
//         position: order.side === "B" ? "BACK" : "LAY",
//         status: "PENDING",
//         matched: 0,
//         requestId: Date.now() + Math.floor(Math.random() * 1000),
//         userId: user._id,
//         created_at: new Date(),
//         updated_at: new Date(),
//       };
//     });

//     /* ---------------- Basic pre-check for immediate available funds ----------------
//        We do a conservative check based on immediate liability if you want,
//        but final wallet update will be done by recalc (so we avoid double changes).
//     */
//     // (Optional quick check) compute a tentative teamWisePnL including these new orders
//     const tentativeAll = [...(dbUser.orders || []), ...normalizedOrders];
//     const tentativeSelections = [...new Set(tentativeAll.map(b => String(b.selectionId)))];
//     const tentativeTeamPnL = {};
//     for (const s of tentativeSelections) tentativeTeamPnL[s] = 0;
//     for (const bet of tentativeAll) {
//       const sel = String(bet.selectionId);
//       const { side, price, size } = bet;
//       if (side === "B") {
//         tentativeTeamPnL[sel] += (price - 1) * size;
//         tentativeSelections.forEach(o => { if (o !== sel) tentativeTeamPnL[o] -= size; });
//       } else {
//         tentativeTeamPnL[sel] -= (price - 1) * size;
//         tentativeSelections.forEach(o => { if (o !== sel) tentativeTeamPnL[o] += size; });
//       }
//     }
//     let tentativeLiability = 0;
//     for (const v of Object.values(tentativeTeamPnL)) if (v < 0) tentativeLiability += Math.abs(v);
//     if (tentativeLiability > availableForLay) {
//       return res.status(400).json({ error: "Insufficient funds for this bet (tentative check)" });
//     }

//     /* ---------------- Save orders & transaction (no wallet/liable change here) ---------------- */
//     await usersCollection.updateOne(
//       { _id: new ObjectId(user._id) },
//       {
//         $push: {
//           orders: { $each: normalizedOrders },
//           transactions: {
//             type: "BET_PLACED",
//             amount: 0 - tentativeLiability, // record intent (optional) — not applied to wallet here
//             created_at: new Date()
//           }
//         }
//       }
//     );

//     /* ---------------- Run Matching for these new orders ---------------- */
//     for (let order of normalizedOrders) {
//       const runner = await getMarketBookFromBetfair(order.marketId, order.selectionId);
//       if (!runner) continue;

//       const { matchedSize, status, executedPrice } = checkMatch(order, runner);

//       await usersCollection.updateOne(
//         { _id: new ObjectId(user._id), "orders.requestId": order.requestId },
//         {
//           $set: {
//             "orders.$.matched": matchedSize,
//             "orders.$.status": status,
//             "orders.$.price": executedPrice,
//             "orders.$.updated_at": new Date()
//           }
//         }
//       );

//       if (status === "MATCHED") {
//         global.io.to("match_" + order.marketId).emit("ordersUpdated", {
//           userId: user._id,
//           newOrders: [{ ...order, matched: matchedSize, status, price: executedPrice }]
//         });
//       }
//     }

//     /* ---------------- Recalculate full liability & adjust wallet once (ALL active orders) ---------------- */
//     // This function will compute liability across all (PENDING + MATCHED) orders and update wallet_balance and liable correctly.
//     await recalculateUserLiableAndPnL(user._id);

//     // Fetch fresh user to return accurate wallet/liable
//     const freshUser = await usersCollection.findOne({ _id: new ObjectId(user._id) });

//     res.status(202).json({
//       message: "Bet placed successfully",
//       totalLiability: freshUser.liable || 0,
//       wallet_balance: freshUser.wallet_balance || 0,
//       orders: normalizedOrders
//     });

//   } catch (err) {
//     console.error("❌ Bet place error:", err);
//     res.status(500).json({ error: err.message });
//   }
// });
router.post("/", authMiddleware(), async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== "User") {
      return res.status(403).json({ error: "Only users can place bets" });
    }

    const orders = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: "Orders must be an array" });
    }

    const usersCollection = getUsersCollection();
    const dbUser = await usersCollection.findOne({ _id: new ObjectId(user._id) });
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const walletBalance = dbUser.wallet_balance || 0;
    const teamProfits = Object.values(dbUser.runnerPnL || {}).filter(p => p > 0);
    const totalPositiveProfit = teamProfits.reduce((a, b) => a + b, 0);
    const availableForLay = walletBalance + totalPositiveProfit;

    await Promise.all(
      orders.map(async (order) => {
        const { eventName, category } = await getEventDetailsFromBetfair(order.marketId);
        order.event = eventName;
        order.category = category;
      })
    );

    const normalizedOrders = orders.map((order) => {
      const price = parseFloat(order.price);
      const size = parseFloat(order.size);
      const liable = order.side === "B" ? size : (price - 1) * size;
      return {
        ...order,
        price,
        size,
        liable,
        type: order.side === "B" ? "BACK" : "LAY",
        position: order.side === "B" ? "BACK" : "LAY",
        status: "PENDING",
        matched: 0,
        requestId: Date.now() + Math.floor(Math.random() * 1000),
        userId: user._id,
        created_at: new Date(),
        updated_at: new Date(),
      };
    });

    const tentativeAll = [...(dbUser.orders || []), ...normalizedOrders];
    const tentativeSelections = [...new Set(tentativeAll.map(b => String(b.selectionId)))];
    const tentativeTeamPnL = {};
    for (const s of tentativeSelections) tentativeTeamPnL[s] = 0;
    for (const bet of tentativeAll) {
      const sel = String(bet.selectionId);
      const { side, price, size } = bet;
      if (side === "B") {
        tentativeTeamPnL[sel] += (price - 1) * size;
        tentativeSelections.forEach(o => { if (o !== sel) tentativeTeamPnL[o] -= size; });
      } else {
        tentativeTeamPnL[sel] -= (price - 1) * size;
        tentativeSelections.forEach(o => { if (o !== sel) tentativeTeamPnL[o] += size; });
      }
    }
    let tentativeLiability = 0;
    for (const v of Object.values(tentativeTeamPnL)) if (v < 0) tentativeLiability += Math.abs(v);
    if (tentativeLiability > availableForLay) {
      return res.status(400).json({ error: "Insufficient funds for this bet (tentative check)" });
    }

    await usersCollection.updateOne(
      { _id: new ObjectId(user._id) },
      {
        $push: {
          orders: { $each: normalizedOrders },
          transactions: {
            type: "BET_PLACED",
            amount: 0 - tentativeLiability,
            created_at: new Date()
          }
        }
      }
    );

    for (let order of normalizedOrders) {
      const runner = await getMarketBookFromBetfair(order.marketId, order.selectionId);
      if (!runner) continue;

      const { matchedSize, status, executedPrice } = checkMatch(order, runner);

      await usersCollection.updateOne(
        { _id: new ObjectId(user._id), "orders.requestId": order.requestId },
        {
          $set: {
            "orders.$.matched": matchedSize,
            "orders.$.status": status,
            "orders.$.price": executedPrice,
            "orders.$.updated_at": new Date()
          }
        }
      );

      if (status === "MATCHED") {
        global.io.to("match_" + order.marketId).emit("ordersUpdated", {
          userId: user._id,
          newOrders: [{ ...order, matched: matchedSize, status, price: executedPrice }]
        });
      }
    }

    // 🔹 Run recalc in background to prevent frontend hanging
    recalculateUserLiableAndPnL(user._id)
      .then(() => console.log("✅ Liability recalculated for user:", user._id))
      .catch((err) => console.error("❌ Recalc error:", err));

    // 🔹 Check and auto-match any pending bets for the same market/selections
    const uniqueSelections = [...new Set(normalizedOrders.map(o => ({ marketId: o.marketId, selectionId: o.selectionId })))];
    for (const { marketId, selectionId } of uniqueSelections) {
      autoMatchPendingBets(marketId, selectionId).catch(err => 
        console.error("❌ Auto-match error:", err)
      );
    }

    // 🔹 Immediate response
    res.status(200).json({
      message: "Bet placed successfully",
      orders: normalizedOrders
    });

  } catch (err) {
    console.error("❌ Bet place error:", err);
    res.status(500).json({ error: err.message });
  }
});



// --- Helper: recalculateUserLiableAndPnL (uses ALL active orders) ---
async function recalculateUserLiableAndPnL(userId) {
  const usersCollection = getUsersCollection();
  const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
  if (!user) return;

  const allOrders = user.orders || [];

  const activeOrders = allOrders.filter(o =>
    ["PENDING", "MATCHED"].includes(o.status)
  );

  if (activeOrders.length === 0) {
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { liable: 0, runnerPnL: {}, wallet_balance: user.wallet_balance } }
    );
    return;
  }

  const markets = [...new Set(activeOrders.map(o => o.marketId))];
  let totalLiability = 0;
  const combinedRunnerPnL = {};

  for (const marketId of markets) {
    const marketOrders = activeOrders.filter(o => o.marketId === marketId);
    const selections = [...new Set(marketOrders.map(o => String(o.selectionId)))];
    const teamPnL = {};
    for (const s of selections) teamPnL[s] = 0;

    for (const bet of marketOrders) {
      const sel = String(bet.selectionId);
      const side = bet.side;
      // For MATCHED bets, price is already the executed price; for PENDING, it's the original selected price
      const price = Number(bet.price);
      // For MATCHED bets, use matched size (should equal full size); for PENDING, use original size
      const size = Number(bet.status === "MATCHED" ? (bet.matched || bet.size) : bet.size);

      if (side === "B") {
        teamPnL[sel] += (price - 1) * size;
        selections.forEach(o => { if (o !== sel) teamPnL[o] -= size; });
      } else if (side === "L") {
        teamPnL[sel] -= (price - 1) * size;
        selections.forEach(o => { if (o !== sel) teamPnL[o] += size; });
      }
    }

    let marketLiability = 0;

    // 🩵 FIXED SINGLE-RUNNER LOGIC
    if (selections.length === 1) {
      for (const b of marketOrders) {
        // For MATCHED bets, price is already the executed price; for PENDING, it's the original selected price
        const price = Number(b.price);
        // For MATCHED bets, use matched size (should equal full size); for PENDING, use original size
        const size = Number(b.status === "MATCHED" ? (b.matched || b.size) : b.size);
        if (b.side === "B") {
          marketLiability += size;
        } else if (b.side === "L") {
          marketLiability += (price - 1) * size;
        }
      }
    } else {
      // 🩵 MULTI-RUNNER LOGIC: Use MAX liability, not sum
      // If a single bet covers multiple runners, liability = max liability among all runners
      const runnerLiabilities = [];
      for (const [selectionId, pnl] of Object.entries(teamPnL)) {
        if (pnl < 0) {
          runnerLiabilities.push(Math.abs(pnl));
        }
      }
      
      if (runnerLiabilities.length > 0) {
        // Use the maximum liability among all runners
        marketLiability = Math.max(...runnerLiabilities);
      }
    }

    totalLiability += marketLiability;

    for (const [k, v] of Object.entries(teamPnL)) {
      combinedRunnerPnL[k] = (combinedRunnerPnL[k] || 0) + v;
    }
  }

  // Calculate wallet balance correctly: start from current wallet + old liability, then subtract new liability
  // This ensures we don't reset when placing bets on multiple runners
  const oldLiability = user.liable || 0;
  const baseWallet = user.wallet_balance || 0;
  const newWallet = Math.max(0, baseWallet + oldLiability - totalLiability);

  await usersCollection.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        wallet_balance: newWallet < 0 ? 0 : newWallet,
        liable: totalLiability,
        runnerPnL: combinedRunnerPnL
      }
    }
  );

  const fresh = await usersCollection.findOne({ _id: new ObjectId(userId) });
  global.io.to("user_" + userId).emit("userUpdated", {
    wallet_balance: fresh.wallet_balance,
    liable: fresh.liable,
    runnerPnL: fresh.runnerPnL
  });
}


/* ------------------------------ SETTLEMENT ------------------------------ */
async function settleEventBets(eventId, winningSelectionId) {
  const usersCollection = getUsersCollection();
  const allUsers = await usersCollection.find({}).toArray();

  for (const user of allUsers) {
    const matchedBets = (user.orders || []).filter(
      o => o.marketId === eventId && o.status === "MATCHED"
    );
    if (matchedBets.length === 0) continue;

    let totalProfit = 0;
    let totalLoss = 0;
    let totalLiabilityToRelease = 0;

    for (const bet of matchedBets) {
      const price = Number(bet.price);
      const size = Number(bet.size);
      const liable = bet.side === "B" ? size : (price - 1) * size;
      totalLiabilityToRelease += liable; // har matched bet ka liability release hoga

      if (bet.selectionId === winningSelectionId) {
        // ✅ Jeeta
        if (bet.side === "B") totalProfit += (price - 1) * size;
        else if (bet.side === "L") totalProfit += size;
      } else {
        // ❌ Haraa
        if (bet.side === "B") totalLoss += size;
        else if (bet.side === "L") totalLoss += (price - 1) * size;
      }
    }

    // 🧾 Net result
    const netChange = totalProfit - totalLoss;
    const walletBefore = user.wallet_balance || 0;
    const liabilityBefore = user.liable || 0;

    // 🩵 FIX: Pehle liability release karo, phir profit/loss adjust
    let newWallet = walletBefore + totalLiabilityToRelease + netChange;

    // Agar kisi wajah se negative chala gaya (rare case)
    if (newWallet < 0) newWallet = 0;

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          wallet_balance: newWallet,
          liable: Math.max(0, liabilityBefore - totalLiabilityToRelease),
        },
        $push: {
          transactions: {
            type: "BET_SETTLEMENT",
            eventId,
            profit: totalProfit,
            loss: totalLoss,
            net: netChange,
            releasedLiability: totalLiabilityToRelease,
            created_at: new Date(),
          },
        },
      }
    );

    // Bets mark as settled
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          "orders.$[o].status": "SETTLED",
          "orders.$[o].settled_at": new Date(),
        },
      },
      { arrayFilters: [{ "o.marketId": eventId, "o.status": "MATCHED" }] }
    );

    global.io.to("user_" + user._id).emit("userUpdated", {
      wallet_balance: newWallet,
      profit: totalProfit,
      loss: totalLoss,
      net: netChange,
    });

    console.log(
      `✅ Settlement for ${user.username}: Profit ${totalProfit}, Loss ${totalLoss}, Released ${totalLiabilityToRelease}`
    );

    // Update PnL & liability again for fresh values
    await recalculateUserLiableAndPnL(user._id);
  }

  console.log("🎯 All matched bets settled for event:", eventId);
}




// track order
// PATCH /orders/request/:requestId
router.patch("/request/:requestId", authMiddleware(), async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestId } = req.params;

    const usersCollection = getUsersCollection();

    // status update to MATCHED
    const result = await usersCollection.updateOne(
      { _id: userId, "orders.requestId": parseInt(requestId) },
      { $set: { "orders.$.status": "MATCHED" } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Order not found or already matched" });
    }

    res.json({
      success: true,
      requestId,
      status: "MATCHED",
      message: "Order successfully matched"
    });
  } catch (err) {
    console.error("Match order error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// GET /orders/unmatched
// GET /orders/unmatched
// GET /orders/unmatched


/* ---------------- GET /orders/unmatched ---------------- */
router.get("/unmatched", authMiddleware(), async (req, res) => {
  try {
    const userId = req.user._id;
    const matchId = req.query.matchId;

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    let unmatched = (user.orders || []).filter(o => o.status === "PENDING");

    if (matchId) {
      unmatched = unmatched.filter(o => String(o.marketId) === String(matchId));
    }

    console.log("📦 Sending unmatched:", unmatched.length, "orders");
    res.json(unmatched);
  } catch (err) {
    console.error("Fetch unmatched error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------- GET /orders/matched ---------------- */
router.get("/matched", authMiddleware(), async (req, res) => {
  try {
    const userId = req.user._id;
    const matchId = req.query.matchId;

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    let matched = (user.orders || []).filter(o => o.status === "MATCHED");

    if (matchId) {
      matched = matched.filter(o => String(o.marketId) === String(matchId));
    }

    console.log("📦 Sending matched:", matched.length, "orders");
    res.json(matched);
  } catch (err) {
    console.error("Fetch matched error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// ✅ Cancel single bet
router.post("/cancel/:requestId", authMiddleware(), async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestId } = req.params;

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) return res.status(404).json({ error: "User not found" });

    const order = (user.orders || []).find(o => o.requestId == requestId);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "PENDING") {
      return res.status(400).json({ error: "Only PENDING bets can be cancelled" });
    }

    // Calculate refund amount (liability for this bet)
    const refundAmount = order.side === "B" ? order.size : (order.price - 1) * order.size;

    // Mark order as cancelled
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: { "orders.$[o].status": "CANCELLED", "orders.$[o].updated_at": new Date() },
        $push: {
          transactions: {
            type: "BET_CANCELLED",
            amount: refundAmount,
            created_at: new Date()
          }
        }
      },
      { arrayFilters: [{ "o.requestId": requestId }] }
    );

    // Recalculate liability after cancellation
    await recalculateUserLiableAndPnL(userId);

    res.json({ success: true, message: "Bet cancelled", orderId: requestId });
  } catch (err) {
    console.error("Cancel bet error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ✅ Cancel all unmatched bets
router.post("/cancel-all", authMiddleware(), async (req, res) => {
  try {
    const userId = req.user._id;

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    const pendingOrders = (user.orders || []).filter(o => o.status === "PENDING");
    if (pendingOrders.length === 0) {
      return res.json({ success: true, message: "No pending bets to cancel" });
    }

    // Mark all pending orders as cancelled
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: { "orders.$[o].status": "CANCELLED", "orders.$[o].updated_at": new Date() },
        $push: {
          transactions: {
            type: "BET_CANCELLED_ALL",
            amount: 0,
            created_at: new Date()
          }
        }
      },
      { arrayFilters: [{ "o.status": "PENDING" }] }
    );

    // Recalculate liability after cancellation
    await recalculateUserLiableAndPnL(userId);

    const freshUser = await usersCollection.findOne({ _id: new ObjectId(userId) });
    res.json({ 
      success: true, 
      message: "All pending bets cancelled",
      cancelledCount: pendingOrders.length
    });
  } catch (err) {
    console.error("Cancel all bets error:", err);
    res.status(500).json({ error: err.message });
  }
});


router.get("/all", authMiddleware(), async (req, res) => {
  const usersCollection = getUsersCollection();
  const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user.orders || []);
});

// List of all known keywords per sport
const sportsKeywords = [
  { category: "Cricket", keywords: ["Match Odds", "ODI", "T20"] },
  { category: "Football", keywords: ["Premier League", "La Liga", "Champions League"] },
  { category: "Tennis", keywords: ["ATP", "WTA", "Grand Slam"] },
  { category: "Greyhound", keywords: ["Greyhound Racing"] }
];

function detectCategory(eventName) {
  // lowercase comparison for safety
  const eventLower = eventName.toLowerCase();

  for (const sport of sportsKeywords) {
    for (const kw of sport.keywords) {
      if (eventLower.includes(kw.toLowerCase())) return sport.category;
    }
  }

  return "Other"; // fallback
}
// GET /orders/with-category
router.get("/with-category", authMiddleware(), async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });

    if (!user) return res.status(404).json({ error: "User not found" });

    // Orders me category add karna
    const ordersWithCategory = (user.orders || []).map(order => ({
      ...order,
      category: order.category || "Other"  // fallback
    }));

    res.json(ordersWithCategory);
  } catch (err) {
    console.error("Error fetching orders with category:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /bets/matched



/* ---------------- Auto-match endpoint (called when market odds update) ---------------- */
router.post("/auto-match/:marketId", async (req, res) => {
  try {
    const { marketId } = req.params;
    const { selectionId } = req.body;

    if (selectionId) {
      // Auto-match for specific selection
      await autoMatchPendingBets(marketId, selectionId);
      res.json({ success: true, message: `Auto-matching triggered for market ${marketId}, selection ${selectionId}` });
    } else {
      // Auto-match for all selections in the market
      const usersCollection = getUsersCollection();
      const users = await usersCollection.find({
        "orders.marketId": marketId,
        "orders.status": "PENDING"
      }).toArray();

      const uniqueSelections = [...new Set(
        users.flatMap(u => (u.orders || [])
          .filter(o => o.marketId === marketId && o.status === "PENDING")
          .map(o => o.selectionId)
        )
      )];

      for (const selId of uniqueSelections) {
        await autoMatchPendingBets(marketId, selId);
      }

      res.json({ success: true, message: `Auto-matching triggered for market ${marketId}`, selections: uniqueSelections.length });
    }
  } catch (err) {
    console.error("❌ Auto-match endpoint error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  settleEventBets,
  autoMatchPendingBets
};
