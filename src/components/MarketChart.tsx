import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import { MarketData } from '../types';
import { formatCurrency, formatCompactNumber } from '../lib/utils';

interface ChartProps {
  data: MarketData[];
  type: 'market_cap' | 'price_change' | 'volatility';
}

export function MarketChart({ data, type }: ChartProps) {
  if (type === 'market_cap') {
    return (
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2D333B" vertical={false} />
            <XAxis 
              dataKey="symbol" 
              stroke="#8B949E" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(val) => val.toUpperCase()}
            />
            <YAxis 
              stroke="#8B949E" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(val) => formatCompactNumber(val)}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#151921', border: '1px solid #2D333B', borderRadius: '8px' }}
              itemStyle={{ color: '#E6EDF3' }}
              formatter={(value: number) => [formatCurrency(value), 'Market Cap']}
            />
            <Bar dataKey="market_cap" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={index === 0 ? '#00D1FF' : '#1C222D'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'price_change') {
    return (
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.slice(0, 10)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#2D333B" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="symbol" 
              type="category" 
              stroke="#8B949E" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(val) => val.toUpperCase()}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#151921', border: '1px solid #2D333B', borderRadius: '8px' }}
              itemStyle={{ color: '#E6EDF3' }}
              formatter={(value: number) => [`${value.toFixed(2)}%`, '24h Change']}
            />
            <Bar dataKey="price_change_24h" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.price_change_24h >= 0 ? '#2ECC71' : '#E74C3C'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
     <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.slice(0, 5)}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="volatility_score"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={['#00D1FF', '#8b5cf6', '#ec4899', '#f97316', '#eab308'][index % 5]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: '#151921', border: '1px solid #2D333B', borderRadius: '8px' }}
              itemStyle={{ color: '#E6EDF3' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
  );
}
