/**
 * Markets API Routes
 * Handles all market-related API endpoints
 */

const { v4: uuidv4 } = require('uuid');
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const config = require('../config');
const fs = require('fs')
const https = require('https')
// routes/markets.js ya jis file me proxy use ho raha
// routes/markets.js

const axios = require('axios'); // Yeh neeche likha hua hai
const {settleEventBets } = require('./Orders'); // Import settleEventBets function
const mockPopularMarkets = [
  {
    id: '1.123456789',
    name: 'Manchester United v Arsenal',
    sport: 'Soccer',
    country: 'United Kingdom',
    competition: 'Premier League',
    marketStartTime: '2025-07-05T15:00:00.000Z',
    total_matched: 2500000.75
  },
  {
    id: '1.123456790',
    name: 'Liverpool v Chelsea',
    sport: 'Soccer',
    country: 'United Kingdom',
    competition: 'Premier League',
    marketStartTime: '2025-07-06T16:30:00.000Z',
    total_matched: 1800000.50
  },
  {
    id: '1.123456791',
    name: 'Real Madrid v Barcelona',
    sport: 'Soccer',
    country: 'Spain',
    competition: 'La Liga',
    marketStartTime: '2025-07-05T19:00:00.000Z',
    total_matched: 3200000.25
  },
  {
    id: '1.123456792',
    name: 'Novak Djokovic v Rafael Nadal',
    sport: 'Tennis',
    country: 'United Kingdom',
    competition: 'Wimbledon',
    marketStartTime: '2025-07-07T13:00:00.000Z',
    total_matched: 1200000.00
  },
  {
    id: '1.123456793',
    name: 'Los Angeles Lakers v Boston Celtics',
    sport: 'Basketball',
    country: 'USA',
    competition: 'NBA',
    marketStartTime: '2025-07-08T00:00:00.000Z',
    total_matched: 950000.50
  }
];

/**
 * @route   GET /api/Markets/popular
 * @desc    Get popular markets across all sports
 * @access  Public
 */
router.get('/popular', async (req, res) => {
  try {
    console.log('Fetching popular markets...');
    
    // Try to get markets from database
    const db = mongoose.connection.db;
    
    // Check if markets collection exists
    const collections = await db.listCollections({ name: 'markets' }).toArray();
    if (collections.length > 0) {
      console.log('Markets collection found, fetching data...');
      
      // Get markets from database
      const markets = await db.collection('markets')
        .find({ is_popular: true })
        .limit(10)
        .toArray();
      
      if (markets && markets.length > 0) {
        console.log(`Found ${markets.length} popular markets in database`);
        
        // Return markets from database
        return res.json({
          status: 'success',
          data: markets.map(market => ({
            ...market,
            _id: undefined // Remove MongoDB ID
          }))
        });
      }
    }
    
    // If no markets in database, use mock data
    console.log('No markets found in database, using mock data');
    
    return res.json({
      status: 'success',
      data: mockPopularMarkets
    });
  } catch (error) {
    console.error('Error fetching popular markets:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get popular markets',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/Markets/:marketId
 * @desc    Get specific market by ID
 * @access  Public
 */

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

const getUsersCollection = () => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB connection not established");
  }
  return mongoose.connection.db.collection(config.database.collections.users);
};
function checkMatch(order, runner) {
  let matchedSize = 0;
  let status = "UNMATCHED";
  let executedPrice = order.price;

  const backs = runner.ex.availableToBack || [];
  const lays = runner.ex.availableToLay || [];

  if (order.type === "BACK" && backs.length > 0) {
    // Sabse bara back odd (highest)
    const highestBack = Math.max(...backs.map(b => b.price));

    if (highestBack >= order.price) {
      executedPrice = highestBack;
      matchedSize = order.size; // abhi full match (partial ka size check add kar sakte)
      status = "MATCHED";
    } else {
      status = "UNMATCHED";
    }
  }

  else if (order.type === "LAY" && lays.length > 0) {
    // Sabse chhota lay odd (lowest)
    const lowestLay = Math.min(...lays.map(l => l.price));

    if (lowestLay <= order.price) {
      executedPrice = lowestLay;
      matchedSize = order.size;
      status = "MATCHED";
    } else {
      status = "UNMATCHED";
    }
  }

  return { matchedSize, status, executedPrice };
}

// Certificate aur key read karo
const cert = fs.readFileSync('./client-2048.crt');
const key = fs.readFileSync('./client-2048.key');
console.log('CRT exists:', fs.existsSync('./client-2048.crt'));
console.log('KEY exists:', fs.existsSync('./client-2048.key'));
console.log('APP_KEY:', process.env.BETFAIR_APP_KEY);
console.log('USERNAME:', process.env.BETFAIR_USERNAME ? 'SET' : 'NOT SET');
console.log('PASSWORD:', process.env.BETFAIR_PASSWORD ? 'SET' : 'NOT SET');

// 🚀 Fetch live markets for multiple sports
const agent = new https.Agent({
  cert: cert,
  key: key,
  rejectUnauthorized: true // production me true rakho
});
console.log('HTTPS agent created:', agent.options.cert ? true : false);

let cachedSessionToken = null;
let tokenExpiryTime = null;  // timestamp jab token expire ho jayega


async function getSessionToken() {
  try {
    const response = await axios.post(
      "https://identitysso-cert.betfair.com/api/certlogin",
      new URLSearchParams({
        username: process.env.BETFAIR_USERNAME,
        password: process.env.BETFAIR_PASSWORD,
      }).toString(),
      {
        headers: {
          "X-Application": process.env.BETFAIR_APP_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        httpsAgent: agent,
        timeout: 30000,
      }
    );

    const data = response.data;
    if (data.loginStatus === "SUCCESS") {  // 👈 Betfair returns `loginStatus`, not `status`
      console.log("✅ Session token generated:", data.sessionToken);
      return data.sessionToken;
    } else {
      throw new Error(`Login failed: ${data.loginStatus}`);
    }
  } catch (err) {
    if (err.response) {
      console.error("❌ Failed to login to Betfair:");
      console.error("Status:", err.response.status);
      console.error("Headers:", err.response.headers);
      console.error("Data:", err.response.data); // 👈 Real message from Betfair
    } else {
      console.error("❌ Login error:", err.message);
    }
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

async function getMarketsFromBetfair(marketIds = []) {
  try {
    const sessionToken = await getSessionToken();

    // 1️⃣ Fetch market book to get status + runners
    const bookResponse = await axios.post(
      "https://api.betfair.com/exchange/betting/json-rpc/v1",
      [
        {
          jsonrpc: "2.0",
          method: "SportsAPING/v1.0/listMarketBook",
          params: { marketIds },
          id: 1,
        },
      ],
      {
        headers: {
          "X-Application": APP_KEY,
          "X-Authentication": sessionToken,
          "Content-Type": "application/json",
        },
      }
    );

    const marketBooks = bookResponse.data[0]?.result || [];

    // 2️⃣ For each market, also fetch event details (optional)
    const marketsWithDetails = [];
    for (const market of marketBooks) {
      const catalogueResponse = await axios.post(
        "https://api.betfair.com/exchange/betting/json-rpc/v1",
        [
          {
            jsonrpc: "2.0",
            method: "SportsAPING/v1.0/listMarketCatalogue",
            params: {
              filter: { marketIds: [market.marketId] },
              maxResults: "1",
              marketProjection: ["EVENT", "EVENT_TYPE"],
            },
            id: 1,
          },
        ],
        {
          headers: {
            "X-Application": APP_KEY,
            "X-Authentication": sessionToken,
            "Content-Type": "application/json",
          },
        }
      );

      const eventData = catalogueResponse.data[0]?.result?.[0] || {};
      const eventName = eventData?.event?.name || "Unknown Event";
      const eventTypeId = eventData?.eventType?.id?.toString();
      const category =
        sportMapById[eventTypeId] ||
        eventData?.eventType?.name ||
        "Other";

      marketsWithDetails.push({
        marketId: market.marketId,
        status: market.status,
        runners: market.runners,
        eventName,
        category,
      });
    }

    return marketsWithDetails;
  } catch (error) {
    console.error("❌ Error fetching markets:", error.message);
    return [];
  }
}
async function betfairRpc(method, params) {
  const sessionToken = await getSessionToken();
  const res = await axios.post(
    "https://api.betfair.com/exchange/betting/json-rpc/v1",
    [
      {
        jsonrpc: "2.0",
        method,
        id: 1,
        params,
      },
    ],
    {
      headers: {
        "X-Application": APP_KEY,
        "X-Authentication": sessionToken,
        "Content-Type": "application/json",
      },
    }
  );

  if (res.data && res.data[0]) return res.data[0].result;
  throw new Error("Invalid RPC response");
}

// =============================
// ⚽ Route: /inplay/soccer
// =============================
router.get("/inplay/soccer", async (req, res) => {
  try {
    const sportId = 1;
    const maxResults = 30;

    const marketFilter = {
      inPlayOnly: true, // ✅ Sirf in-play markets
      eventTypeIds: [String(sportId)],
      marketTypeCodes: ["MATCH_ODDS"],
    };

    const marketCatalogueParams = {
      filter: marketFilter,
      maxResults,
      marketProjection: ["EVENT", "RUNNER_DESCRIPTION", "MARKET_START_TIME"],
    };

    const marketCatalogues = await betfairRpc(
      "SportsAPING/v1.0/listMarketCatalogue",
      marketCatalogueParams
    );

    const marketIds = marketCatalogues.map((m) => m.marketId);
    if (marketIds.length === 0)
      return res.json({ success: true, count: 0, markets: [] });

    const marketBookParams = {
      marketIds,
      priceProjection: { priceData: ["EX_BEST_OFFERS"] },
    };

    const marketBooks = await betfairRpc(
      "SportsAPING/v1.0/listMarketBook",
      marketBookParams
    );

    // ✅ Combine and only keep live matches
    const combined = marketCatalogues
      .map((market) => {
        const book = marketBooks.find((b) => b.marketId === market.marketId);
        if (!book || !book.inplay) return null; // ❌ Skip if not live

        const selections = (market.runners || []).map((runner) => {
          const runnerBook = book.runners.find(
            (r) => r.selectionId === runner.selectionId
          );
          return {
            name: runner.runnerName,
            back: runnerBook?.ex?.availableToBack?.[0] || {
              price: "-",
              size: "-",
            },
            lay: runnerBook?.ex?.availableToLay?.[0] || {
              price: "-",
              size: "-",
            },
          };
        });

        // 🕒 FIX: Convert start time properly
        const formattedStartTime = market.marketStartTime
          ? new Date(market.marketStartTime).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            });

        return {
          marketId: market.marketId,
          match: market.event.name,
          startTime: formattedStartTime,
          status: book.inplay ? "IN-PLAY" : book.status || "UNKNOWN", // ✅ Custom status
          totalMatched: book.totalMatched || 0,
          odds: {
            back1: selections[0]?.back || { price: "-", size: "-" },
            lay1: selections[0]?.lay || { price: "-", size: "-" },
            backX: selections[1]?.back || { price: "-", size: "-" },
            layX: selections[1]?.lay || { price: "-", size: "-" },
            back2: selections[2]?.back || { price: "-", size: "-" },
            lay2: selections[2]?.lay || { price: "-", size: "-" },
          },
        };
      })
      .filter(Boolean)
      .slice(0, 5); // ✅ Limit to 5 live matches only

    res.json({
      success: true,
      sport: "Soccer",
      count: combined.length,
      markets: combined,
    });
  } catch (err) {
    console.error("❌ Error fetching soccer in-play:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/inplay/cricket", async (req, res) => {
  try {
    const sportId = 4;
    const maxResults = 30;

    const marketFilter = {
      inPlayOnly: true, // ✅ Sirf in-play markets
      eventTypeIds: [String(sportId)],
      marketTypeCodes: ["MATCH_ODDS"],
    };

    const marketCatalogueParams = {
      filter: marketFilter,
      maxResults,
      marketProjection: ["EVENT", "RUNNER_DESCRIPTION", "MARKET_START_TIME"],
    };

    const marketCatalogues = await betfairRpc(
      "SportsAPING/v1.0/listMarketCatalogue",
      marketCatalogueParams
    );

    const marketIds = marketCatalogues.map((m) => m.marketId);
    if (marketIds.length === 0)
      return res.json({ success: true, count: 0, markets: [] });

    const marketBookParams = {
      marketIds,
      priceProjection: { priceData: ["EX_BEST_OFFERS"] },
    };

    const marketBooks = await betfairRpc(
      "SportsAPING/v1.0/listMarketBook",
      marketBookParams
    );

    // ✅ Combine and only keep live matches
    const combined = marketCatalogues
      .map((market) => {
        const book = marketBooks.find((b) => b.marketId === market.marketId);
        if (!book || !book.inplay) return null; // ❌ Skip if not live

        const selections = (market.runners || []).map((runner) => {
          const runnerBook = book.runners.find(
            (r) => r.selectionId === runner.selectionId
          );
          return {
            name: runner.runnerName,
            back: runnerBook?.ex?.availableToBack?.[0] || {
              price: "-",
              size: "-",
            },
            lay: runnerBook?.ex?.availableToLay?.[0] || {
              price: "-",
              size: "-",
            },
          };
        });

        // 🕒 FIX: proper startTime format
        const formattedStartTime = market.marketStartTime
          ? new Date(market.marketStartTime).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            });

        return {
          marketId: market.marketId,
          match: market.event.name,
          startTime: formattedStartTime,
          status: book.inplay ? "IN-PLAY" : book.status || "UNKNOWN",
          totalMatched: book.totalMatched || 0,
          odds: {
            back1: selections[0]?.back || { price: "-", size: "-" },
            lay1: selections[0]?.lay || { price: "-", size: "-" },
            backX: selections[1]?.back || { price: "-", size: "-" },
            layX: selections[1]?.lay || { price: "-", size: "-" },
            back2: selections[2]?.back || { price: "-", size: "-" },
            lay2: selections[2]?.lay || { price: "-", size: "-" },
          },
        };
      })
      .filter(Boolean)
      .slice(0, 5); // ✅ Limit to 5 live matches only

    res.json({
      success: true,
      sport: "cricket",
      count: combined.length,
      markets: combined,
    });
  } catch (err) {
    console.error("❌ Error fetching cricket in-play:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


router.get("/inplay/tennis", async (req, res) => {
  try {
    const sportId = 2;
    const maxResults = 30;

    const marketFilter = {
      inPlayOnly: true,
      eventTypeIds: [String(sportId)],
      marketTypeCodes: ["MATCH_ODDS"],
    };

    const marketCatalogueParams = {
      filter: marketFilter,
      maxResults,
      marketProjection: ["EVENT", "RUNNER_DESCRIPTION", "MARKET_START_TIME"],
    };

    const marketCatalogues = await betfairRpc(
      "SportsAPING/v1.0/listMarketCatalogue",
      marketCatalogueParams
    );

    const marketIds = marketCatalogues.map((m) => m.marketId);
    if (marketIds.length === 0)
      return res.json({ success: true, count: 0, markets: [] });

    const marketBookParams = {
      marketIds,
      priceProjection: { priceData: ["EX_BEST_OFFERS"] },
    };

    const marketBooks = await betfairRpc(
      "SportsAPING/v1.0/listMarketBook",
      marketBookParams
    );

    const combined = marketCatalogues
      .map((market) => {
        const book = marketBooks.find((b) => b.marketId === market.marketId);
        if (!book || !book.inplay) return null;

        const selections = (market.runners || []).map((runner) => {
          const runnerBook = book.runners.find(
            (r) => r.selectionId === runner.selectionId
          );
          return {
            name: runner.runnerName,
            back: runnerBook?.ex?.availableToBack?.[0] || {
              price: "-",
              size: "-",
            },
            lay: runnerBook?.ex?.availableToLay?.[0] || {
              price: "-",
              size: "-",
            },
          };
        });

        return {
          marketId: market.marketId,
          match: market.event.name,
          startTime: market.marketStartTime
            ? new Date(market.marketStartTime).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : new Date().toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              }),
          status: book.inplay ? "IN-PLAY" : book.status || "UNKNOWN",
          totalMatched: book.totalMatched || 0,
          odds: {
            back1: selections[0]?.back || { price: "-", size: "-" },
            lay1: selections[0]?.lay || { price: "-", size: "-" },
            backX: selections[1]?.back || { price: "-", size: "-" },
            layX: selections[1]?.lay || { price: "-", size: "-" },
            back2: selections[2]?.back || { price: "-", size: "-" },
            lay2: selections[2]?.lay || { price: "-", size: "-" },
          },
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    res.json({
      success: true,
      sport: "tennis",
      count: combined.length,
      markets: combined,
    });
  } catch (err) {
    console.error("❌ Error fetching tennis in-play:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🎯 Fetch live cricket markets only
router.get('/live/cricket', async (req, res) => {
  try {
    const sessionToken = await getSessionToken();


    // 🎯 Step 1: Get cricket events
    const eventsResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listEvents',
          params: {
            filter: {
              eventTypeIds: ['4'],
              // marketStartTime: {
              //   from: new Date().toISOString()
              // }
            }
          },
          id: 1
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        },
            httpsAgent: agent, // certificate ke saath

          timeout: 60000
      }
    );

    const events = eventsResponse.data[0]?.result || [];
    const eventIds = events.map(e => e.event.id);

    // 🎯 Step 2: Get market catalogue
    const marketCatalogueResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketCatalogue',
          params: {
            filter: {
              eventIds: eventIds,
              marketTypeCodes: ['MATCH_ODDS']
            },
            maxResults: '10',
            marketProjection: ['EVENT', 'RUNNER_METADATA']
          },
          id: 2
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        },
            httpsAgent: agent, // certificate ke saath

             timeout: 60000
      }
    );

    const marketCatalogues = marketCatalogueResponse.data[0]?.result || [];
    const marketIds = marketCatalogues.map(m => m.marketId);

    // 🎯 Step 3: Get market books (odds + volume)
    const marketBookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketBook',
          params: {
            marketIds: marketIds,
            priceProjection: {
              priceData: ['EX_BEST_OFFERS']
            }
          },
          id: 3
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        },
            httpsAgent: agent, // certificate ke saath

              timeout: 60000
      }
    );

    const marketBooks = marketBookResponse.data[0]?.result || [];

    // 🔄 Combine data
    // 🔄 Combine data
const finalData = marketCatalogues.map(market => {
  const matchingBook = marketBooks.find(b => b.marketId === market.marketId);
  const event = events.find(e => e.event.id === market.event.id);

  const selections = market.runners.map(runner => {
    const runnerBook = matchingBook?.runners.find(r => r.selectionId === runner.selectionId);
    return {
      name: runner.runnerName,
      back: runnerBook?.ex?.availableToBack?.[0] || { price: '-', size: '-' },
      lay: runnerBook?.ex?.availableToLay?.[0] || { price: '-', size: '-' }
    };
  });

  // 🧠 Assume:
  // selections[0] = team 1
  // selections[1] = X (draw) — only in soccer
  // selections[2] = team 2

  const odds = {
    back1: selections[0]?.back || { price: '-', size: '-' },
    lay1: selections[0]?.lay || { price: '-', size: '-' },
    backX: selections[1]?.back || { price: '-', size: '-' },
    layX: selections[1]?.lay || { price: '-', size: '-' },
    back2: selections[2]?.back || { price: '-', size: '-' },
    lay2: selections[2]?.lay || { price: '-', size: '-' }
  };

  return {
    marketId: market.marketId,
    match: event?.event.name || 'Unknown',
    startTime: event?.event.openDate || '',
    marketStatus: matchingBook?.status || 'UNKNOWN',
    totalMatched: matchingBook?.totalMatched || 0,
    odds
  };
});

    res.status(200).json({
      status: 'success',
      data: finalData
    });

  } catch (err) {
    console.error('❌ Betfair API Error:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch live cricket odds',
      error: err.message
    });
  }
});
router.get('/live/cricket/inplay', async (req, res) => {
  try {
    const sessionToken = await getSessionToken();

    // 🎯 Step 1: Get cricket events
    const eventsResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listEvents',
          params: {
            filter: { eventTypeIds: ['4'] }
          },
          id: 1
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const events = eventsResponse.data[0]?.result || [];
    const eventIds = events.map(e => e.event.id);

    // 🎯 Step 2: Get market catalogue (in-play only)
    const marketCatalogueResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketCatalogue',
          params: {
            filter: {
              eventIds: eventIds,
              marketTypeCodes: ['MATCH_ODDS'],
              inPlayOnly: true // <-- Only in-play markets
            },
            maxResults: '20',
            marketProjection: ['EVENT', 'RUNNER_METADATA']
          },
          id: 2
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketCatalogues = marketCatalogueResponse.data[0]?.result || [];
    const marketIds = marketCatalogues.map(m => m.marketId);

    // 🎯 Step 3: Get market books (odds + volume)
    const marketBookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketBook',
          params: {
            marketIds: marketIds,
            priceProjection: {
              priceData: ['EX_BEST_OFFERS']
            }
          },
          id: 3
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    let marketBooks = marketBookResponse.data[0]?.result || [];

    // 🔍 Filter only those marketBooks whose status is 'IN_PLAY'
    marketBooks = marketBooks.filter(mb => mb.marketStatus === 'IN_PLAY');

    // 🔄 Combine data ONLY for in-play events with marketBook.status == 'IN_PLAY'
    const finalData = marketCatalogues
      .filter(market => marketBooks.some(mb => mb.marketId === market.marketId))
      .map(market => {
        const matchingBook = marketBooks.find(b => b.marketId === market.marketId);
        const event = events.find(e => e.event.id === market.event.id);

        const selections = market.runners.map(runner => {
          const runnerBook = matchingBook?.runners.find(r => r.selectionId === runner.selectionId);
          return {
            name: runner.runnerName,
            back: runnerBook?.ex?.availableToBack?.[0] || { price: '-', size: '-' },
            lay: runnerBook?.ex?.availableToLay?.[0] || { price: '-', size: '-' }
          };
        });

        const odds = {
          back1: selections[0]?.back || { price: '-', size: '-' },
          lay1: selections[0]?.lay || { price: '-', size: '-' },
          backX: selections[1]?.back || { price: '-', size: '-' },
          layX: selections[1]?.lay || { price: '-', size: '-' },
          back2: selections[2]?.back || { price: '-', size: '-' },
          lay2: selections[2]?.lay || { price: '-', size: '-' }
        };

        return {
          marketId: market.marketId,
          match: event?.event.name || 'Unknown',
          startTime: event?.event.openDate || '',
          marketStatus: matchingBook?.status || 'UNKNOWN',
          inPlay: matchingBook?.inPlay || false,
          totalMatched: matchingBook?.totalMatched || 0,
          odds
        };
      });

    res.status(200).json({
      status: 'success',
      data: finalData
    });

  } catch (err) {
    console.error('❌ Betfair API Error:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch in-play cricket odds',
      error: err.message
    });
  }
});

router.get('/live/football', async (req, res) => {
  try {
    const sessionToken = await getSessionToken();

    // 🎯 Step 1: Get football events
    const eventsResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listEvents',
          params: {
            filter: {
              eventTypeIds: ['1'], // ⚽ Football
              // marketStartTime: {
              //   from: new Date().toISOString()
              // }
            }
          },
          id: 1
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const events = eventsResponse.data[0]?.result || [];
    const eventIds = events.map(e => e.event.id);

    // 🎯 Step 2: Get market catalogue
    const marketCatalogueResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketCatalogue',
          params: {
            filter: {
              eventIds: eventIds,
              marketTypeCodes: ['MATCH_ODDS']
            },
            maxResults: '10',
            marketProjection: ['EVENT', 'RUNNER_METADATA']
          },
          id: 2
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketCatalogues = marketCatalogueResponse.data[0]?.result || [];
    const marketIds = marketCatalogues.map(m => m.marketId);

    // 🎯 Step 3: Get market books (odds + volume)
    const marketBookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketBook',
          params: {
            marketIds: marketIds,
            priceProjection: {
              priceData: ['EX_BEST_OFFERS']
            }
          },
          id: 3
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketBooks = marketBookResponse.data[0]?.result || [];

    // 🔄 Combine data like cricket
    const finalData = marketCatalogues.map(market => {
      const matchingBook = marketBooks.find(b => b.marketId === market.marketId);
      const event = events.find(e => e.event.id === market.event.id);

      const selections = market.runners.map(runner => {
        const runnerBook = matchingBook?.runners.find(r => r.selectionId === runner.selectionId);
        return {
          name: runner.runnerName,
          back: runnerBook?.ex?.availableToBack?.[0] || { price: '-', size: '-' },
          lay: runnerBook?.ex?.availableToLay?.[0] || { price: '-', size: '-' }
        };
      });

      // 🧠 Assume:
      // selections[0] = team 1
      // selections[1] = X (draw)
      // selections[2] = team 2

      const odds = {
        back1: selections[0]?.back || { price: '-', size: '-' },
        lay1: selections[0]?.lay || { price: '-', size: '-' },
        backX: selections[1]?.back || { price: '-', size: '-' },
        layX: selections[1]?.lay || { price: '-', size: '-' },
        back2: selections[2]?.back || { price: '-', size: '-' },
        lay2: selections[2]?.lay || { price: '-', size: '-' }
      };

      return {
        marketId: market.marketId,
        match: event?.event.name || 'Unknown',
        startTime: event?.event.openDate || '',
        marketStatus: matchingBook?.status || 'UNKNOWN',
        totalMatched: matchingBook?.totalMatched || 0,
        odds
      };
    });

    res.status(200).json({
      status: 'success',
      data: finalData
    });

  } catch (err) {
    console.error('❌ Betfair API Error:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch live football odds',
      error: err.message
    });
  }
});
router.get('/live/sports/:id', async (req, res) => {
  try {
    const sessionToken = await getSessionToken();

    // If /live/sports/:id, get single marketId
    const singleMarketId = req.params.id;

    // Accept eventTypeIds and marketIds as query params (for /live/sports)
    let eventTypeIds = [];
    if (req.query.eventTypeIds) {
      eventTypeIds = req.query.eventTypeIds.split(',');
    }
    let filter = {
      marketStartTime: {
        from: new Date().toISOString()
      }
    };
    if (eventTypeIds.length > 0) filter.eventTypeIds = eventTypeIds;

    // 1. Get all sports events
    const eventsResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listEvents',
          params: { filter },
          id: 1
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const events = eventsResponse.data[0]?.result || [];
    const eventIds = events.map(e => e.event.id);

    if (!eventIds.length) {
      return res.status(200).json({
        status: 'success',
        data: []
      });
    }

    // 2. Get market catalogue (MATCH_ODDS) for these events
    const marketCatalogueResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketCatalogue',
          params: {
            filter: {
              eventIds: eventIds,
              marketTypeCodes: ['MATCH_ODDS']
            },
            maxResults: '100',
            marketProjection: ['EVENT', 'RUNNER_METADATA']
          },
          id: 2
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    let marketCatalogues = marketCatalogueResponse.data[0]?.result || [];
    let marketIds = marketCatalogues.map(m => m.marketId);

    // Filter by singleMarketId for /live/sports/:id
    if (singleMarketId) {
      marketCatalogues = marketCatalogues.filter(m => m.marketId === singleMarketId);
      marketIds = [singleMarketId];
    }
    // Or filter by marketIds query for /live/sports
    else if (req.query.marketIds) {
      const filterMarketIds = req.query.marketIds.split(',');
      marketCatalogues = marketCatalogues.filter(m => filterMarketIds.includes(m.marketId));
      marketIds = marketCatalogues.map(m => m.marketId);
    }

    if (!marketIds.length) {
      return res.status(200).json({
        status: 'success',
        data: []
      });
    }

    // 3. Get market books (odds + volume)
    const marketBookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketBook',
          params: {
            marketIds: marketIds,
            priceProjection: {
              priceData: ['EX_BEST_OFFERS']
            }
          },
          id: 3
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketBooks = marketBookResponse.data[0]?.result || [];

    // 4. Combine all data into desired format
    const finalData = marketCatalogues.map(market => {
      const matchingBook = marketBooks.find(b => b.marketId === market.marketId);
      const event = events.find(e => e.event.id === market.event.id);

      const selections = market.runners.map(runner => {
        const runnerBook = matchingBook?.runners.find(r => r.selectionId === runner.selectionId);
        return {
          name: runner.runnerName,
          back: runnerBook?.ex?.availableToBack?.[0] || { price: '-', size: '-' },
          lay: runnerBook?.ex?.availableToLay?.[0] || { price: '-', size: '-' }
        };
      });

      const odds = {
        back1: selections[0]?.back || { price: '-', size: '-' },
        lay1: selections[0]?.lay || { price: '-', size: '-' },
        backX: selections[1]?.back || { price: '-', size: '-' },
        layX: selections[1]?.lay || { price: '-', size: '-' },
        back2: selections[2]?.back || { price: '-', size: '-' },
        lay2: selections[2]?.lay || { price: '-', size: '-' }
      };

      return {
        marketId: market.marketId,
        match: event?.event.name || 'Unknown',
        startTime: event?.event.openDate || '',
        sportId: event?.event.eventTypeId || '',
        inPlay: matchingBook?.inPlay || false,
        totalMatched: matchingBook?.totalMatched || 0,
        odds,
        runners: market.runners,
        marketBook: matchingBook
      };
    });

    res.status(200).json({
      status: 'success',
      data: finalData
    });

  } catch (err) {
    console.error('❌ Betfair API Error:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch live sports odds',
      error: err.message
    });
  }
});



router.get('/live/tennis', async (req, res) => {
  try {
    const sessionToken = await getSessionToken();

    // Step 1: Get tennis events
    const eventsResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listEvents',
          params: {
            filter: {
              eventTypeIds: ['2'],
              marketStartTime: {
                from: new Date().toISOString()
              }
            }
          },
          id: 1
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    let events = eventsResponse.data[0]?.result || [];

    // Filter out unwanted names
    events = events.filter(item => {
      const name = item.event.name.toLowerCase();
      return !name.includes('set') && !name.includes('game') && !name.includes('odds');
    });

    const eventIds = events.map(e => e.event.id);

    // Step 2: Get market catalogue
    const marketCatalogueResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketCatalogue',
          params: {
            filter: {
              eventIds: eventIds,
              marketTypeCodes: ['MATCH_ODDS']
            },
            maxResults: '20',
            marketProjection: ['EVENT', 'RUNNER_METADATA']
          },
          id: 2
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketCatalogues = marketCatalogueResponse.data[0]?.result || [];
    const marketIds = marketCatalogues.map(m => m.marketId);

    // Step 3: Get market books
    const marketBookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketBook',
          params: {
            marketIds: marketIds,
            priceProjection: {
              priceData: ['EX_BEST_OFFERS']
            }
          },
          id: 3
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketBooks = marketBookResponse.data[0]?.result || [];

    // Final Combine (same as cricket style)
    const finalData = marketCatalogues.map(market => {
      const matchingBook = marketBooks.find(b => b.marketId === market.marketId);
      const event = events.find(e => e.event.id === market.event.id);

      const selections = market.runners.map(runner => {
        const runnerBook = matchingBook?.runners.find(r => r.selectionId === runner.selectionId);
        return {
          name: runner.runnerName,
          back: runnerBook?.ex?.availableToBack?.[0] || { price: '-', size: '-' },
          lay: runnerBook?.ex?.availableToLay?.[0] || { price: '-', size: '-' }
        };
      });

      const odds = {
        back1: selections[0]?.back || { price: '-', size: '-' },
        lay1: selections[0]?.lay || { price: '-', size: '-' },
        back2: selections[1]?.back || { price: '-', size: '-' },
        lay2: selections[1]?.lay || { price: '-', size: '-' },
        backX: selections[1]?.back || { price: '-', size: '-' },
        layX: selections[1]?.lay || { price: '-', size: '-' }

      };

      return {
        marketId: market.marketId,
        match: event?.event.name || 'Unknown',
        startTime: event?.event.openDate || '',
        inPlay: matchingBook?.inPlay || false,
        totalMatched: matchingBook?.totalMatched || 0,
        odds
      };
    });

    res.status(200).json({
      status: 'success',
      data: finalData
    });

  } catch (err) {
    console.error('🎾 Tennis API Error:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch tennis data',
      error: err.message
    });
  }
});



router.get('/live/horse', async (req, res) => {
  try {
    const sessionToken = await getSessionToken();

    // 🐎 Step 1: Get horse racing events (with broader filters)
    const eventsResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listEvents',
          params: {
            filter: {
              eventTypeIds: ['7'], // Horse Racing
              marketCountries: ['GB', 'IE', 'AU'], // Include common horse racing regions
              marketStartTime: {
                // 3 hours back from now to catch ongoing + upcoming races
                from: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
              }
            }
          },
          id: 1
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    // 🧩 Check event results
    const events = eventsResponse.data[0]?.result || [];
    console.log(`🐎 Horse racing events found: ${events.length}`);
    if (events.length === 0) {
      console.warn('⚠️ No horse racing events returned from Betfair.');
      return res.status(200).json({
        status: 'success',
        message: 'No racing found (possible timing or region restriction)',
        data: []
      });
    }

    const eventIds = events.map(e => e.event.id);

    // 🐎 Step 2: Get market catalogue (WIN markets)
    const marketCatalogueResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketCatalogue',
          params: {
            filter: {
              eventIds: eventIds
            },
            maxResults: '1000',
            marketProjection: ['EVENT', 'RUNNER_METADATA']
          },
          id: 2
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketCatalogues = marketCatalogueResponse.data[0]?.result || [];
    const marketIds = marketCatalogues.map(m => m.marketId);
    console.log(`📊 Market catalogues found: ${marketCatalogues.length}`);

    if (marketIds.length === 0) {
      console.warn('⚠️ No markets found for current events.');
      return res.status(200).json({
        status: 'success',
        message: 'No markets found for current events',
        data: []
      });
    }

    // 🐎 Step 3: Get market books (odds + volume)
    const marketBookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketBook',
          params: {
            marketIds: marketIds,
            priceProjection: {
              priceData: ['EX_BEST_OFFERS']
            }
          },
          id: 3
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketBooks = marketBookResponse.data[0]?.result || [];
    console.log(`💰 Market books found: ${marketBooks.length}`);

    // 🔄 Combine event + market + odds data
    const finalData = marketCatalogues.map(market => {
      const matchingBook = marketBooks.find(b => b.marketId === market.marketId);
      const event = events.find(e => e.event.id === market.event.id);

      return {
        marketId: market.marketId,
        match: event?.event.name || 'Unknown Event',
        startTime: event?.event.openDate || 'N/A',
        marketStatus: matchingBook?.status || 'UNKNOWN',
        totalMatched: matchingBook?.totalMatched || 0,
        selections: market.runners.map(runner => {
          const runnerBook = matchingBook?.runners.find(r => r.selectionId === runner.selectionId);
          return {
            name: runner.runnerName,
            back: runnerBook?.ex?.availableToBack?.slice(0, 3).map(b => ({
              price: b.price,
              size: b.size
            })) || [],
            lay: runnerBook?.ex?.availableToLay?.slice(0, 3).map(l => ({
              price: l.price,
              size: l.size
            })) || []
          };
        })
      };
    });

    // 📅 Sort by start time (ascending)
    finalData.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    // ✅ Final response
    res.status(200).json({
      status: 'success',
      count: finalData.length,
      data: finalData
    });

  } catch (err) {
    console.error('❌ Horse Racing API Error:', err.response?.data || err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch horse racing odds',
      error: err.message
    });
  }
});




const sportMap = {
  1: { name: "Soccer", image: "soccer.svg" },
  2: { name: "Tennis", image: "tennis.svg" },
  3: { name: "Basketball", image: "basketball.svg" },
  4: { name: "Cricket", image: "cricket.svg" },
  5: { name: "American Football", image: "american_football.svg" },
  6: { name: "Baseball", image: "baseball.svg" },
  7: { name: "Golf", image: "golf.svg" },
  4339: { name: "Horse Racing", image: "horse.svg" },
  // Apne hisaab se aur bhi add kar sakte hain
};

router.get('/catalog2', async (req, res) => {
  try {
    const marketId = req.query.id;

    if (!marketId) {
      return res.status(400).json({ error: "marketId is required in query parameters" });
    }

    const token = await getSessionToken();

    const headers = {
      'X-Application': APP_KEY,
      'X-Authentication': token,
      'Content-Type': 'application/json'
    };

    // 🧠 1. Get Market Catalogue
    const catalogResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [{
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketCatalogue",
        params: {
          filter: { marketIds: [marketId] },
          marketProjection: [
            "EVENT",
            "MARKET_START_TIME",
            "RUNNER_DESCRIPTION",
            "COMPETITION",
            "MARKET_DESCRIPTION",
            "EVENT_TYPE" // Ensure EVENT_TYPE is included
          ],
          maxResults: "1"
        },
        id: 1
      }],
      { headers }
    );

    const catalog = catalogResponse.data[0]?.result?.[0];
    if (!catalog) {
      return res.status(404).json({ error: "Market catalog not found" });
    }

    const rules = catalog.description?.rules || "No rules available.";

    // 🧠 2. Get Market Book
    const bookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [{
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketBook",
        params: {
          marketIds: [marketId],
          priceProjection: { priceData: ["EX_BEST_OFFERS"] }
        },
        id: 2
      }],
      { headers }
    );

    const book = bookResponse.data[0]?.result?.[0];
    if (!book) {
      return res.status(404).json({ error: "Market book not found" });
    }
  // ... (previous code remains the same until sport mapping)

const eventTypeId = catalog.eventType?.id || null; // Correctly extract eventTypeId
const eventTypeName = catalog.eventType?.name || "Unknown"; // Extract eventType name

const sportMapById = {
  "4": "Cricket",
  "2": "Tennis",
  "7": "Horse Racing",
  "1": "Football",
  "4339": "Greyhound",  // Greyhound ka ID (jo betfair ka hai, yeh check kar lena)
  // Agar aur sports chahiye to yahan add kar sakte ho
};

const sportIconMap = {
  "Cricket": "cricket.svg",
  "Tennis": "tennis.svg",
  "Horse Racing": "horse.svg",
  "Football": "soccer.svg",
  "Greyhound": "greyhound-racing.svg",  // Greyhound ka icon file
  "Unknown": "default.svg",
};

let sportName = eventTypeName; // Use the eventType name directly
if (eventTypeId && sportMapById[eventTypeId]) {
  sportName = sportMapById[eventTypeId]; // Override with mapped name if ID exists
}

const sportIcon = sportIconMap[sportName] || "default.svg";

    const response = {
      marketId: catalog.marketId,
      marketName: catalog.marketName,
      marketStartTime: catalog.marketStartTime,
      suspendTime: null,
      settleTime: null,
      bettingType: catalog.description?.bettingType || "ODDS",
      isTurnInPlayEnabled: book.isTurnInPlay,
      marketType: catalog.marketType,
      priceLadderDetails: catalog.description?.priceLadderDescription || "CLASSIC",
      eventTypeId: eventTypeId,
      eventType: sportName,

      eventId: catalog.event?.id,
      eventName: catalog.event?.name,
      competitionId: catalog.competition?.id,
      winners: catalog.description?.numberOfWinners || 1,
      status: book.status,
      countryCode: catalog.description?.countryCode || "GB",
      rules: rules,
      maxBetSize: 5000000,
      origin: "BETFAIR",
      externalId: null,
      settleAttempts: 0,
      maxExposure: 30000000,
      betDelay: book.betDelay,
      news: "",
      unmatchBet: true,
      sizeOverride: false,
      sortPriority: -1,
      cancelDelay: 0,
      maxOdds: 120,
      runners: catalog.runners.map(runner => ({
        marketId: catalog.marketId,
        selectionId: runner.selectionId,
        runnerName: runner.runnerName,
        handicap: runner.handicap,
        sortPriority: runner.sortPriority,
        status: "ACTIVE",
        removalDate: null,
        silkColor: "",
        score: null,
        adjFactor: null,
        metadata: JSON.stringify({ runnerId: runner.selectionId }),
        jockeyName: "",
        trainerName: "",
        age: "",
        weight: "",
        lastRun: "",
        wearing: "",
        state: 0
      })),

      sport: {
      name: sportName,
      image: sportIcon,

        active: true,
        // image: "cricket.svg",
        autoOpen: false,
        allowSubMarkets: false,
        amountRequired: 100000,
        maxBet: 5000000,
        autoOpenMinutes: 9999,
        betDelay: 0,
        unmatchBet: true
      },
      marketStartTimeUtc: catalog.marketStartTime,
      suspendTimeUtc: null,
      settleTimeUtc: null,
      raceName: null,
      minutesToOpenMarket: 9999,
      statusOverride: 0,
      hasFancyOdds: false,
      isFancy: false,
      isLocalFancy: false,
      isBmMarket: true,
      eventType: "Cricket",
      hasSessionMarkets: false,
      hasBookmakerMarkets: false,
      updatedAt: new Date().toISOString(),
      casinoPl: null,
      removedRunnersCount: 0,
      state: 0
    };

    return res.json(response);

  } catch (err) {
    console.error("Catalog2 Error:", err.message);
    return res.status(500).json({
      error: "Failed to fetch catalog2 market",
      details: err.response?.statusText || err.message
    });
  }
});



router.get('/Data', async (req, res) => {
  const marketId = req.query.id;
  if (!marketId) {
    return res.status(400).json({ status: 'error', message: 'Market ID is required' });
  }

  try {
    const token = await getSessionToken();
    const headers = {
      'X-Application': APP_KEY,
      'X-Authentication': token,
      'Content-Type': 'application/json'
    };

    // Step 1: Get runners info from MarketCatalogue
    const catalogRes = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [{
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketCatalogue",
        params: {
          filter: { marketIds: [marketId] },
          marketProjection: ["RUNNER_DESCRIPTION"],
          maxResults: "1"
        },
        id: 1
      }],
      { headers }
    );
    const catalog = catalogRes.data[0]?.result?.[0];
    // Map: selectionId => runnerName
    const runnerMap = {};
    if (catalog && catalog.runners) {
      catalog.runners.forEach(r => {
        runnerMap[r.selectionId] = r.runnerName;
      });
    }

    // Step 2: Get MarketBook (odds)
    const bookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [{
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketBook",
        params: {
          marketIds: [marketId],
          priceProjection: { priceData: ["EX_BEST_OFFERS"] }
        },
        id: 2
      }],
      { headers }
    );

    const bfBook = bookResponse.data[0]?.result;
    let marketBooks = [];
    if (bfBook && bfBook.length) {
      marketBooks = bfBook.map(book => ({
        id: book.marketId,
        winners: 1,
        betDelay: book.betDelay,
        totalMatched: book.totalMatched,
        marketStatus: book.status,
        maxBetSize: 0,
        bettingAllowed: true,
        isMarketDataDelayed: book.isMarketDataDelayed,
        runners: book.runners.map(runner => ({
          id: runner.selectionId,
          name: runnerMap[runner.selectionId] || '', // Yeh runner ka naam hai (frontend ke liye zaroori!)
          price1: runner.ex.availableToBack?.[0]?.price || 0,
          price2: runner.ex.availableToBack?.[1]?.price || 0,
          price3: runner.ex.availableToBack?.[2]?.price || 0,
          size1: runner.ex.availableToBack?.[0]?.size || 0,
          size2: runner.ex.availableToBack?.[1]?.size || 0,
          size3: runner.ex.availableToBack?.[2]?.size || 0,
          lay1: runner.ex.availableToLay?.[0]?.price || 0,
          lay2: runner.ex.availableToLay?.[1]?.price || 0,
          lay3: runner.ex.availableToLay?.[2]?.price || 0,
          ls1: runner.ex.availableToLay?.[0]?.size || 0,
          ls2: runner.ex.availableToLay?.[1]?.size || 0,
          ls3: runner.ex.availableToLay?.[2]?.size || 0,
          status: runner.status,
          handicap: runner.handicap
        })),
        isRoot: false,
        timestamp: book.lastMatchTime || "0001-01-01T00:00:00",
        winnerIDs: []
      }));
    }

    res.json({
      requestId: uuidv4(),
      marketBooks,
      news: ""
    });

  } catch (err) {
    console.error('❌ Error in GET /Data/:id:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch market from Betfair or scoreboard provider',
      details: err.response?.statusText || err.message
    });
  }
});
router.get('/Navigation', async (req, res) => {
  const id = req.query.id || "0";
  const type = parseInt(req.query.type || "0", 10);

  try {
    const token = await getSessionToken();

    const headers = {
      'X-Application': APP_KEY,
      'X-Authentication': token,
      'Content-Type': 'application/json'
    };

    let method = "";
    let params = {};

    if (type === 0 && id === "0") {
      // 🟢 Step 1: Get all sports
      method = "SportsAPING/v1.0/listEventTypes";
      params = { filter: {} };

    } else if (type === 0 && id !== "0") {
      // 🟢 Step 2: Get competitions for a sport
      method = "SportsAPING/v1.0/listCompetitions";
      params = { filter: { eventTypeIds: [id] } };

    } else if (type === 1) {
      // 🟢 Step 3: Get events for a competition
      method = "SportsAPING/v1.0/listEvents";
      params = { filter: { competitionIds: [id] } };

    } else if (type === 2) {
      // 🟢 Step 4: Get markets for an event
      method = "SportsAPING/v1.0/listMarketCatalogue";
      params = {
        filter: { eventIds: [id] },
        maxResults: "100",
        marketProjection: ["EVENT", "MARKET_START_TIME"]
      };
    } else {
      return res.status(400).json({ status: 'error', message: 'Invalid type or id' });
    }

    // ✅ Betfair API Call
    const bfRes = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [{
        jsonrpc: "2.0",
        method,
        params,
        id: 1
      }],
      { headers }
    );

    const data = bfRes.data[0]?.result || [];

    // ✅ Map to required format
    const mappedData = data.map(item => {
      if (type === 0 && id === "0") {
        // Sports
        return {
          id: item.eventType.id.toString(),
          name: item.eventType.name,
          type: 1,
          startTime: null,
          countryCode: null,
          venue: null,
          marketType: null,
          numberOfWinners: null,
          eventId: null,
          parents: null
        };
      } else if (type === 0 && id !== "0") {
        // Competitions
        return {
          id: item.competition.id.toString(),
          name: item.competition.name,
          type: 2,
          startTime: null,
          countryCode: null,
          venue: null,
          marketType: null,
          numberOfWinners: null,
          eventId: null,
          parents: null
        };
      } else if (type === 1) {
        // Events
        return {
          id: item.event.id.toString(),
          name: item.event.name,
          type: 3,
          startTime: item.event.openDate || null,
          countryCode: item.event.countryCode || null,
          venue: item.event.venue || null,
          marketType: null,
          numberOfWinners: null,
          eventId: null,
          parents: null
        };
      } else if (type === 2) {
        // Markets
        return {
          id: item.marketId,
          name: item.marketName,
          type: 4,
          startTime: item.marketStartTime || null,
          countryCode: null,
          venue: null,
          marketType: item.marketName || null,
          numberOfWinners: item.numberOfWinners || null,
          eventId: item.event?.id || null,
          parents: null
        };
      }
    });

    res.json({
      requestId: uuidv4(),
      data: mappedData
    });

  } catch (err) {
    console.error('❌ Error in GET /api/Navigation:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch navigation data from Betfair',
      details: err.response?.statusText || err.message
    });
  }
});


// Ab express.listen ki jagah server.listen


router.get('/live/greyhound', async (req, res) => {
  try {
    const sessionToken = await getSessionToken();

    // 🐕 Step 1: Get greyhound racing events
    const eventsResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listEvents',
          params: {
            filter: {
              eventTypeIds: ['4339'], // Greyhound Racing
              marketStartTime: {
                from: new Date().toISOString()
              },
              // marketCountries: ['AU', 'GB'] // Optional: restrict to specific countries
            }
          },
          id: 1
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const events = eventsResponse.data[0]?.result || [];
    const eventIds = events.map(e => e.event.id);

    // 🐕 Step 2: Get market catalogue (WIN markets)
    const marketCatalogueResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketCatalogue',
          params: {
            filter: {
              eventIds: eventIds,
              marketTypeCodes: ['WIN']
            },
            maxResults: '1000',
            marketProjection: ['EVENT', 'RUNNER_METADATA']
          },
          id: 2
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketCatalogues = marketCatalogueResponse.data[0]?.result || [];
    const marketIds = marketCatalogues.map(m => m.marketId);

    // 🐕 Step 3: Get market books (odds + volume)
    const marketBookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: 'SportsAPING/v1.0/listMarketBook',
          params: {
            marketIds: marketIds,
            priceProjection: {
              priceData: ['EX_BEST_OFFERS']
            }
          },
          id: 3
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const marketBooks = marketBookResponse.data[0]?.result || [];

    // 🔄 Combine data
    let finalData = marketCatalogues.map(market => {
      const matchingBook = marketBooks.find(b => b.marketId === market.marketId);
      const event = events.find(e => e.event.id === market.event.id);

      return {
        marketId: market.marketId,
        match: event?.event.name,
        startTime: event?.event.openDate,
        totalMatched: matchingBook?.totalMatched || 0,
        selections: market.runners.map(runner => {
          const runnerBook = matchingBook?.runners.find(r => r.selectionId === runner.selectionId);
          return {
            name: runner.runnerName,
            back: runnerBook?.ex?.availableToBack?.slice(0, 3).map(b => ({
              price: b.price,
              size: b.size
            })) || [],
            lay: runnerBook?.ex?.availableToLay?.slice(0, 3).map(l => ({
              price: l.price,
              size: l.size
            })) || []
          };
        })
      };
    });

    // 📅 Sort by start time (ascending)
    finalData.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    // 🚫 Remove duplicates having same match name *and* same start time
    finalData = finalData.filter(
      (item, index, self) =>
        index === self.findIndex(
          t => t.match === item.match && t.startTime === item.startTime
        )
    );

    // ✅ Final response
    res.status(200).json({
      status: 'success',
      data: finalData
    });

  } catch (err) {
    console.error('❌ Greyhound Racing API Error:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch greyhound racing odds',
      error: err.message
    });
  }
});


router.get('/live/:sport', async(req, res) => {
const sportName = req.params.sport.toLowerCase();

  // Map sport names to Betfair eventTypeIds
  const sportMap = {
    cricket: 4,
    horse: 4339,
    tennis: 2,
    greyhound: 4338,
    football: 1,
  };

  const eventTypeId = sportMap[sportName];
  if (!eventTypeId) {
    return res.status(400).json({ status: 'error', message: 'Invalid sport', data: [] });
  }

  try {
    const token = await getSessionToken();

    const headers = {
      'X-Application': APP_KEY,
      'X-Authentication': token,
      'Content-Type': 'application/json',
    };

    // Step 1: Get Market Catalogue for that sport (filter by eventTypeId)
    const catalogueResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [{
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketCatalogue",
        params: {
          filter: { eventTypeIds: [eventTypeId], marketStartTime: { from: new Date().toISOString() } },
          marketProjection: ["MARKET_START_TIME", "RUNNER_DESCRIPTION", "EVENT"],
          maxResults: 5
        },
        id: 1
      }],
      { headers }
    );

    const markets = catalogueResponse.data[0].result;

    if (!markets || markets.length === 0) {
      return res.json({ status: 'success', data: [] });
    }

    // Step 2: Get Market Book (odds) for these markets
    const marketIds = markets.map(m => m.marketId);

    const bookResponse = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [{
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketBook",
        params: {
          marketIds: marketIds,
          priceProjection: { priceData: ["EX_BEST_OFFERS"] }
        },
        id: 2
      }],
      { headers }
    );

    const marketBooks = bookResponse.data[0].result;

    // Merge catalog and book info into a single array
    const liveMarkets = markets.map(market => {
      const book = marketBooks.find(b => b.marketId === market.marketId);

      return {
        marketId: market.marketId,
        match: market.event.name,
        startTime: market.marketStartTime,
        inPlay: book?.inplay || false,
        totalMatched: book?.totalMatched || 0,
        odds: book?.runners?.map(runner => ({
          selectionId: runner.selectionId,
          runnerName: runner.runnerName,
          lastPriceTraded: runner.lastPriceTraded,
          availableToBack: runner.ex.availableToBack,
          availableToLay: runner.ex.availableToLay,
        })) || []
      };
    });

    return res.json({ status: 'success', data: liveMarkets });

  } catch (error) {
    console.error("Betfair API error:", error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch data', data: [] });
  }
});
router.get('/scorecard/:marketId', async (req, res) => {
  try {
    const { marketId } = req.params;
    const sessionToken = await getSessionToken();

    // ⚠️ Betfair me scorecard ke liye actual endpoint chahiye hoga
    const response = await axios.post(
      'https://api.betfair.com/exchange/betting/rest/v1.0/listMarketBook/',
      [
        {
          marketId: marketId,
          priceProjection: {
            priceData: ['EX_BEST_OFFERS']
          }
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      status: 'success',
      data: response.data
    });
  } catch (err) {
    console.error('❌ Scorecard Fetch Error:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch scorecard',
      error: err.message
    });
  }
});

router.get('/:marketId', async (req, res) => {
  try {
    const marketId = req.params.marketId;
    console.log(`Fetching market with ID: ${marketId}`);
    
    // Try to get market from database
    const db = mongoose.connection.db;
    
    // Check if markets collection exists
    const collections = await db.listCollections({ name: 'markets' }).toArray();
    if (collections.length > 0) {
      console.log('Markets collection found, fetching data...');
      
      // Get market from database
      const market = await db.collection('markets').findOne({ id: marketId });
      
      if (market) {
        console.log(`Found market ${marketId} in database`);
        
        // Remove MongoDB ID
        const { _id, ...marketData } = market;
        
        // Return market from database
        return res.json({
          status: 'success',
          data: marketData
        });
      }
    }
    
    // If market not found in database, check mock data
    const mockMarket = mockPopularMarkets.find(m => m.id === marketId);
    
    if (mockMarket) {
      console.log(`Found mock market for ID ${marketId}`);
      return res.json({
        status: 'success',
        data: {
          ...mockMarket,
          description: `${mockMarket.sport} - ${mockMarket.name}`,
          inPlay: false,
          numberOfRunners: 3,
          numberOfWinners: 1,
          totalMatched: mockMarket.total_matched,
          runners: [
            {
              selectionId: 1,
              runnerName: mockMarket.name.split(' v ')[0],
              handicap: 0,
              sortPriority: 1
            },
            {
              selectionId: 2,
              runnerName: 'Draw',
              handicap: 0,
              sortPriority: 2
            },
            {
              selectionId: 3,
              runnerName: mockMarket.name.split(' v ')[1]?.split(' / ')[0] || 'Away',
              handicap: 0,
              sortPriority: 3
            }
          ]
        }
      });
    }
    
    // Market not found
    return res.status(404).json({
      status: 'error',
      message: `Market with ID ${marketId} not found`
    });
  } catch (error) {
    console.error(`Error fetching market ${req.params.marketId}:`, error);
    return res.status(500).json({
      status: 'error',
      message: `Failed to get market ${req.params.marketId}`,
      error: error.message
    });
  }
});

// const express = require('express');
// const router = express.Router();

// ✅ Replace with your real App Key and Session Token


function getWinnerFromMarket(market) {
  if (!market.runners || !Array.isArray(market.runners)) return null;
  const winner = market.runners.find(r => r.status === "WINNER");
  return winner ? winner.selectionId : null;
}

const settledMarkets = new Set(); // memory-level tracking

async function checkMarketStatusAndSettle(market) {
  if (market.status === "CLOSED" && !settledMarkets.has(market.marketId)) {
    const winnerId = getWinnerFromMarket(market);
    if (winnerId) {
      await settleEventBets(market.marketId, winnerId);
      settledMarkets.add(market.marketId);
      console.log(`✅ Market ${market.marketId} settled with winner ${winnerId}`);
    } else {
      console.warn(`⚠️ No winner found for market ${market.marketId}`);
    }
  }
}


// Example usage after fetching market data from Betfair
async function updateMarkets() {
  const usersCollection = getUsersCollection();

  // 1️⃣ Sab users fetch karo (sirf unke orders chahiye)
  const allUsers = await usersCollection.find({}, { projection: { orders: 1 } }).toArray();

  // 2️⃣ Sab marketIds collect karo users ke orders se
  const allMarketIds = [];
  for (const user of allUsers) {
    if (!user.orders) continue;
    for (const order of user.orders) {
      if (order.status === "MATCHED" && order.marketId) {
        allMarketIds.push(order.marketId);
      }
    }
  }

  // 3️⃣ Unique marketIds nikalo
  const uniqueMarketIds = [...new Set(allMarketIds)];

  if (uniqueMarketIds.length === 0) {
    console.log("⚠️ No active markets found to update");
    return;
  }

  console.log("🔄 Running updateMarkets check for:", uniqueMarketIds);

  // 4️⃣ Betfair se in markets ka status lo
  const markets = await getMarketsFromBetfair(uniqueMarketIds);

  // 5️⃣ Har market ke liye settlement check karo
  for (const market of markets) {
    await checkMarketStatusAndSettle(market);
  }

  console.log("✅ updateMarkets executed for all active markets");
}

        

module.exports  ={
  router,
  updateMarkets

};






















      
