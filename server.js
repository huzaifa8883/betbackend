require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const bodyParser = require('body-parser');
const config = require('./config');
// const { settleBetsForClosedEvents } = require('./routes/Orders');
const { updateMarkets } = require('./routes/markets');
const app = express();
const server = http.createServer(app);

// 🔥 Attach Socket.IO
const { Server } = require("socket.io");
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

// ✅ ab routes me bhi io use kar sakte ho
global.io = io;

const PORT = process.env.PORT || config.api.port || 5000;

/* ---------------- Middleware ---------------- */
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://nonalexch.com',
      'https://www.nonalexch.com',
      'http://localhost:8000'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed for this origin'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* ---------------- MongoDB ---------------- */
const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://huzaifa:huzaifa56567@cluster0.owmq7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

/* ---------------- Routes ---------------- */
const userRoutes = require('./routes/users');
const {router:marketRoutes} = require('./routes/markets');
const {router:orderRoutes} = require('./routes/Orders');

app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/markets', marketRoutes);

/* ---------------- Socket.IO Events ---------------- */
io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  // ✅ Join specific match room
  socket.on("JoinMatch", (matchId) => {
    socket.join("match_" + matchId);
    console.log(`✅ Client ${socket.id} joined match_${matchId}`);
  });

  // ✅ Listen for bet placement
  socket.on("placeBet", (bet) => {
    console.log("📩 New Bet:", bet);

    // TODO: Save bet in DB

    // Send confirmation to the user who placed bet
    socket.emit("betConfirmed", {
      ...bet,
      status: "PENDING",
      betId: Date.now().toString()
    });

    // Broadcast to everyone else (market updated)
    socket.broadcast.emit("marketUpdated", {
      marketId: bet.marketId,
      odds: bet.odds
    });
  });

  // ✅ Listen for market odds updates
  socket.on("updateMarket", (data) => {
    console.log("📢 Market update:", data);
    io.emit("marketOddsUpdated", data); // send to all
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
// Run market check every 30 seconds
setInterval(async () => {
  console.log("⏳ Running updateMarkets check...");
  try {
    await updateMarkets();
    console.log("✅ updateMarkets executed");
  } catch (err) {
    console.error("❌ updateMarkets error:", err.message);
  }
}, 30000);

/* ---------------- Start server ---------------- */
server.listen(PORT, () => {
  console.log('🚀 Backend server running on port ' + PORT);
  console.log('Using database: ' + config.database.name);
});

// setInterval(() => {
//   console.log("⏳ Running automatic settlement for closed events...");
//   settleBetsForClosedEvents();
// }, 5 * 60 * 1000); // 5 minutes
