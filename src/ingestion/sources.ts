export type Source = {
  name: string;
  url: string;
  domain: string;
  tier: 1 | 2 | 3; // 1=wire, 2=generalist, 3=specialist
};

export const SOURCES: Source[] = [
  // Tier 1 — wire services (most authoritative, earliest signal)
  { name: 'Reuters',        url: 'https://feeds.reuters.com/reuters/worldNews',                          domain: 'world',    tier: 1 },
  { name: 'AP News',        url: 'https://rsshub.app/apnews/topics/apf-topnews',                         domain: 'world',    tier: 1 },
  { name: 'BBC World',      url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                          domain: 'world',    tier: 1 },
  { name: 'Al Jazeera',     url: 'https://www.aljazeera.com/xml/rss/all.xml',                            domain: 'world',    tier: 1 },

  // Tier 2 — generalist press
  { name: 'NYT',            url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',            domain: 'general',  tier: 2 },
  { name: 'Washington Post',url: 'https://feeds.washingtonpost.com/rss/politics',                        domain: 'politics', tier: 2 },
  { name: 'The Guardian',   url: 'https://www.theguardian.com/world/rss',                                domain: 'world',    tier: 2 },
  { name: 'Bloomberg',      url: 'https://feeds.bloomberg.com/markets/news.rss',                         domain: 'business', tier: 2 },
  { name: 'Financial Times',url: 'https://www.ft.com/?format=rss',                                       domain: 'business', tier: 2 },
  { name: 'The Economist',  url: 'https://www.economist.com/the-world-this-week/rss.xml',                domain: 'general',  tier: 2 },
  { name: 'Politico',       url: 'https://rss.politico.com/congress.xml',                                domain: 'politics', tier: 2 },
  { name: 'The Hill',       url: 'https://thehill.com/feed/',                                            domain: 'politics', tier: 2 },
  { name: 'Axios',          url: 'https://api.axios.com/feed/',                                          domain: 'general',  tier: 2 },
  { name: 'CNBC',           url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', domain: 'business', tier: 2 },
  { name: 'WSJ Business',   url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',                     domain: 'business', tier: 2 },
  { name: 'MarketWatch',    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',           domain: 'business', tier: 2 },
  { name: 'Forbes',         url: 'https://www.forbes.com/business/feed/',                                domain: 'business', tier: 2 },

  // Tier 3 — specialist / early signal
  { name: 'TechCrunch',     url: 'https://techcrunch.com/feed/',                                         domain: 'tech',     tier: 3 },
  { name: 'The Verge',      url: 'https://www.theverge.com/rss/index.xml',                               domain: 'tech',     tier: 3 },
  { name: 'Wired',          url: 'https://www.wired.com/feed/rss',                                       domain: 'tech',     tier: 3 },
  { name: 'CNET',           url: 'https://www.cnet.com/rss/news/',                                       domain: 'tech',     tier: 3 },
  { name: 'Hacker News',    url: 'https://hnrss.org/frontpage',                                          domain: 'tech',     tier: 3 },
  { name: 'arXiv CS',       url: 'https://rss.arxiv.org/rss/cs',                                         domain: 'research', tier: 3 },
];
