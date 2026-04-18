import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import axios from 'axios';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import 'dotenv/config';

// Initialize Firebase for the server
const firebaseApp = initializeApp(firebaseConfig);
const dbId = (firebaseConfig as any).firestoreDatabaseId;
const db = dbId ? getFirestore(firebaseApp, dbId) : getFirestore(firebaseApp);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control']
  }));

  console.log('[Server] Initializing middleware and routes...');

  // In-memory cache for market data
  let marketDataCache: any[] = [];
  let lastSummary: any = null;
  
  // Basic rate limit tracker
  let requestsThisMinute = 0;
  let lastRateLimitReset = Date.now();
  const RATE_LIMIT_WARNING = 40; // Warn when approaching 50 calls/min

  // Helper for CoinGecko requests with retry logic
  const fetchFromCoinGecko = async (endpoint: string, params: any = {}, retries = 2) => {
    let rawKey = process.env.COINGECKO_API_KEY || '';
    
    // Aggressive sanitization (handles quotes, accidental labels, and whitespace)
    let apiKey = rawKey.trim()
      .replace(/^["']|["']$/g, '') 
      .replace(/^COINGECKO_API_KEY\s*[:=]\s*/i, '')
      .trim();

    // Reset rate limit counter every minute
    const now = Date.now();
    if (now - lastRateLimitReset > 60000) {
      requestsThisMinute = 0;
      lastRateLimitReset = now;
    }
    
    requestsThisMinute++;
    if (requestsThisMinute > RATE_LIMIT_WARNING) {
      console.warn(`[CoinGecko] Performance Guard: ${requestsThisMinute} requests/min. (Limit: 50)`);
    }

    // Safety check for placeholder values
    const placeholders = ['MY_COINGECKO_API_KEY', 'YOUR_API_KEY', 'undefined', 'null', ''];
    if (!apiKey || placeholders.includes(apiKey)) {
      apiKey = undefined;
    }

    // Explicit override for Pro status
    const forcePro = process.env.COINGECKO_IS_PRO === 'true';
    const forceDemo = process.env.COINGECKO_IS_PRO === 'false';
    
    // Default logic: Demo keys start with CG-, Pro do not.
    let isPro = !!(apiKey && !apiKey.startsWith('CG-'));
    if (forcePro) isPro = true;
    if (forceDemo) isPro = false;

    const baseUrl = isPro ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
    
    const headers: any = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    if (apiKey) {
      if (isPro) {
        headers['x-cg-pro-api-key'] = apiKey;
      } else {
        headers['x-cg-demo-api-key'] = apiKey;
        // Some cloud providers require the key in both locations for Demo keys
        params.x_cg_demo_api_key = apiKey; 
      }
    }

    const executeRequest = async (attempt: number): Promise<any> => {
      // Mandatory staggered delay with jitter (300ms, 600ms, 1200ms...)
      const jitter = Math.random() * 100;
      const delay = (300 * Math.pow(2, attempt)) + jitter;
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        if (apiKey) {
          console.log(`[CoinGecko] Request: ${endpoint} | Attempt: ${attempt + 1}/${retries + 1} | Prefix: ${apiKey.substring(0, 10)}... | Mode: ${isPro ? 'Pro' : 'Demo'}`);
        }
        
        return await axios.get(`${baseUrl}${endpoint}`, {
          params,
          headers,
          timeout: 25000 
        });
      } catch (error: any) {
        const status = error.response?.status;
        
        // Retry logic for transient errors (429, 5xx)
        if (attempt < retries && (status === 429 || status >= 500)) {
          console.warn(`[CoinGecko] Transient failure (${status}). Retrying...`);
          return executeRequest(attempt + 1);
        }

        if (status === 401 || status === 403) {
          let msg = apiKey 
            ? `CoinGecko Authentication Failed (${status}). Detected Key Prefix: "${apiKey.substring(0, 10)}...". ACTION: Please verify this prefix matches your key in the CoinGecko dashboard and ensure you have verified your email.`
            : `CoinGecko Public Access Blocked (${status}). An API Key is required for this dashboard.`;
          console.error(`[CoinGecko Critical] ${msg}`);
          error.customMessage = msg;
        } else if (status === 429) {
          error.customMessage = 'CoinGecko Rate Limit reached. Updates will resume in a manual refresh.';
        }
        throw error;
      }
    };

    return executeRequest(0);
  };

  // ETL Pipeline Logic
  const runETL = async () => {
    console.log('[ETL] Starting extraction from CoinGecko...');
    try {
      const response = await fetchFromCoinGecko('/coins/markets', {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 20,
        page: 1,
        sparkline: false
      });

      const coins = response.data;
      const extractedAt = new Date().toISOString();

      console.log(`[ETL] Extracted ${coins.length} coins. Transforming and Loading...`);
      
      const newCache: any[] = [];

      for (const coin of coins) {
        const volatilityScore = Math.abs(coin.price_change_percentage_24h || 0) * (coin.total_volume || 0);
        
        const marketData = {
          coin_id: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          current_price: coin.current_price,
          market_cap: coin.market_cap,
          total_volume: coin.total_volume,
          price_change_24h: coin.price_change_percentage_24h,
          market_cap_rank: coin.market_cap_rank,
          volatility_score: volatilityScore,
          extracted_at: extractedAt,
          image: coin.image
        };

        newCache.push(marketData);

        // UPSERT into Firestore (Async, don't block the loop)
        setDoc(doc(db, 'crypto_market', coin.id), marketData).catch(err => 
          console.error(`[Firestore] Failed to update ${coin.id}:`, err.message)
        );

        // Alert Logic
        if (coin.price_change_percentage_24h < -5) {
          addDoc(collection(db, 'alerts'), {
            coin_id: coin.id,
            type: 'PRICE_DROP',
            message: `${coin.name} dropped by ${coin.price_change_percentage_24h.toFixed(2)}%!`,
            timestamp: extractedAt
          }).catch(err => console.error(`[Firestore] Failed to add alert for ${coin.id}:`, err.message));
        }
      }
      
      marketDataCache = newCache;
      
      // Pre-calculate summary
      if (newCache.length > 0) {
        const totalMarketCap = newCache.reduce((acc, curr) => acc + (curr.market_cap || 0), 0);
        const avgPrice = newCache.reduce((acc, curr) => acc + (curr.current_price || 0), 0) / newCache.length;
        const topGainer = [...newCache].sort((a, b) => (b.price_change_24h || 0) - (a.price_change_24h || 0))[0];
        const mostVolatile = [...newCache].sort((a, b) => (b.volatility_score || 0) - (a.volatility_score || 0))[0];

        lastSummary = {
          totalMarketCap,
          avgPrice,
          topGainer,
          mostVolatile,
          count: newCache.length,
          lastUpdated: extractedAt
        };
      }

      console.log('[ETL] Pipeline completed successfully.');
    } catch (error: any) {
      console.error('[ETL] Pipeline failed:', error.message);
    }
  };

  // Schedule ETL every 5 minutes
  cron.schedule('*/5 * * * *', runETL);
  
  // Run once on startup
  console.log('[Server] Triggering initial ETL run...');
  runETL().then(() => {
    console.log('[Server] Initial ETL run finished.');
  }).catch(err => {
    console.error('[Server] Initial ETL run failed:', err);
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/trigger-etl', async (req, res) => {
    console.log('[API] Manual ETL trigger received.');
    try {
      await runETL();
      res.json({ status: 'success', message: 'ETL pipeline executed successfully' });
    } catch (error) {
      res.status(500).json({ error: 'ETL pipeline execution failed' });
    }
  });

  app.get('/api/market-summary', async (req, res) => {
    const rateLimitWarning = requestsThisMinute > RATE_LIMIT_WARNING ? 'Approaching API rate limit' : null;
    
    if (lastSummary) {
      return res.json({ ...lastSummary, rateLimitWarning });
    }

    try {
      // Fast fallback to Firestore with competitive timeout
      const summaryPromise = getDocs(collection(db, 'crypto_market'));
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 5000));
      
      const snapshot = await Promise.race([summaryPromise, timeoutPromise]) as any;
      const data = snapshot.docs.map((doc: any) => doc.data());
      
      if (data.length === 0) {
        return res.status(200).json({ 
          error: 'No market data available yet.', 
          lastUpdated: new Date().toISOString(),
          isInitial: true 
        });
      }

      const totalMarketCap = data.reduce((acc: number, curr: any) => acc + (curr.market_cap || 0), 0);
      const avgPrice = data.reduce((acc: number, curr: any) => acc + (curr.current_price || 0), 0) / data.length;
      const topGainer = [...data].sort((a, b) => (b.price_change_24h || 0) - (a.price_change_24h || 0))[0];
      const mostVolatile = [...data].sort((a, b) => (b.volatility_score || 0) - (a.volatility_score || 0))[0];

      const summary = {
        totalMarketCap,
        avgPrice,
        topGainer,
        mostVolatile,
        count: data.length,
        lastUpdated: data[0]?.extracted_at
      };
      
      lastSummary = summary;
      res.json(summary);
    } catch (error: any) {
      console.error('[API] Market summary fetch failed:', error.message);
      // Return a skeleton summary instead of 500 or timing out
      res.json({ 
        totalMarketCap: 0, 
        avgPrice: 0, 
        count: 0, 
        lastUpdated: new Date().toISOString(),
        error: 'Engine warmup... please wait.' 
      });
    }
  });

  const historyCache: Record<string, { data: any, timestamp: number }> = {};
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  app.get('/api/coin-history/:id', async (req, res) => {
    const { id } = req.params;
    const { days = '1' } = req.query;
    const cacheKey = `${id}_${days}`;
    
    // Check cache
    const cached = historyCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      console.log(`[API] Serving cached history for ${cacheKey}`);
      return res.json(cached.data);
    }

    try {
      const response = await fetchFromCoinGecko(`/coins/${id}/market_chart`, {
        vs_currency: 'usd',
        days: days,
        interval: days === '1' ? 'minute' : 'daily'
      });
      
      // Update cache
      historyCache[cacheKey] = {
        data: response.data,
        timestamp: Date.now()
      };

      res.json(response.data);
    } catch (error: any) {
      console.error(`[API] Failed to fetch history for ${id} (days: ${days}):`, error.message);
      
      // If we have stale cache, serve it on error as fallback
      if (cached) {
        console.log(`[API] Serving stale cache for ${cacheKey} due to API error`);
        return res.json(cached.data);
      }

      res.status(error.response?.status || 500).json({ 
        error: error.customMessage || 'Failed to fetch coin history',
        details: error.response?.data || error.message
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
