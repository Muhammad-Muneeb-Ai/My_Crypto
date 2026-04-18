import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from './lib/firebase';
import { MarketData, MarketAlert } from './types';
import { KPICard } from './components/KPICard';
import { MarketChart } from './components/MarketChart';
import { AIAnalyst } from './components/AIAnalyst';
import { AlertsPanel } from './components/AlertsPanel';
import { CoinDetailChart } from './components/CoinDetailChart';
import { formatCurrency, formatCompactNumber } from './lib/utils';
import { 
  TrendingUp, 
  Activity, 
  BarChart3, 
  DollarSign, 
  RefreshCw,
  LayoutDashboard,
  Search,
  Settings,
  Bell,
  ChevronDown,
  AlertTriangle
} from 'lucide-react';
import axios from 'axios';
import { cn } from './lib/utils';

// Configure axios defaults
axios.defaults.timeout = 15000; // 15s timeout

export default function App() {
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [alerts, setAlerts] = useState<MarketAlert[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedCoinId, setSelectedCoinId] = useState<string>('bitcoin');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);

  const selectedCoin = marketData.find(c => c.coin_id === selectedCoinId) || marketData[0];

  const isStale = useMemo(() => {
    if (marketData.length === 0) return false;
    const lastExtracted = new Date(marketData[0].extracted_at).getTime();
    const now = new Date().getTime();
    return (now - lastExtracted) > 10 * 60 * 1000; // 10 minutes
  }, [marketData]);

  const status = useMemo(() => {
    if (isRefreshing) return 'syncing';
    if (isStale) return 'stale';
    return 'live';
  }, [isRefreshing, isStale]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((new Date().getTime() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await axios.post('/api/trigger-etl');
      // The Firestore listener will automatically update the UI
    } catch (e) {
      console.error("Manual refresh failed", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Listen to market data
    const qMarket = query(collection(db, 'crypto_market'), orderBy('market_cap', 'desc'));
    const unsubscribeMarket = onSnapshot(qMarket, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as MarketData);
      setMarketData(data);
      setLastUpdated(new Date());
      setLoading(false);
    }, (error) => {
      console.error("Firestore market listener failed:", error.message);
      setLoading(false); // Stop loading even if it fails, so we can see cached summary
    });

    // Listen to alerts
    const qAlerts = query(collection(db, 'alerts'), orderBy('timestamp', 'desc'), limit(10));
    const unsubscribeAlerts = onSnapshot(qAlerts, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketAlert));
      setAlerts(data);
    }, (error) => {
      console.error("Firestore alerts listener failed:", error.message);
    });

    return () => {
      unsubscribeMarket();
      unsubscribeAlerts();
    };
  }, []);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await axios.get('/api/market-summary', {
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        if (res.data) {
          setSummary(res.data);
          if (res.data.error) {
            setApiError(res.data.error);
          } else {
            setApiError(null);
          }
          if (res.data.lastUpdated) {
            setLastUpdated(new Date(res.data.lastUpdated));
          }
        }
      } catch (e: any) {
        console.error("Summary fetch failed:", e.message);
        const serverMsg = e.response?.data?.error;
        setApiError(serverMsg || "Connection to CryptoPulse Engine lost. Retrying...");
      }
    };
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 text-white gap-4">
        <RefreshCw className="w-10 h-10 animate-spin text-blue-500" />
        <p className="text-zinc-500 font-medium animate-pulse">Initializing CryptoPulse Engine...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="w-[240px] border-r border-border hidden lg:flex flex-col py-6">
        <div className="flex items-center gap-2 px-6 mb-8">
          <span className="text-accent text-xl">◈</span>
          <h1 className="text-xl font-extrabold tracking-tighter text-accent">CRYPTOPULSE</h1>
        </div>

        <nav className="flex flex-col">
          <button className="flex items-center gap-3 px-6 py-3 bg-accent/5 text-text-main border-l-3 border-accent font-medium transition-all">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button className="flex items-center gap-3 px-6 py-3 text-text-dim hover:text-text-main border-l-3 border-transparent hover:bg-surface-light font-medium transition-all">
            <Search className="w-4 h-4" />
            Market Explorer
          </button>
          <button className="flex items-center gap-3 px-6 py-3 text-text-dim hover:text-text-main border-l-3 border-transparent hover:bg-surface-light font-medium transition-all">
            <Bell className="w-4 h-4" />
            Alerts
          </button>
          <button className="flex items-center gap-3 px-6 py-3 text-text-dim hover:text-text-main border-l-3 border-transparent hover:bg-surface-light font-medium transition-all">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </nav>

        <div className="mt-auto px-6">
          <div className="text-[10px] font-bold bg-success text-bg text-center py-2 rounded uppercase tracking-widest">
            SYSTEM: ONLINE
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {apiError && (
          <div className="bg-danger/10 border border-danger/30 p-4 rounded-lg flex items-start gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="bg-danger/20 p-2 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-danger" />
            </div>
            <div className="flex-1">
              <h4 className="text-danger text-sm font-bold uppercase tracking-tight">API Configuration Critical</h4>
              <p className="text-danger/80 text-xs mt-1 leading-relaxed">
                {apiError}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <a 
                  href="https://www.coingecko.com/en/api/pricing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold bg-danger text-bg px-2 py-1 rounded uppercase hover:opacity-90 transition-opacity"
                >
                  Get API Key
                </a>
                <span className="text-[10px] text-zinc-500 font-medium italic">
                  Tip: Verify your key in AI Studio &gt; Settings
                </span>
              </div>
            </div>
          </div>
        )}

        {summary?.rateLimitWarning && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <Activity className="w-4 h-4 text-amber-500" />
            <p className="text-amber-500 text-xs font-medium">
              Warning: {summary.rateLimitWarning}. Data frequency may be reduced soon.
            </p>
          </div>
        )}

        {isStale && !apiError && (
          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <Activity className="w-4 h-4 text-amber-500" />
            <p className="text-amber-500 text-xs font-medium">
              Market data may be stale (last sync &gt; 10m ago). CoinGecko free tier cache or rate limits may be active.
            </p>
            <button 
              onClick={handleManualRefresh}
              className="ml-auto text-[10px] font-bold bg-amber-500 text-bg px-2 py-1 rounded uppercase hover:bg-amber-400 transition-colors"
            >
              Force Sync
            </button>
          </div>
        )}

        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-text-main">Market Intelligence</h2>
              <div className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                status === 'live' ? "bg-success/10 text-success" : 
                status === 'syncing' ? "bg-blue-500/10 text-blue-500" : 
                "bg-amber-500/10 text-amber-500"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  status === 'live' ? "bg-success animate-pulse" : 
                  status === 'syncing' ? "bg-blue-500 animate-spin" : 
                  "bg-amber-500"
                )} />
                {status}
              </div>
            </div>
            <p className="text-text-dim text-xs mt-1">
              Data pipeline sync: {secondsAgo}s ago • High Volatility Detected
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className={cn(
                "bg-accent text-bg px-4 py-2 rounded-md font-bold text-xs hover:opacity-90 transition-all flex items-center gap-2",
                isRefreshing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3 h-3", isRefreshing && "animate-spin")} />
              {isRefreshing ? 'Syncing...' : 'Refresh Data'}
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="px-3 py-2 bg-transparent border border-border rounded-md text-text-main hover:bg-surface-light transition-colors text-xs"
            >
              Reload Page
            </button>
          </div>
        </header>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard 
            title="Total Market Cap"
            value={formatCompactNumber(summary?.totalMarketCap || 0)}
            icon={<BarChart3 className="w-4 h-4" />}
            trend="up"
          />
          <KPICard 
            title="Top Gainer"
            value={summary?.topGainer?.symbol?.toUpperCase() || 'N/A'}
            subValue={`${summary?.topGainer?.price_change_24h?.toFixed(2)}%`}
            icon={<TrendingUp className="w-4 h-4" />}
            trend="up"
          />
          <KPICard 
            title="Volatility Score"
            value={(summary?.mostVolatile?.volatility_score / 1e10).toFixed(1)}
            subValue="-4% vs avg"
            icon={<Activity className="w-4 h-4" />}
            trend="down"
          />
          <KPICard 
            title="Active Alerts"
            value={alerts.length.toString().padStart(2, '0')}
            subValue="Telegram: Connected"
            icon={<Bell className="w-4 h-4" />}
          />
        </div>

        {/* Detailed Analysis Section */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-text-main">Asset Deep-Dive</h3>
              <p className="text-text-dim text-xs">Select an asset to view high-frequency 24h market dynamics</p>
            </div>
            <div className="relative min-w-[200px]">
              <select 
                value={selectedCoinId}
                onChange={(e) => setSelectedCoinId(e.target.value)}
                className="appearance-none bg-surface border border-border text-text-main text-sm rounded-lg focus:ring-accent focus:border-accent block w-full p-2.5 pr-10 cursor-pointer hover:bg-surface-light transition-colors outline-none"
              >
                {marketData.map((coin) => (
                  <option key={coin.coin_id} value={coin.coin_id}>
                    {coin.name} ({coin.symbol.toUpperCase()})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-text-dim absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <CoinDetailChart coinId={selectedCoinId} coinName={selectedCoin?.name || 'Select Asset'} />
        </section>

        {/* Charts and AI Section */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 flex-1">
          <div className="space-y-5 flex flex-col">
            <section className="bg-surface border border-border p-5 rounded-xl flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-text-main">Market Cap Distribution (Top 10)</h3>
                <span className="text-[10px] font-bold bg-white/10 text-text-main px-2 py-0.5 rounded uppercase font-mono">USD / 24H WINDOW</span>
              </div>
              <div className="flex-1 min-h-[300px]">
                <MarketChart data={marketData} type="market_cap" />
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <section className="bg-surface border border-border p-5 rounded-xl">
                <h3 className="text-sm font-semibold text-text-main mb-5">Price Performance (24h)</h3>
                <MarketChart data={marketData} type="price_change" />
              </section>
              <section className="bg-surface border border-border p-5 rounded-xl">
                <h3 className="text-sm font-semibold text-text-main mb-5">Volatility Ranking</h3>
                <MarketChart data={marketData} type="volatility" />
              </section>
            </div>
          </div>

          <div className="space-y-5 flex flex-col">
            <div className="flex-1 min-h-[400px]">
              <AIAnalyst marketData={marketData} />
            </div>
            <div className="h-[300px]">
              <AlertsPanel alerts={alerts} />
            </div>
          </div>
        </div>

        {/* Market Table */}
        <section className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-text-dim text-[11px] uppercase tracking-wider">
                  <th className="px-5 py-3 font-semibold border-b border-border">Asset</th>
                  <th className="px-5 py-3 font-semibold border-b border-border text-right">Price</th>
                  <th className="px-5 py-3 font-semibold border-b border-border text-right">24h %</th>
                  <th className="px-5 py-3 font-semibold border-b border-border text-right">Volatility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {marketData.slice(0, 10).map((coin) => (
                  <tr key={coin.coin_id} className="hover:bg-surface-light transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <img src={coin.image} alt={coin.name} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                        <span className="text-sm font-medium text-text-main">{coin.name}</span>
                        <span className="text-[10px] font-mono bg-white/10 text-text-dim px-1.5 py-0.5 rounded">{coin.symbol.toUpperCase()}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm text-text-main">
                      {formatCurrency(coin.current_price)}
                    </td>
                    <td className={cn(
                      "px-5 py-3.5 text-right font-medium text-sm",
                      coin.price_change_24h >= 0 ? "text-success" : "text-danger"
                    )}>
                      {coin.price_change_24h >= 0 ? '+' : ''}{coin.price_change_24h?.toFixed(2)}%
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                        coin.volatility_score > 1e11 ? "bg-danger/20 text-danger" : 
                        coin.volatility_score > 5e10 ? "bg-amber-500/20 text-amber-500" : 
                        "bg-success/20 text-success"
                      )}>
                        {coin.volatility_score > 1e11 ? 'High' : coin.volatility_score > 5e10 ? 'Medium' : 'Low'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
