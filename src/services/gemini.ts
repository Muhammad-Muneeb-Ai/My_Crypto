import { GoogleGenAI } from "@google/genai";
import { MarketData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeMarket(marketData: MarketData[], query: string, summary: any = null) {
  const model = "gemini-3-flash-preview";
  
  const context = marketData.map(d => 
    `${d.name} (${d.symbol}): Price $${d.current_price}, 24h Change ${d.price_change_24h}%, Volatility Score ${d.volatility_score.toFixed(2)}`
  ).join('\n');

  const globalContext = summary ? `
    Global Context:
    Total Market Cap: $${summary.totalMarketCap}
    24h Volume: $${summary.totalVol}
    Dominance: BTC ${summary.dominance?.btc}% / ETH ${summary.dominance?.eth}%
    Market Cap 24h Change: ${summary.marketCapChange}%
  ` : '';

  const systemInstruction = `
    You are a professional Crypto Market Analyst. 
    Use the following real-time market data to answer the user's question.
    Be concise, data-driven, and insightful.
    
    ${globalContext}
    
    Individual Asset Data:
    ${context}
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: query,
      config: {
        systemInstruction,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "I'm sorry, I couldn't analyze the market data at this moment.";
  }
}
