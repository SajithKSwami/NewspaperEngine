import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Parser from "rss-parser";
import { subHours } from "date-fns";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/',
    'Connection': 'keep-alive',
  },
  timeout: 15000
});

app.use(express.json());

const STORAGE_FILE = path.join(__dirname, "news_data.json");

const SOURCES = [
  { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", domain: "Tech, Politics, Business" },
  { name: "Reuters", url: "https://www.reuters.com/rss/worldNews.xml", domain: "World, Business" },
  { name: "Bloomberg", url: "http://www.bloomberg.com/politics/rss", domain: "Politics, Business" },
  { name: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", domain: "Business, Tech" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", domain: "Tech" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", domain: "Tech" },
  { name: "Politico", url: "https://www.politico.com/rss/politicopicks.xml", domain: "Politics" },
  { name: "Financial Times", url: "https://www.ft.com/?format=rss", domain: "Business" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", domain: "Politics" },
  { name: "The Economist", url: "https://www.economist.com/the-world-this-week/rss.xml", domain: "Politics, Business" },
  { name: "Forbes", url: "https://www.forbes.com/business/feed/", domain: "Business" },
  { name: "The Washington Post", url: "https://feeds.washingtonpost.com/rss/politics", domain: "Politics" },
  { name: "The Guardian", url: "https://www.theguardian.com/world/rss", domain: "Politics" },
  { name: "WSJ Business", url: "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml", domain: "Business" },
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", domain: "World" },
  { name: "Wired", url: "https://www.wired.com/feed/rss", domain: "Tech" },
  { name: "Axios", url: "https://api.axios.com/feed/", domain: "Politics, Business" },
  { name: "The Hill", url: "https://thehill.com/feed/", domain: "Politics" },
  { name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", domain: "Business" },
  { name: "CNET News", url: "https://www.cnet.com/rss/news/", domain: "Tech" }
];

async function getRawFeeds() {
  const since = subHours(new Date(), 48); // Last 48 hours
  const allArticles: any[] = [];

  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const item of feed.items.slice(0, 3)) {
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
        if (pubDate > since) {
          allArticles.push({
            title: item.title,
            link: item.link,
            source: source.name,
            content: item.contentSnippet || item.content || item.title || "",
            published_date: pubDate.toISOString()
          });
        }
      }
    } catch (err) {
      console.error(`Error fetching ${source.name}:`, err);
    }
  }
  return allArticles;
}

async function getStoredData() {
  try {
    const data = await fs.readFile(STORAGE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { articles: [], timestamp: null };
  }
}

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  
  app.get("/api/news", async (req, res) => {
    const data = await getStoredData();
    res.json(data);
  });

  app.get("/api/raw-feeds", async (req, res) => {
    try {
      const articles = await getRawFeeds();
      res.json(articles);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch raw feeds" });
    }
  });

  app.post("/api/save-news", async (req, res) => {
    try {
      const { articles } = req.body;
      const existingData = await getStoredData();
      
      const combined = [...articles, ...existingData.articles];
      const uniqueArticles = Array.from(new Map(combined.map(a => [a.url, a])).values());
      
      const scanData = {
        timestamp: new Date().toISOString(),
        articles: uniqueArticles
      };

      await fs.writeFile(STORAGE_FILE, JSON.stringify(scanData, null, 2));
      res.json(scanData);
    } catch (err) {
      res.status(500).json({ error: "Failed to save news" });
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NIE-5 Engine running on http://localhost:${PORT}`);
  });
}

startServer();

