export interface MarketData {
  coin_id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_24h: number;
  market_cap_rank: number;
  volatility_score: number;
  extracted_at: string;
  image?: string;
}

export interface MarketAlert {
  id: string;
  coin_id: string;
  type: 'PRICE_DROP' | 'VOLUME_SPIKE';
  message: string;
  timestamp: string;
}
