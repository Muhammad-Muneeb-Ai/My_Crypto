import { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import axios from 'axios';
import { RefreshCw, AlertCircle, TrendingUp, Activity, BarChart3 } from 'lucide-react';
import { formatCurrency, formatCompactNumber } from '../lib/utils';
import { cn } from '../lib/utils';

interface CoinDetailChartProps {
  coinId: string;
  coinName: string;
}

type ChartView = 'price' | 'volume' | 'volatility';
type TimeRange = '1' | '7' | '30' | '365';

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '24H', value: '1' },
  { label: '7D', value: '7' },
  { label: '1M', value: '30' },
  { label: '1Y', value: '365' },
];

export function CoinDetailChart({ coinId, coinName }: CoinDetailChartProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ChartView>('price');
  const [range, setRange] = useState<TimeRange>('1');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/coin-history/${coinId}`, {
          params: { days: range },
          timeout: 20000, // 20s timeout for history
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        setData(res.data);
      } catch (err: any) {
        console.error('Failed to fetch chart data:', err.message);
        const serverError = err.response?.data?.error;
        const serverDetails = typeof err.response?.data?.details === 'string' ? err.response?.data?.details : null;
        
        if (err.code === 'ECONNABORTED') {
          setError('Historical data fetch timed out. Try again in a moment.');
        } else {
          setError(serverError || serverDetails || err.message || 'Failed to load market history.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (coinId) {
      fetchData();
    }
  }, [coinId, range]);

  const chartData = useMemo(() => {
    if (!data) return [];

    // Combine prices and volumes
    // CoinGecko returns [timestamp, value]
    return data.prices.map((price: [number, number], index: number) => {
      const timestamp = price[0];
      const currentPrice = price[1];
      const volume = data.total_volumes[index]?.[1] || 0;
      
      // Calculate simple volatility (absolute % change from previous point)
      let volatility = 0;
      if (index > 0) {
        const prevPrice = data.prices[index - 1][1];
        volatility = Math.abs((currentPrice - prevPrice) / prevPrice) * 100;
      }

      // Approximate Buy/Sell Pressure
      let pressure = 0;
      if (index > 0) {
        const prevPrice = data.prices[index - 1][1];
        const priceDiff = currentPrice - prevPrice;
        pressure = (priceDiff / prevPrice) * volume;
      }

      const date = new Date(timestamp);
      const timeStr = range === '1' 
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString([], { month: 'short', day: 'numeric' });

      return {
        time: timeStr,
        fullTime: date.toLocaleString(),
        price: currentPrice,
        volume: volume,
        volatility: volatility,
        pressure: pressure
      };
    });
  }, [data, range]);

  if (loading) {
    return (
      <div className="h-[400px] w-full flex flex-col items-center justify-center bg-surface border border-border rounded-xl gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-accent" />
        <p className="text-text-dim text-sm animate-pulse">Fetching {TIME_RANGES.find(r => r.value === range)?.label} market data for {coinName}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[400px] w-full flex flex-col items-center justify-center bg-surface border border-border rounded-xl p-6 text-center gap-4">
        <div className="w-12 h-12 bg-danger/10 rounded-full flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-danger" />
        </div>
        <div>
          <h4 className="text-text-main font-semibold">Data Retrieval Error</h4>
          <p className="text-text-dim text-sm mt-1 max-w-xs">{error}</p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-accent text-bg rounded-md text-xs font-bold"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="h-[400px] w-full flex flex-col items-center justify-center bg-surface border border-border rounded-xl p-6 text-center gap-4">
        <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center">
          <BarChart3 className="w-6 h-6 text-text-dim" />
        </div>
        <div>
          <h4 className="text-text-main font-semibold">No Chart Data Available</h4>
          <p className="text-text-dim text-sm mt-1 max-w-xs">We couldn't find historical data for {coinName} in the selected range ({TIME_RANGES.find(r => r.value === range)?.label}).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-text-main">{coinName} Analytics</h3>
              <span className="text-[10px] font-mono bg-accent/10 text-accent px-1.5 py-0.5 rounded uppercase">{TIME_RANGES.find(r => r.value === range)?.label} WINDOW</span>
            </div>
            <p className="text-text-dim text-xs mt-1">Deep-dive into price action and volume dynamics</p>
          </div>

          <div className="flex bg-bg p-1 rounded-lg border border-border">
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                  range === r.value ? "bg-accent text-bg" : "text-text-dim hover:text-text-main"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex bg-bg p-1 rounded-lg border border-border self-start">
          <button 
            onClick={() => setView('price')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              view === 'price' ? "bg-accent text-bg shadow-lg" : "text-text-dim hover:text-text-main"
            )}
          >
            <TrendingUp className="w-3 h-3" />
            Price
          </button>
          <button 
            onClick={() => setView('volume')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              view === 'volume' ? "bg-accent text-bg shadow-lg" : "text-text-dim hover:text-text-main"
            )}
          >
            <BarChart3 className="w-3 h-3" />
            Volume
          </button>
          <button 
            onClick={() => setView('volatility')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              view === 'volatility' ? "bg-accent text-bg shadow-lg" : "text-text-dim hover:text-text-main"
            )}
          >
            <Activity className="w-3 h-3" />
            Volatility
          </button>
        </div>
      </div>

      <div className="h-[300px] min-h-[300px] w-full bg-bg/30 rounded-lg overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'price' ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis 
                stroke="#6b7280" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `$${val > 1000 ? formatCompactNumber(val) : val.toFixed(4)}`}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px' }}
                itemStyle={{ color: '#f4f4f5' }}
                labelStyle={{ color: '#71717a', fontSize: '10px', marginBottom: '4px' }}
                formatter={(value: number, name: string) => {
                  if (name === 'price') return [formatCurrency(value), 'Price'];
                  if (name === 'pressure') return [formatCompactNumber(value), 'Momentum'];
                  return [value, name];
                }}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTime || label}
              />
              <Area 
                type="monotone" 
                dataKey="price" 
                stroke="#3b82f6" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorPrice)" 
                animationDuration={1000}
              />
              <Line 
                type="monotone" 
                dataKey="pressure" 
                stroke="transparent" 
                dot={false} 
                activeDot={false}
              />
            </AreaChart>
          ) : view === 'volume' ? (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis 
                stroke="#6b7280" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => formatCompactNumber(val)}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px' }}
                itemStyle={{ color: '#f4f4f5' }}
                labelStyle={{ color: '#71717a', fontSize: '10px', marginBottom: '4px' }}
                formatter={(value: number) => [formatCompactNumber(value), 'Volume']}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTime || label}
              />
              <Bar 
                dataKey="volume" 
                fill="#8b5cf6" 
                radius={[2, 2, 0, 0]}
                animationDuration={1000}
              />
            </BarChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis 
                stroke="#6b7280" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `${val.toFixed(4)}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px' }}
                itemStyle={{ color: '#f4f4f5' }}
                labelStyle={{ color: '#71717a', fontSize: '10px', marginBottom: '4px' }}
                formatter={(value: number) => [`${value.toFixed(6)}%`, 'Volatility']}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTime || label}
              />
              <Line 
                type="monotone" 
                dataKey="volatility" 
                stroke="#f59e0b" 
                strokeWidth={2}
                dot={false}
                animationDuration={1000}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
        <div className="flex flex-col">
          <span className="text-[10px] text-text-dim uppercase font-bold">Avg Price</span>
          <span className="text-sm font-mono text-text-main">
            {formatCurrency(chartData.reduce((acc, curr) => acc + curr.price, 0) / (chartData.length || 1))}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-text-dim uppercase font-bold">Max Volume</span>
          <span className="text-sm font-mono text-text-main">
            {formatCompactNumber(Math.max(...chartData.map(d => d.volume), 0))}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-text-dim uppercase font-bold">Volatility Peak</span>
          <span className="text-sm font-mono text-text-main">
            {Math.max(...chartData.map(d => d.volatility), 0).toFixed(3)}%
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-text-dim uppercase font-bold">Market Sentiment</span>
          <span className={cn(
            "text-sm font-bold uppercase",
            chartData[chartData.length - 1]?.price > chartData[0]?.price ? "text-success" : "text-danger"
          )}>
            {chartData[chartData.length - 1]?.price > chartData[0]?.price ? 'Bullish' : 'Bearish'}
          </span>
        </div>
      </div>
    </div>
  );
}
