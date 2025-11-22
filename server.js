// server.js
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const bodyParser = require('body-parser');
const config = require('./config');

// Routes that we need (make sure these files export correctly)
const userRoutes = require('./routes/users');
const { router: marketRoutes } = require('./routes/markets');
const { router: orderRoutes, autoMatchPendingBets } = require('./routes/Orders'); // Ensure Orders exports autoMatchPendingBets

const { updateMarkets } = require('./routes/markets'); // if updateMarkets is exported separately

const app = express();
const server = http.createServer(app);

// Socket.IO
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: [
      'https://nonalexch.com',
      'https://www.nonalexch.com',
      'http://localhost:8000'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io available in routes if you need
global.io = io;

const PORT = process.env.PORT || config.api?.port || 5000;

/* ---------------- Middleware ---------------- */
const allowedOrigins = [
  'https://nonalexch.com',
  'https://www.nonalexch.com',
  'http://localhost:8000'
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed for this origin'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// bodyParser is still fine; express.json() could be used instead
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* ---------------- MongoDB ---------------- */
// IMPORTANT: replace the default URI and remove hardcoded credentials.
// Put your real URI in process.env.MONGODB_URI (and never commit it)
const MONGODB_URI = process.env.MONGODB_URI || config.database?.uri || 
  'mongodb+srv://<username>:<password>@cluster0.owmq7.mongodb.net/your-db?retryWrites=true&w=majority';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      // useNewUrlParser/useUnifiedTopology not required for Mongoose 6+
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    // don't exit immediately in dev; in production you might want to exit
    process.exit(1);
  }
}
connectDB();

/* ---------------- Routes ---------------- */
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/markets', marketRoutes);

/* ---------------- Socket.IO Events ---------------- */
io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  socket.on("JoinMatch", (matchId) => {
    try {
      if (!matchId) return;
      socket.join("match_" + matchId);
      console.log(`✅ Client ${socket.id} joined match_${matchId}`);
    } catch (e) {
      console.error('JoinMatch error:', e);
    }
  });

  socket.on("placeBet", async (bet) => {
    try {
      if (!bet || !bet.marketId || !bet.selectionId) {
        socket.emit("error", { message: "Invalid bet payload" });
        return;
      }

      console.log("📩 New Bet:", bet);

      // TODO: Save bet properly in DB using your Orders route/service.
      // For now we emit confirmation back to the placing socket:
      const confirmation = {
        ...bet,
        status: "PENDING",
        betId: Date.now().toString()
      };

      socket.emit("betConfirmed", confirmation);

      // Broadcast market update to others
      socket.broadcast.emit("marketUpdated", {
        marketId: bet.marketId,
        odds: bet.odds
      });

    } catch (err) {
      console.error('placeBet handler error:', err);
      socket.emit('error', { message: 'placeBet failed' });
    }
  });

  socket.on("updateMarket", async (data) => {
    try {
      if (!data || !data.marketId) {
        console.warn('updateMarket called without marketId:', data);
        return;
      }

      console.log("📢 Market update:", data);
      io.emit("marketOddsUpdated", data); // broadcast new odds to all

      // Trigger auto-matching for pending bets when market odds update
      try {
        // If Orders.autoMatchPendingBets exists, use that
        if (typeof autoMatchPendingBets === 'function') {
          if (data.selectionId) {
            await autoMatchPendingBets(data.marketId, data.selectionId);
          } else {
            // Auto-match for all selections present in the market
            // We'll attempt to find unique selectionIds from DB (defensive)
            if (mongoose.connection && mongoose.connection.readyState === 1) {
              const usersCollection = mongoose.connection.db.collection(config.database.collections.users);
              const users = await usersCollection.find({
                "orders.marketId": data.marketId,
                "orders.status": "PENDING"
              }).toArray();

              const uniqueSelections = [...new Set(
                users.flatMap(u => (u.orders || [])
                  .filter(o => o.marketId === data.marketId && o.status === "PENDING")
                  .map(o => o.selectionId)
                )
              )];

              for (const selId of uniqueSelections) {
                await autoMatchPendingBets(data.marketId, selId);
              }
            } else {
              console.warn('Mongo not ready for auto-matching');
            }
          }
        } else {
          console.warn('autoMatchPendingBets not available from Orders module');
        }
      } catch (err) {
        console.error("❌ Auto-match error on market update:", err);
      }

    } catch (err) {
      console.error('updateMarket handler error:', err);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

/* ---------------- Status Routes ---------------- */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    database_connected: mongoose.connection.readyState === 1,
    version: '1.0.0'
  });
});

app.get('/api/db-test', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    const collections = await mongoose.connection.db.listCollections().toArray();
    return res.json({
      success: true,
      message: 'Successfully connected to MongoDB Atlas',
      collections: collections.map(col => col.name),
      database: mongoose.connection.db.databaseName
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* ---------------- Periodic market update ---------------- */
// Run market check every 30 seconds — ensure updateMarkets handles its own errors
if (typeof updateMarkets === 'function') {
  setInterval(async () => {
    console.log("⏳ Running updateMarkets check...");
    try {
      await updateMarkets();
      console.log("✅ updateMarkets executed");
      // If updateMarkets triggers socket events or calls auto-match internally, great.
    } catch (err) {
      console.error("❌ updateMarkets error:", err?.message || err);
    }
  }, 30 * 1000);
} else {
  console.warn('updateMarkets function not found in ./routes/markets');
}

/* ---------------- Start server ---------------- */
server.listen(PORT, () => {
  console.log('🚀 Backend server running on port ' + PORT);
  try {
    console.log('Using database: ' + (config.database?.name || mongoose.connection.db?.databaseName || 'unknown'));
  } catch (e) { /* ignore */ }
});

/* ---------------- Graceful shutdown & errors ---------------- */
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  // Optionally exit: process.exit(1);
});

function gracefulShutdown() {
  console.log('🔌 Shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('Mongo connection closed.');
      process.exit(0);
    });
  });
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
