// js (backend route)
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
// --- 1. ROUTER: PLACE BET ---
router.post("/", authMiddleware(), async (req, res) => {
  const session = client.startSession(); // MongoDB transaction
  try {
    const user = req.user;
    if (!user || user.role !== "User") {
      return res.status(403).json({ error: "Only users can place bets" });
    }

    let orders = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: "Orders must be an array" });
    }

    await session.withTransaction(async () => {
      const usersCollection = getUsersCollection();

      // 1. Fetch fresh user with lock (inside transaction)
      const dbUser = await usersCollection.findOne(
        { _id: new ObjectId(user._id) },
        { session }
      );
      if (!dbUser) throw new Error("User not found");

      // Enrich orders with event data
      await Promise.all(
        orders.map(async (order) => {
          const { eventName, category } = await getEventDetailsFromBetfair(order.marketId);
          order.event = eventName;
          order.category = category;
        })
      );

      // 2. Normalize + calculate liability per order
      const normalizedOrders = orders.map(order => {
        const price = parseFloat(order.price);
        const size = parseFloat(order.size);
        const liability = order.side === "B" ? size : size * (price - 1);

        return {
          ...order,
          price,
          size,
          liability,
          side: order.side,
          type: order.side === "B" ? "BACK" : "LAY",
          status: "PENDING",
          matched: 0,
          requestId: Date.now() + Math.floor(Math.random() * 100000),
          userId: user._id,
          created_at: new Date(),
          updated_at: new Date(),
        };
      });

      // 3. Incremental exposure simulation (CORRECT ORDERED CHECK)
      let remainingWallet = dbUser.wallet_balance || 0;
      let remainingLayCapacity = (dbUser.wallet_balance || 0) + (dbUser.total_unrealized_profit || 0);

      for (const order of normalizedOrders) {
        if (order.side === "B") {
          // BACK: only wallet
          if (order.size > remainingWallet) {
            throw new Error(`Insufficient wallet balance for back bet (need ${order.size}, have ${remainingWallet})`);
          }
          remainingWallet -= order.size;
          remainingLayCapacity -= order.size; // wallet used → less for lay
        } else {
          // LAY: wallet + unrealized profit
          const layLiability = order.size * (order.price - 1);
          if (layLiability > remainingLayCapacity) {
            throw new Error(`Insufficient funds to lay (need ${layLiability}, available ${remainingLayCapacity})`);
          }
          remainingLayCapacity -= layLiability;
        }
      }

      // 4. Calculate totals for DB update
      const totalBackStakes = normalizedOrders
        .filter(o => o.side === "B")
        .reduce((sum, o) => sum + o.size, 0);

      const totalLayLiability = normalizedOrders
        .filter(o => o.side !== "B")
        .reduce((sum, o) => sum + o.liability, 0);

      const totalPendingLiability = totalBackStakes + totalLayLiability;

      // 5. Atomically update user (only deduct BACK stakes from wallet)
      await usersCollection.updateOne(
        { _id: new ObjectId(user._id) },
        {
          $push: {
            orders: { $each: normalizedOrders },
            transactions: {
              type: "BET_PLACED",
              amount: totalPendingLiability,
              status: "PENDING",
              created_at: new Date(),
            }
          },
          $inc: {
            wallet_balance: -totalBackStakes,        // Only deduct BACK stakes
            pending_liability: totalPendingLiability // Track pending exposure
          }
        },
        { session }
      );

      // 6. Try immediate matching (outside critical path, but still in transaction-safe state)
      const matchedUpdates = [];
      for (const order of normalizedOrders) {
        const runner = await getMarketBookFromBetfair(order.marketId, order.selectionId);
        if (!runner) continue;

        const { matchedSize, status, executedPrice } = checkMatch(order, runner);
        if (matchedSize > 0) {
          matchedUpdates.push(
            usersCollection.updateOne(
              { _id: new ObjectId(user._id), "orders.requestId": order.requestId },
              {
                $set: {
                  "orders.$.matched": matchedSize,
                  "orders.$.status": status,
                  "orders.$.price": executedPrice,
                  "orders.$.updated_at": new Date(),
                },
                $push: {
                  transactions: {
                    type: "BET_MATCHED",
                    amount: 0,
                    orderId: order.requestId,
                    marketId: order.marketId,
                    created_at: new Date()
                  }
                }
              },
              { session }
            )
          );

          global.io.to("match_" + order.marketId).emit("ordersUpdated", {
            userId: user._id,
            newOrders: [{ ...order, matched: matchedSize, status, price: executedPrice }]
          });
        }
      }

      if (matchedUpdates.length > 0) {
        await Promise.all(matchedUpdates);
      }

      // 7. Final recalculate (outside transaction — safe because it's read-only + eventual consistency)
    }); // end transaction

    // After transaction: recalculate exposure (fire and forget)
    recalculateUserLiableAndPnL(user._id).catch(console.error);

    // Auto-match pending bets
    const uniqueKeys = new Set(
      normalizedOrders.map(o => `${o.marketId}_${o.selectionId}`)
    );
    for (const key of uniqueKeys) {
      const [marketId, selectionId] = key.split("_");
      autoMatchPendingBets(marketId, selectionId).catch(console.error);
    }

    res.status(200).json({
      message: "Bets placed successfully",
      count: orders.length,
      deducted_from_wallet: totalBackStakes
    });

  } catch (err) {
    console.error("Bet placement failed:", err.message);
    res.status(400).json({ error: err.message || "Insufficient funds or invalid bet" });
  } finally {
    await session.endSession();
  }
});

/* ------------------- RECALCULATE LOGIC (UPDATED) ------------------- */
async function recalculateUserLiableAndPnL(userId) {
  const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
  if (!user) return null;

  const matchedOrders = (user.orders || []).filter(o => o.status === "MATCHED");
  const pendingOrders = (user.orders || []).filter(o => o.status === "PENDING");

  let totalExposure = 0;
  let totalIfWinProfit = 0; // sum of positive ifWin values
  const runnerPnL = {};     // for UI: show green/red per runner

  // Group matched bets by market
  const markets = groupBy(matchedOrders, 'marketId');

  for (const [marketId, bets] of Object.entries(markets)) {
    const runners = groupBy(bets, 'selectionId');

    const ifWin = {}; // if this runner wins, user's PnL

    // Initialize
    for (const selectionId of Object.keys(runners)) {
      ifWin[selectionId] = 0;
    }

    // Calculate ifWin for each runner
    for (const [selectionId, runnerBets] of Object.entries(runners)) {
      let profitIfWin = 0;
      let profitIfLose = 0;

      for (const bet of runnerBets) {
        const stake = Number(bet.matched || bet.size);
        const odds = Number(bet.price);

        if (bet.side === "B") {
          // Back: win (odds-1)*stake if wins, lose stake if loses
          profitIfWin += stake * (odds - 1);
          profitIfLose -= stake;
        } else {
          // Lay: win stake if loses, lose (odds-1)*stake if wins
          profitIfWin -= stake * (odds - 1);
          profitIfLose += stake;
        }
      }

      // For this runner winning: profitIfWin
      // For all other runners winning: profitIfLose (same for all others)
      ifWin[selectionId] = profitIfWin;

      // Add profitIfLose to all other runners
      for (const otherId of Object.keys(runners)) {
        if (otherId !== selectionId) {
          ifWin[otherId] += profitIfLose;
        }
      }
    }

    // Now compute worst-case loss
    const outcomes = Object.values(ifWin);
    const worstLoss = Math.min(0, ...outcomes); // negative = loss
    const marketExposure = -worstLoss; // positive liability

    totalExposure += marketExposure;

    // Sum positive PnL for lay credit
    for (const [selId, pnl] of Object.entries(ifWin)) {
      runnerPnL[`${marketId}_${selId}`] = pnl;
      if (pnl > 0) totalIfWinProfit += pnl;
    }
  }

  // Pending bets: full liability (no hedging benefit)
  let pendingLiability = 0;
  for (const bet of pendingOrders) {
    const stake = Number(bet.size);
    const odds = Number(bet.price);
    const liability = bet.side === "B" ? stake : stake * (odds - 1);
    pendingLiability += liability;
  }

  const totalLiability = totalExposure + pendingLiability;

  // Available balances
  const availableForBack = user.wallet_balance;
  const availableForLay = user.wallet_balance + totalIfWinProfit;

  // Update user
  await usersCollection.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        wallet_balance: user.wallet_balance, // unchanged unless settlement
        liable: totalLiability,
        exposure: totalExposure,
        pending_liability: pendingLiability,
        available_for_back: availableForBack,
        available_for_lay: availableForLay,
        runnerPnL: runnerPnL,
        total_unrealized_profit: totalIfWinProfit
      }
    }
  );

  const updated = {
    wallet_balance: user.wallet_balance,
    available_for_back: availableForBack,
    available_for_lay: availableForLay,
    total_liability: totalLiability,
    runnerPnL
  };

  global.io.to(`user_${userId}`).emit("balanceUpdate", updated);
  return updated;
}
function canPlaceBet(user, bet) {
  const stake = parseFloat(bet.size);
  const odds = parseFloat(bet.price);

  if (bet.side === "B") {
    // BACK: only wallet balance
    if (stake > user.available_for_back) {
      throw new Error("Insufficient balance for back bet");
    }
  } else {
    // LAY: wallet + unrealized profit
    const liability = stake * (odds - 1);
    if (liability > user.available_for_lay) {
      throw new Error("Insufficient funds to cover lay liability");
    }
  }
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

    const order = (user.orders || []).find(o => String(o.requestId) === String(requestId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status !== "PENDING") {
      return res.status(400).json({ error: "Only PENDING bets can be cancelled" });
    }

    // Calculate refund amount based on liability stored in the order
    // Fallback calculation if 'liable' wasn't stored correctly
    const price = parseFloat(order.price);
    const size = parseFloat(order.size);
    const liabilityToRefund = order.liable || (order.side === "B" ? size : (price - 1) * size);

    // 1. Mark as CANCELLED
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: { "orders.$[o].status": "CANCELLED", "orders.$[o].updated_at": new Date() },
        $push: {
          transactions: {
            type: "BET_CANCELLED",
            amount: liabilityToRefund,
            orderId: requestId,
            created_at: new Date()
          }
        },
        // 2. Refund Wallet & Reverse Liability immediately
        $inc: {
            wallet_balance: liabilityToRefund,
            liable: -liabilityToRefund
        }
      },
      { arrayFilters: [{ "o.requestId": { $eq: (typeof order.requestId === "number" ? Number(requestId) : requestId) } }] }
    );

    // 3. Force Recalculate to ensure state consistency
    const finalState = await recalculateUserLiableAndPnL(userId);

    global.io.to("user_" + userId).emit("orderCancelled", { 
        requestId, 
        wallet: finalState.wallet_balance, 
        liability: finalState.liable 
    });

    return res.json({ success: true, message: "Bet cancelled", wallet: finalState.wallet_balance });
  } catch (err) {
    console.error("Cancel bet error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* --------------------- CANCEL ALL PENDING --------------------- */
router.post("/cancel-all", authMiddleware(), async (req, res) => {
  try {
    const userId = req.user._id;
    const usersCollection = getUsersCollection();

    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    const pendingOrders = (user.orders || []).filter(o => o.status === "PENDING");
    if (pendingOrders.length === 0) {
      return res.json({ success: true, message: "No pending bets to cancel", cancelledCount: 0 });
    }

    // Calculate total liability to refund
    let totalRefund = 0;
    pendingOrders.forEach(o => {
        const price = parseFloat(o.price);
        const size = parseFloat(o.size);
        const liab = o.liable || (o.side === "B" ? size : (price - 1) * size);
        totalRefund += liab;
    });

    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: { "orders.$[o].status": "CANCELLED", "orders.$[o].updated_at": new Date() },
        $push: {
          transactions: {
            type: "BET_CANCELLED_ALL",
            amount: totalRefund,
            cancelledCount: pendingOrders.length,
            created_at: new Date()
          }
        },
        // Refund Total
        $inc: {
            wallet_balance: totalRefund,
            liable: -totalRefund
        }
      },
      { arrayFilters: [{ "o.status": "PENDING" }] }
    );

    // Recalculate to ensure consistency
    const finalState = await recalculateUserLiableAndPnL(userId);

    global.io.to("user_" + userId).emit("ordersCancelledAll", { 
        cancelledCount: pendingOrders.length,
        wallet: finalState.wallet_balance
    });

    return res.json({ success: true, message: "All pending bets cancelled", cancelledCount: pendingOrders.length });
  } catch (err) {
    console.error("Cancel all bets error:", err);
    return res.status(500).json({ error: err.message });
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
router.get("/transactions", authMiddleware(), async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user._id) });
    if (!user) return res.status(404).json({ error: "User not found" });

    const deposits = (user.transactions || []).filter(
      t => t.type === "deposit" && t.status === "completed"
    );

    res.json(deposits);
  } catch (err) {
    console.error("Error fetching deposit transactions:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

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
