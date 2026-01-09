// News Analysis Module
class NewsAnalyzer {
    constructor() {
        // Use your existing Finnhub API token
        this.apiKey = 'd5cmp01r01qvl80l6k0gd5cmp01r01qvl80l6k10';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    // Analyze currency strength for a pair
    async analyzePair(symbol) {
        try {
            const currencies = this.extractCurrencies(symbol);
            if (!currencies) return null;

            const [base, quote] = currencies;

            // Get news for both currencies
            const [baseNews, quoteNews] = await Promise.all([
                this.getCurrencyNews(base),
                this.getCurrencyNews(quote)
            ]);

            // Analyze strength
            const baseStrength = this.analyzeStrength(baseNews);
            const quoteStrength = this.analyzeStrength(quoteNews);

            // Calculate relative strength
            const relativeStrength = baseStrength - quoteStrength;
            
            let bias = 'NEUTRAL';
            if (relativeStrength > 20) {
                bias = 'BULLISH';
            } else if (relativeStrength < -20) {
                bias = 'BEARISH';
            }

            return {
                symbol,
                base: {
                    currency: base,
                    strength: baseStrength,
                    news: baseNews.slice(0, 3)
                },
                quote: {
                    currency: quote,
                    strength: quoteStrength,
                    news: quoteNews.slice(0, 3)
                },
                bias,
                strength: Math.abs(relativeStrength),
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('News analysis error:', error);
            return null;
        }
    }

    extractCurrencies(symbol) {
        // Extract currency codes from symbol
        const currencyPairs = {
            'XAUUSD': ['GOLD', 'USD'],
            'EURUSD': ['EUR', 'USD'],
            'GBPUSD': ['GBP', 'USD'],
            'AUDUSD': ['AUD', 'USD'],
            'AUDCAD': ['AUD', 'CAD'],
            'USDCAD': ['USD', 'CAD'],
            'USDJPY': ['USD', 'JPY'],
            'GBPJPY': ['GBP', 'JPY'],
            'CADJPY': ['CAD', 'JPY'],
            'AUDJPY': ['AUD', 'JPY'],
            'BTCUSD': ['BTC', 'USD']
        };

        return currencyPairs[symbol] || null;
    }

    async getCurrencyNews(currency) {
        // Check cache
        const cached = this.cache.get(currency);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.news;
        }

        try {
            // Map currency to search terms
            const searchTerms = this.getSearchTerms(currency);
            const allNews = [];

            // Fetch general market news
            const generalNews = await this.fetchNews('general');
            
            // Filter for relevant news
            const relevantNews = generalNews.filter(article => {
                const content = (article.headline + ' ' + article.summary).toLowerCase();
                return searchTerms.some(term => content.includes(term));
            });

            allNews.push(...relevantNews);

            // Cache results
            this.cache.set(currency, {
                news: allNews,
                timestamp: Date.now()
            });

            return allNews;
        } catch (error) {
            console.error(`Error fetching news for ${currency}:`, error);
            return [];
        }
    }

    getSearchTerms(currency) {
        const terms = {
            'USD': ['dollar', 'usd', 'federal reserve', 'fed', 'us economy', 'united states'],
            'EUR': ['euro', 'eur', 'ecb', 'european central bank', 'eurozone', 'europe'],
            'GBP': ['pound', 'sterling', 'gbp', 'bank of england', 'uk', 'britain'],
            'JPY': ['yen', 'jpy', 'bank of japan', 'boj', 'japan'],
            'AUD': ['australian dollar', 'aud', 'rba', 'australia'],
            'CAD': ['canadian dollar', 'cad', 'bank of canada', 'canada'],
            'GOLD': ['gold', 'xau', 'precious metals'],
            'BTC': ['bitcoin', 'btc', 'cryptocurrency', 'crypto']
        };

        return terms[currency] || [currency.toLowerCase()];
    }

    async fetchNews(category = 'general') {
        try {
            const response = await fetch(
                `https://finnhub.io/api/v1/news?category=${category}&token=${this.apiKey}`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch news');
            }

            const data = await response.json();
            return data || [];
        } catch (error) {
            console.error('Finnhub API error:', error);
            // Return mock data if API fails
            return this.getMockNews(category);
        }
    }

    analyzeStrength(news) {
        if (!news || news.length === 0) return 50; // Neutral

        let positiveCount = 0;
        let negativeCount = 0;

        const positiveWords = [
            'growth', 'positive', 'strong', 'bullish', 'surge', 'gain', 
            'rise', 'increase', 'up', 'rally', 'boost', 'improve'
        ];

        const negativeWords = [
            'decline', 'negative', 'weak', 'bearish', 'fall', 'loss',
            'drop', 'decrease', 'down', 'crash', 'concern', 'worry'
        ];

        news.forEach(article => {
            const content = (article.headline + ' ' + article.summary).toLowerCase();
            
            positiveWords.forEach(word => {
                if (content.includes(word)) positiveCount++;
            });

            negativeWords.forEach(word => {
                if (content.includes(word)) negativeCount++;
            });
        });

        const total = positiveCount + negativeCount;
        if (total === 0) return 50; // Neutral

        // Calculate strength (0-100)
        const strength = (positiveCount / total) * 100;
        return strength;
    }

    getMockNews(category) {
        // Fallback mock news data
        return [
            {
                headline: 'Markets show mixed sentiment',
                summary: 'Trading continues with moderate volatility',
                datetime: Date.now() / 1000,
                source: 'Mock'
            }
        ];
    }

    // Get volatility estimate based on news volume
    getVolatility(news) {
        if (!news || news.length === 0) return 'LOW';
        
        if (news.length > 10) return 'HIGH';
        if (news.length > 5) return 'MEDIUM';
        return 'LOW';
    }
}

export default new NewsAnalyzer();
