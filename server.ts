import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import axios from 'axios';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, setDoc, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import 'dotenv/config';

// Load Firebase config with self-healing for common "undefined" string issues
const getEnv = (key: string, fallback?: string) => {
  const val = process.env[key];
  if (val === 'undefined' || val === 'null' || !val) return fallback;
  return val.trim();
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', 'gen-lang-client-0281662355.firebaseapp.com'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID', 'gen-lang-client-0281662355'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', 'gen-lang-client-0281662355.firebasestorage.app'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '283324708762'),
  appId: getEnv('VITE_FIREBASE_APP_ID', '1:283324708762:web:fb8139aaedd0d39027ec23'),
  // Fallback to the specific AI Studio database ID if not provided in env
  firestoreDatabaseId: getEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID', 'ai-studio-56c63423-f4bf-40b7-8873-6b4921b79df2')
};

// Initialize Firebase for the server
const firebaseApp = initializeApp(firebaseConfig);
const dbId = firebaseConfig.firestoreDatabaseId;

console.log(`[Firebase] Initializing Firestore. Project: ${firebaseConfig.projectId}, DB: ${dbId}`);

// Use 'experimentalForceLongPolling' to prevent RST_STREAM errors in restricted environments
const db = initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true,
}, dbId || '(default)');

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

    // AUTO-FIX: Extreme sanitization to fix typos in CoinGecko keys
    apiKey = apiKey.replace(/[“”‘’"']/g, ''); // Fix smart quotes
    
    if (apiKey.match(/^CG-[Qq]9/)) {
      console.log('[CoinGecko] Auto-correcting "CG-Q9" typo to "CG-09"...');
      apiKey = apiKey.replace(/^CG-[Qq]9/, 'CG-09');
    }

    if (apiKey && !apiKey.startsWith('CG-')) {
      console.warn('[CoinGecko] Key does not start with CG-. Pro mode might be intended.');
    }

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

    // Plan selection logic based on provided Skill rules
    // Rule: "Both key types start with CG-. Use header OR query param — not both."
    const forcePro = process.env.COINGECKO_IS_PRO === 'true';
    const forceDemo = process.env.COINGECKO_IS_PRO === 'false';
    
    // Default to Demo if not explicitly Pro, as both start with CG-
    let isPro = forcePro;
    if (!forcePro && !forceDemo) {
      // Logic: Default to Demo as it's the most common entry plan
      isPro = false; 
    }

    const baseUrl = isPro ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
    
    const headers: any = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Cache-Control': 'no-cache'
    };

    if (apiKey) {
      // Rule: "Use header OR query param — not both." (Using Header for security)
      if (isPro) {
        headers['x-cg-pro-api-key'] = apiKey;
      } else {
        headers['x-cg-demo-api-key'] = apiKey;
      }
    }

    const executeRequest = async (attempt: number): Promise<any> => {
      // Mandatory staggered delay with jitter (300ms, 600ms, 1200ms...)
      const jitter = Math.random() * 100;
      const delay = (300 * Math.pow(2, attempt)) + jitter;
      await new Promise(resolve => setTimeout(resolve, delay));

      // Clone clean headers and params for this specific attempt
      const currentHeaders = { ...headers };
      const currentParams = { ...params };

      try {
        if (apiKey) {
          console.log(`[CoinGecko] ${isPro ? '[PRO]' : '[DEMO]'} Request (Attempt ${attempt + 1}/${retries + 1}): ${endpoint}`);
        }
        
        return await axios.get(`${baseUrl}${endpoint}`, {
          params: currentParams,
          headers: currentHeaders,
          timeout: 25000 
        });
      } catch (error: any) {
        const status = error.response?.status;
        
        // Strategy: If 401 on Demo key with Header, fallback to Query Param as per Skill rules
        // Rule: "Use header OR query param — not both."
        if (status === 401 && !isPro && !params.x_cg_demo_api_key && apiKey && attempt < retries) {
          console.warn('[CoinGecko] 401 with Header. Falling back to Query Parameter auth method for retry...');
          params.x_cg_demo_api_key = apiKey;
          // IMPORTANT: Delete the header to comply with "NEVER: Use both" rule
          delete headers['x-cg-demo-api-key']; 
          return executeRequest(attempt + 1);
        }

        // Retry logic for transient errors (429, 5xx)
        if (attempt < retries && (status === 429 || status >= 500)) {
          console.warn(`[CoinGecko] Transient failure (${status}). Retrying...`);
          return executeRequest(attempt + 1);
        }

        if (status === 401 || status === 403) {
          const detectedPrefix = apiKey ? apiKey.substring(0, 10) : 'NONE';
          let hint = "";
          if (detectedPrefix.includes('-Q') || detectedPrefix.includes('-q')) {
            hint = " TIP: We detected a 'Q' after 'CG-'. In CoinGecko Demo keys, this is almost always a '0' (zero).";
          }
          
          let msg = apiKey 
            ? `CoinGecko Authentication Failed (${status}). Prefix: "${detectedPrefix}...".${hint} ACTION: Please check if your Key is ACTIVE and EMAIL VERIFIED in the CoinGecko Dashboard.`
            : `CoinGecko API Key Required.`;
          console.error(`[CoinGecko Critical] ${msg}`);
          error.customMessage = msg;
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
  
  // Debug Endpoint to check system health and config mismatch (safe-view)
  app.get('/api/debug-config', (req, res) => {
    res.json({
      firebase: {
        projectId: firebaseConfig.projectId,
        databaseId: dbId || '(default)',
        hasApiKey: !!firebaseConfig.apiKey,
        isProduction: process.env.NODE_ENV === 'production'
      },
      coingecko: {
        hasKey: !!process.env.COINGECKO_API_KEY,
        keyPrefix: process.env.COINGECKO_API_KEY ? process.env.COINGECKO_API_KEY.substring(0, 7) + '...' : 'MISSING',
        requestsThisMinute
      }
    });
  });

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
