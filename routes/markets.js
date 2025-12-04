/**
 * Markets API Routes
 * Handles all market-related API endpoints
 */

const { v4: uuidv4 } = require('uuid');
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
// const config = require('../config');
const axios = require('axios'); // Yeh neeche likha hua hai
const { settleEventBets, autoMatchPendingBets } = require('./Orders'); // Import settleEventBets and autoMatchPendingBets functions
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
// Note: checkMatch function is defined in Orders.js and imported/used there
// This duplicate function is removed to avoid conflicts
// Use the checkMatch from Orders.js module instead

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
// 🎯 Fetch live cricket markets only
async function betfairRpc(method, params) {
  try {
    const sessionToken = await getSessionToken(); // Ensure this function exists in your scope
    const response = await axios.post(
      'https://api.betfair.com/exchange/betting/json-rpc/v1',
      [
        {
          jsonrpc: '2.0',
          method: method,
          params: params,
          id: 1
        }
      ],
      {
        headers: {
          'X-Application': APP_KEY, // Ensure APP_KEY is available
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const result = response.data[0]?.result;
    const error = response.data[0]?.error;

    if (error) {
      console.warn(`⚠️ RPC Error [${method}]:`, error);
      return null;
    }
    return result;

  } catch (err) {
    console.error(`❌ Network Error [${method}]:`, err.message);
    return null;
  }
}
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

async function betfairRpc(method, params) {
  const sessionToken = await getSessionToken();
  const res = await axios.post(
    "https://api.betfair.com/exchange/betting/json-rpc/v1",
    [
      { jsonrpc: "2.0", method, id: 1, params }
    ],
    {
      headers: {
        "X-Application": APP_KEY,
        "X-Authentication": sessionToken,
        "Content-Type": "application/json"
      }
    }
  );

  return res?.data?.[0]?.result;
}


async function betfairRpc(method, params) {
  const sessionToken = await getSessionToken();
  const res = await axios.post(
    "https://api.betfair.com/exchange/betting/json-rpc/v1",
    [
      { jsonrpc: "2.0", method, id: 1, params }
    ],
    {
      headers: {
        "X-Application": APP_KEY,
        "X-Authentication": sessionToken,
        "Content-Type": "application/json"
      }
    }
  );

  return res?.data?.[0]?.result;
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
        params
      }
    ],
    {
      headers: {
        "X-Application": APP_KEY,
        "X-Authentication": sessionToken,
        "Content-Type": "application/json"
      }
    }
  );
  return res.data[0].result;
}


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

router.get('/inplay', async (req, res) => {
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
let horseCache = [];
let lastUpdate = 0;
const POLL_INTERVAL = 30000; // 30 seconds

// Convert UTC → Pakistan Time (fixed)
function toPakistanTime(utcDateString) {
  const utcDate = new Date(utcDateString);
  // Pakistan Standard Time = UTC +5
  const pktTime = new Date(utcDate.getTime() + 5 * 60 * 60 * 1000);
  return pktTime;
}

// Fetch events
async function fetchEvents(eventTypeIds, countries) {
  const sessionToken = await getSessionToken();
  const response = await axios.post(
    "https://api.betfair.com/exchange/betting/json-rpc/v1",
    [
      {
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listEvents",
        params: {
          filter: {
            eventTypeIds,
            marketCountries: countries,
            marketStartTime: {
              from: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
              to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            },
          },
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

  return response.data[0]?.result || [];
}

// Fetch market catalogue
async function fetchMarketCatalogue(eventIds) {
  const sessionToken = await getSessionToken();
  const response = await axios.post(
    "https://api.betfair.com/exchange/betting/json-rpc/v1",
    [
      {
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketCatalogue",
        params: {
          filter: {
            eventIds,
            marketTypeCodes: ["WIN", "PLACE", "EACH_WAY"],
          },
          maxResults: "500",
          marketProjection: ["EVENT", "RUNNER_METADATA", "MARKET_START_TIME"],
        },
        id: 2,
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

  // Remove duplicate market IDs
  let markets = response.data[0]?.result || [];
  const seenMarketIds = new Set();

  markets = markets.filter((m) => {
    if (seenMarketIds.has(m.marketId)) return false;
    seenMarketIds.add(m.marketId);
    return true;
  });

  return markets;
}

// Fetch market books
async function fetchMarketBooks(marketIds) {
  const sessionToken = await getSessionToken();
  const response = await axios.post(
    "https://api.betfair.com/exchange/betting/json-rpc/v1",
    [
      {
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketBook",
        params: {
          marketIds,
          priceProjection: { priceData: ["EX_BEST_OFFERS"] },
        },
        id: 3,
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

  return response.data[0]?.result || [];
}

// Polling function
async function updateHorseCache() {
  try {
    const horseEvents = await fetchEvents(["7"], ["AU", "US", "GB"]);

    if (!horseEvents.length) {
      horseCache = [];
      lastUpdate = Date.now();
      return;
    }

    const eventIds = horseEvents.map((e) => e.event.id);
    const marketCatalogue = await fetchMarketCatalogue(eventIds);

    if (!marketCatalogue.length) {
      horseCache = [];
      lastUpdate = Date.now();
      return;
    }

    const marketIds = marketCatalogue.map((m) => m.marketId);
    const marketBooks = await fetchMarketBooks(marketIds);

    let finalData = marketCatalogue.map((market) => {
      const matchingBook = marketBooks.find(
        (b) => b.marketId === market.marketId
      );
      const event = horseEvents.find((e) => e.event.id === market.event.id);

      // Use marketStartTime if exists, otherwise fallback to event.openDate
      const startUTC = market.marketStartTime || event.event.openDate;
      const pktTime = startUTC && toPakistanTime(startUTC);

      return {
        marketId: market.marketId,
        match: event?.event.name || "Unknown Event",
        startTime: pktTime ? pktTime.toISOString() : "N/A",
        marketStatus: matchingBook?.status || "UNKNOWN",
        totalMatched: matchingBook?.totalMatched || 0,

        selections: market.runners.map((runner) => {
          const runnerBook = matchingBook?.runners.find(
            (b) => b.selectionId === runner.selectionId
          );

          return {
            name: runner.runnerName,
            back: runnerBook?.ex?.availableToBack?.slice(0, 3) || [],
            lay: runnerBook?.ex?.availableToLay?.slice(0, 3) || [],
          };
        }),
      };
    });

    // Pakistan time filtering (next 24 hours)
    const nowPKT = new Date(new Date().getTime() + 5 * 60 * 60 * 1000); // UTC+5
    const next24 = new Date(nowPKT.getTime() + 24 * 60 * 60 * 1000);

    finalData = finalData.filter((item) => {
      const t = new Date(item.startTime);
      return t >= nowPKT && t <= next24;
    });

    // Sort by Pakistan time
    finalData.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    horseCache = finalData;
    lastUpdate = Date.now();
  } catch (err) {
    console.error(
      "❌ Horse Racing API Poll Error:",
      err.response?.data || err.message
    );
  }
}

// Start polling
setInterval(updateHorseCache, POLL_INTERVAL);
updateHorseCache();

// Route
router.route("/live/horse").get((req, res) => {
  res.status(200).json({
    status: "success",
    count: horseCache.length,
    data: horseCache,
    lastUpdate: new Date(lastUpdate).toISOString(),
  });
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
// NOTE: Assuming 'axios', 'getSessionToken', and 'APP_KEY' are defined globally or imported.
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

        // 1) Fetch catalog for this market
        const initialResponse = await axios.post(
            'https://api.betfair.com/exchange/betting/json-rpc/v1',
            [{
                jsonrpc: "2.0",
                method: "SportsAPING/v1.0/listMarketCatalogue",
                params: {
                    filter: { marketIds: [marketId] },
                    marketProjection: [
                        "EVENT", "EVENT_TYPE", "MARKET_DESCRIPTION",
                        "RUNNER_DESCRIPTION", "COMPETITION", "MARKET_START_TIME"
                    ],
                    maxResults: 1
                },
                id: 1
            }],
            { headers }
        );

        const catalog = initialResponse.data[0]?.result?.[0];
        if (!catalog) return res.status(404).json({ error: "Market not found" });

        const eventTypeId = catalog.eventType?.id;
        const eventId = catalog.event?.id;

        if (!eventId) return res.status(404).json({ error: "Event ID missing" });

        // 2) Fetch all markets of the event
        const allMarketsResponse = await axios.post(
            'https://api.betfair.com/exchange/betting/json-rpc/v1',
            [{
                jsonrpc: "2.0",
                method: "SportsAPING/v1.0/listMarketCatalogue",
                params: {
                    filter: { eventIds: [eventId] },
                    marketProjection: ["MARKET_START_TIME", "RUNNER_DESCRIPTION", "MARKET_DESCRIPTION", "EVENT_TYPE",  "RUNNER_METADATA", ],
                    maxResults: 80
                },
                id: 2
            }],
            { headers }
        );

        const allMarkets = allMarketsResponse.data[0]?.result || [];
        const allMarketIds = allMarkets.map(m => m.marketId);

        // 3) Fetch books for all markets
        const booksResponse = await axios.post(
            'https://api.betfair.com/exchange/betting/json-rpc/v1',
            [{
                jsonrpc: "2.0",
                method: "SportsAPING/v1.0/listMarketBook",
                params: {
                    marketIds: allMarketIds,
                    priceProjection: { priceData: ["EX_BEST_OFFERS"], virtualise: true }
                },
                id: 3
            }],
            { headers }
        );

        const allBooks = booksResponse.data[0]?.result || [];

        // SPORT INFO
        const sportMapById = {
            "4": "Cricket",
            "2": "Tennis",
            "1": "Football",
            "7": "Horse Racing",
            "4339": "Greyhound"
        };
        const sportName = sportMapById[eventTypeId] || catalog.eventType?.name || "Unknown";

        const sportIconMap = {
            Cricket: "cricket.svg",
            Tennis: "tennis.svg",
            Football: "soccer.svg",
            "Horse Racing": "horse.svg",
            Greyhound: "greyhound-racing.svg",
            Unknown: "default.svg"
        };

        const sportIcon = sportIconMap[sportName] || "default.svg";

        /** MAP MARKET DATA */
        const mapMarketData = (catalogItem, bookItem, evTypeId) => {
            if (!bookItem) return null;

            return {
                marketId: catalogItem.marketId,
                marketName: catalogItem.marketName,
                marketType: catalogItem.description?.marketType,
                eventTypeId: evTypeId,
                bettingType: catalogItem.description?.bettingType || null,

                status: bookItem.status,
                totalMatched: bookItem.totalMatched,

                runners: catalogItem.runners.map(runner => {
                    const runnerBook = bookItem.runners.find(r => r.selectionId === runner.selectionId);
                    const md = runner.metadata || {};
                    console.log("Runner object:", runner);
                   console.log("Runner metadata:", md);

                    const back = runnerBook?.ex?.availableToBack || [];
                    const lay = runnerBook?.ex?.availableToLay || [];
// Declare ALL variables at top so they never go "not defined"
let clothNumber = null;
let jockeyName = null;
let trainerName = null;

let coloursDescription = null;
let coloursImage = null;
let silkColor = null;

if (evTypeId == 7) { // Horse Racing

    clothNumber = md.CLOTH_NUMBER || null;
    jockeyName = md.JOCKEY_NAME || null;
    trainerName = md.TRAINER_NAME || null;

    // ======================
    // Determine country based on event / venue (like Greyhound)
    // ======================
    let countryCode = "uk"; // default
    const eventName = catalog?.event?.name || "";
    const venue = catalog?.event?.venue || "";

    if (eventName.includes("US") || venue.includes("US")) countryCode = "us";
    else if (eventName.includes("AU") || venue.includes("AU")) countryCode = "au";
    else if (eventName.includes("GB") || venue.includes("UK")) countryCode = "uk";

    // ======================
    // Construct silk image URL
    // ======================
    if (clothNumber) {
        silkColor = `https://bp-silks.lhre.net/saddle/${countryCode}/${clothNumber}.svg`;
    } else {
        silkColor = `https://bp-silks.lhre.net/saddle/${countryCode}/default.svg`;
    }

    // ======================
    // Description
    // ======================
    coloursDescription = md.COLOURS_DESCRIPTION || md.WEARING || null;
    coloursImage = silkColor;
}


// MUST be declared BEFORE any IF blocks
// let clothNumber = null;
let trapColor = null;
// let silkColor = null;
// let coloursDescription = null;
// let coloursImage = null;
// let jockeyName = null;
// let trainerName = null;

// Pehle se define kiye hue variables:
// let clothNumber, jockeyName, trainerName, coloursDescription, coloursImage, silkColor;

if (evTypeId == 4339) { // Greyhound

    clothNumber = md.TRAP || runner.runnerName?.match(/\d+/)?.[0] || null;
    jockeyName = null; // Greyhound me usually jockey nahi
    trainerName = md.TRAINER_NAME || null;

    // ======================
    // Determine country based on event / venue
    // ======================
    let countryCode = "uk"; // default
    const eventName = catalog?.event?.name || "";
    const venue = catalog?.event?.venue || "";

    if (eventName.includes("US") || venue.includes("US")) countryCode = "us";
    else if (eventName.includes("AU") || venue.includes("AU")) countryCode = "au";
    else if (eventName.includes("GB") || venue.includes("UK")) countryCode = "uk";

    // ======================
    // Construct silk image URL
    // ======================
    if (clothNumber) {
        silkColor = `https://bp-silks.lhre.net/saddle/${countryCode}/${clothNumber}.svg`;
    } else {
        silkColor = `https://bp-silks.lhre.net/saddle/${countryCode}/default.svg`;
    }

    // ======================
    // Description
    // ======================
    coloursDescription = md.COLOURS_DESCRIPTION || md.WEARING || null;
    coloursImage = silkColor;
}



                    return {
                        marketId: catalogItem.marketId,
                        selectionId: runner.selectionId,
                        runnerName: runner.runnerName,
                        handicap: runner.handicap,
                        status: runnerBook?.status || "ACTIVE",

                        silkColor,
                        clothNumber,
                        trapColor,

                        jockeyName: md.JOCKEY_NAME || null,
                        trainerName: md.TRAINER_NAME || null,
                        metadataDict: md,
                         coloursDescription, // ✅ new textual description
                        coloursImage,       // ✅ image URL

                        price1: back[0]?.price || 0,
                        size1: back[0]?.size || 0,
                        price2: back[1]?.price || 0,
                        size2: back[1]?.size || 0,
                        price3: back[2]?.price || 0,
                        size3: back[2]?.size || 0,

                        lay1: lay[0]?.price || 0,
                        ls1: lay[0]?.size || 0,
                        lay2: lay[1]?.price || 0,
                        ls2: lay[1]?.size || 0,
                        lay3: lay[2]?.price || 0,
                        ls3: lay[2]?.size || 0
                    };
                })
            };
        };

        // GROUPING
        const marketGroups = {
            Catalog: [],
            BookmakerMarkets: [],
            TossMarkets: [],
            FancyMarkets: [],
            Fancy2Markets: [],
            FigureMarkets: [],
            OddFigureMarkets: [],
            OtherMarkets: [],
            OtherRaceMarkets: []
        };

        allMarkets.forEach(cat => {
            const book = allBooks.find(b => b.marketId === cat.marketId);
            if (!book) return;

            const mapped = mapMarketData(cat, book, eventTypeId);
            if (!mapped) return;

            const mType = cat.description?.marketType || "";
            const mName = cat.marketName.toLowerCase();

            if (sportName === "Cricket") {
                if (mType === "MATCH_ODDS") marketGroups.Catalog.push(mapped);
                else if (mType === "BOOKMAKER" || mName.includes("bookmaker")) marketGroups.BookmakerMarkets.push(mapped);
                else if (mType === "TOSS") marketGroups.TossMarkets.push(mapped);
                else if (mType === "ODD_FIGURE") marketGroups.OddFigureMarkets.push(mapped);
                else if (mType === "FIGURE") marketGroups.FigureMarkets.push(mapped);
                else if (mType === "LINE") marketGroups.FancyMarkets.push(mapped);
                else marketGroups.OtherMarkets.push(mapped);

            } else if (eventTypeId == 7 || eventTypeId == 4339) {
                marketGroups.OtherRaceMarkets.push(mapped);

            } else {
                if (mType === "MATCH_ODDS") marketGroups.Catalog.push(mapped);
                else marketGroups.OtherMarkets.push(mapped);
            }
        });

        const subMarkets = [
            ...marketGroups.BookmakerMarkets,
            ...marketGroups.FancyMarkets,
            ...marketGroups.Fancy2Markets,
            ...marketGroups.FigureMarkets,
            ...marketGroups.OddFigureMarkets,
            ...marketGroups.OtherMarkets,
            ...marketGroups.OtherRaceMarkets
        ];

        let mainCatalogEntry = subMarkets.find(m => m.marketId === marketId);
        if (!mainCatalogEntry) {
            const initialBook = allBooks.find(b => b.marketId === marketId);
            if (!initialBook) return res.status(404).json({ error: "Market book missing" });

            mainCatalogEntry = mapMarketData(catalog, initialBook, eventTypeId);
        }

        // FINAL RESPONSE
        return res.json({
            marketId: mainCatalogEntry.marketId,
            marketName: mainCatalogEntry.marketName,
            marketStartTimeUtc: catalog.marketStartTime,

            status: mainCatalogEntry.status,
            runners: mainCatalogEntry.runners,

            eventTypeId,
            eventType: sportName,

            eventId,
            eventName: catalog.event?.name,
            competitionId: catalog.competition?.id,
            competitionName: catalog.competition?.name,

            sport: { name: sportName, image: sportIcon, active: true },

            BookmakerMarkets: marketGroups.BookmakerMarkets,
            TossMarkets: marketGroups.TossMarkets,
            FancyMarkets: marketGroups.FancyMarkets,
            Fancy2Markets: marketGroups.Fancy2Markets,
            FigureMarkets: marketGroups.FigureMarkets,
            OddFigureMarkets: marketGroups.OddFigureMarkets,
            OtherMarkets: marketGroups.OtherMarkets,
            OtherRaceMarkets: marketGroups.OtherRaceMarkets,

            subMarkets,
            updatedAt: new Date().toISOString(),
            state: 0
        });

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

    // MarketCatalogue se runner names
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
    const runnerMap = {};
    if (catalog && catalog.runners) {
      catalog.runners.forEach(r => {
        runnerMap[r.selectionId] = r.runnerName;
      });
    }

    // MarketBook (odds) fetch
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
          id: runner.selectionId.toString(),
          name: runnerMap[runner.selectionId] || '',  // har runner ka naam
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
          handicap: runner.handicap || 0
        })),
        isRoot: false,
        timestamp: book.lastMatchTime || "0001-01-01T00:00:00",
        winnerIDs: []
      }));
    }

    // Scores data (optional)
    const scores = {
      home: catalog?.runners?.[0]?.runnerName || "",
      away: catalog?.runners?.[1]?.runnerName || "",
      currentSet: 0,
      runs: [],
      wickets: []
    };

    res.json({
      requestId: uuidv4(),
      marketBooks,
      news: "",
      scores
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

// --- GLOBAL CACHE ---
/* ========= GREYHOUND FIXED VERSION ========= */

let greyhoundCache = [];
let lastUpdateGreyhound = 0;

const POLL_INTERVAL_g = 5000; // Greyhound requires < 10 sec polling

// Store last valid MarketBooks to prevent data disappearing
let lastKnownGreyhoundBooks = new Map();

// Convert UTC → Pakistan Time
function toPakistanTime(utcDateString) {
  const utcDate = new Date(utcDateString);
  return new Date(utcDate.getTime() + 5 * 60 * 60 * 1000); // UTC+5
}

// Fetch Greyhound events
async function fetchGreyhoundEvents(eventTypeIds, countries) {
  const sessionToken = await getSessionToken();
  const response = await axios.post(
    "https://api.betfair.com/exchange/betting/json-rpc/v1",
    [
      {
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listEvents",
        params: {
          filter: {
            eventTypeIds,
            marketCountries: countries,
            marketStartTime: {
              from: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // last 1h
              to: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() // next 12h
            },
          },
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
  return response.data[0]?.result || [];
}

// Fetch market catalogue
async function fetchGreyhoundMarketCatalogue(eventIds) {
  const sessionToken = await getSessionToken();
  const response = await axios.post(
    "https://api.betfair.com/exchange/betting/json-rpc/v1",
    [
      {
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketCatalogue",
        params: {
          filter: {
            eventIds,
            marketTypeCodes: ["WIN"],
          },
          maxResults: "200",
          marketProjection: ["EVENT", "RUNNER_METADATA", "MARKET_START_TIME"],
        },
        id: 2,
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

  return response.data[0]?.result || [];
}

// Fetch market books (FIXED VERSION)
async function fetchGreyhoundMarketBooks(marketIds) {
  const sessionToken = await getSessionToken();
  const response = await axios.post(
    "https://api.betfair.com/exchange/betting/json-rpc/v1",
    [
      {
        jsonrpc: "2.0",
        method: "SportsAPING/v1.0/listMarketBook",
        params: {
          marketIds,
          // FIX 1: Greyhound requires full projection + virtualise
          priceProjection: { 
            priceData: ["EX_BEST_OFFERS", "EX_TRADED", "EX_ALL_OFFERS"],
            virtualise: true
          },
          orderProjection: "ALL",
          matchProjection: "ROLLED_UP_BY_PRICE"
        },
        id: 3,
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

  const books = response.data[0]?.result || [];

  // FIX 2: Cache last valid book per market
  books.forEach(book => {
    if (book.runners && book.runners.length > 0) {
      lastKnownGreyhoundBooks.set(book.marketId, book);
    } else {
      // if empty → use last known snapshot
      if (lastKnownGreyhoundBooks.has(book.marketId)) {
        books[books.indexOf(book)] = lastKnownGreyhoundBooks.get(book.marketId);
      }
    }
  });

  return books;
}

// Polling function
async function updateGreyhoundCache() {
  try {
    const events = await fetchGreyhoundEvents(["4339"], ["AU", "GB"]);

    if (!events.length) {
      greyhoundCache = [];
      lastUpdateGreyhound = Date.now();
      return;
    }

    const eventIds = events.map(e => e.event.id);
    const marketCatalogue = await fetchGreyhoundMarketCatalogue(eventIds);

    if (!marketCatalogue.length) {
      greyhoundCache = [];
      lastUpdateGreyhound = Date.now();
      return;
    }

    const marketIds = marketCatalogue.map(m => m.marketId);
    const marketBooks = await fetchGreyhoundMarketBooks(marketIds);

    let finalData = marketCatalogue.map(market => {
      const book = marketBooks.find(b => b.marketId === market.marketId)
        || lastKnownGreyhoundBooks.get(market.marketId);

      const event = events.find(e => e.event.id === market.event.id);
      const startUTC = market.marketStartTime || event?.event.openDate;
      const pktTime = startUTC && toPakistanTime(startUTC);

      return {
        marketId: market.marketId,
        match: event?.event.name || "Unknown Event",
        startTime: pktTime ? pktTime.toISOString() : "N/A",
        marketStatus: book?.status || "UNKNOWN",
        totalMatched: book?.totalMatched || 0,
        selections: market.runners.map(runner => {
          const runnerBook = book?.runners?.find(r => r.selectionId === runner.selectionId);
          return {
            name: runner.runnerName,
            back: runnerBook?.ex?.availableToBack?.slice(0, 3) || [],
            lay: runnerBook?.ex?.availableToLay?.slice(0, 3) || [],
          };
        }),
      };
    });

    finalData.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    greyhoundCache = finalData;
    lastUpdateGreyhound = Date.now();
  } catch (err) {
    console.error("❌ Greyhound API Poll Error:", err.response?.data || err.message);
  }
}

// Start polling
updateGreyhoundCache();
setInterval(updateGreyhoundCache, POLL_INTERVAL_g);

// API Route
router.route("/live/greyhound").get((req, res) => {
  res.status(200).json({
    status: "success",
    count: greyhoundCache.length,
    data: greyhoundCache,
    lastUpdate: new Date(lastUpdateGreyhound).toISOString(),
  });
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

  // 2️⃣ Sab marketIds collect karo users ke orders se (both MATCHED and PENDING)
  const allMarketIds = [];
  const marketSelectionMap = {}; // Track marketId -> selectionIds for auto-matching
  
  for (const user of allUsers) {
    if (!user.orders) continue;
    for (const order of user.orders) {
      if ((order.status === "MATCHED" || order.status === "PENDING") && order.marketId) {
        allMarketIds.push(order.marketId);
        
        // Track selections for auto-matching
        if (!marketSelectionMap[order.marketId]) {
          marketSelectionMap[order.marketId] = new Set();
        }
        if (order.selectionId) {
          marketSelectionMap[order.marketId].add(order.selectionId);
        }
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

  // 6️⃣ Auto-match pending bets for all active markets/selections
  for (const marketId of uniqueMarketIds) {
    const selections = marketSelectionMap[marketId] || new Set();
    for (const selectionId of selections) {
      try {
        await autoMatchPendingBets(marketId, selectionId);
      } catch (err) {
        console.error(`❌ Auto-match error for market ${marketId}, selection ${selectionId}:`, err);
      }
    }
  }

  console.log("✅ updateMarkets executed for all active markets");
}

     


module.exports  ={
  router,
  updateMarkets

};






















      


















      
















      
















      



















      


















      
















      
















      


















      


















      
















      
















      



















      


















      
















      
















      






      
