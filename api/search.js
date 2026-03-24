import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});

const SITE_URL = process.env.SEARCH_CONSOLE_SITE_URL || 'https://viewgroup.no/';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const authClient = await auth.getClient();
    const searchconsole = google.searchconsole({ version: 'v1', auth: authClient });
    const { startDate, endDate } = getDateRange(req.query.period);

    const [keywordsRes, pagesRes, rankingsTrendRes] = await Promise.all([
      // Top keywords (query dimension) - 50 rows
      searchconsole.searchanalytics.query({
        siteUrl: SITE_URL,
        requestBody: {
          startDate, endDate,
          dimensions: ['query'],
          rowLimit: 50,
          orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
        },
      }),
      // Top pages with page+query dimensions for search term context - 50 rows
      searchconsole.searchanalytics.query({
        siteUrl: SITE_URL,
        requestBody: {
          startDate, endDate,
          dimensions: ['page', 'query'],
          rowLimit: 50,
          orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
        },
      }),
      // Rankings trend: daily data for last 7 days to build distribution chart
      searchconsole.searchanalytics.query({
        siteUrl: SITE_URL,
        requestBody: {
          startDate: getDateRange('7d').startDate,
          endDate,
          dimensions: ['date', 'query'],
          rowLimit: 5000,
          orderBy: [{ fieldName: 'date', sortOrder: 'ASCENDING' }],
        },
      }),
    ]);

    // ── Keywords ──────────────────────────────────────────────────────
    const keywords = (keywordsRes.data.rows || []).map(row => ({
      keyword: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: (row.ctr * 100).toFixed(1) + '%',
      position: row.position.toFixed(1),
      type: row.keys[0].toLowerCase().includes('view') ? 'brand' : 'nonbrand',
    }));

    const longTail = keywords.filter(k => k.keyword.split(' ').length >= 4).slice(0, 8);
    const topKeywords = keywords.slice(0, 10);
    const totalClicks = keywords.reduce((s, k) => s + k.clicks, 0);
    const totalImpressions = keywords.reduce((s, k) => s + k.impressions, 0);
    const avgCtr = totalClicks && totalImpressions
      ? ((totalClicks / totalImpressions) * 100).toFixed(1) + '%' : '0%';
    const avgPosition = keywords.length
      ? (keywords.reduce((s, k) => s + parseFloat(k.position), 0) / keywords.length).toFixed(1) : '0';

    // ── Top Pages (with search term) ──────────────────────────────────
    // Group by page, aggregate top query per page
    const pageMap = {};
    (pagesRes.data.rows || []).forEach(row => {
      const page = row.keys[0];
      const query = row.keys[1];
      if (!pageMap[page]) {
        pageMap[page] = {
          page,
          topQuery: query,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: (row.ctr * 100).toFixed(1) + '%',
          position: row.position.toFixed(1),
          engagements: row.clicks, // clicks as proxy for engagements from SC
        };
      } else {
        pageMap[page].clicks += row.clicks;
        pageMap[page].impressions += row.impressions;
        pageMap[page].engagements += row.clicks;
      }
    });
    const topPages = Object.values(pageMap)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 50)
      .map(p => ({
        ...p,
        ctr: p.clicks && p.impressions ? ((p.clicks / p.impressions) * 100).toFixed(1) + '%' : '0%',
      }));

    // ── Rankings Distribution (last 7 days) ───────────────────────────
    // Group by date, bucket keywords by position
    const dateMap = {};
    (rankingsTrendRes.data.rows || []).forEach(row => {
      const date = row.keys[0]; // YYYY-MM-DD
      const pos = row.position;
      if (!dateMap[date]) dateMap[date] = { date, top3: 0, top10: 0, top20: 0, top100: 0, outOf100: 0 };
      if (pos <= 3) dateMap[date].top3++;
      else if (pos <= 10) dateMap[date].top10++;
      else if (pos <= 20) dateMap[date].top20++;
      else if (pos <= 100) dateMap[date].top100++;
      else dateMap[date].outOf100++;
    });

    const rankingsTrend = Object.values(dateMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7); // last 7 days

    // Keyword summary: unique keywords within each position bucket (using full 30d data)
    const allKeywords = keywords;
    const kwSummary = {
      top3:  allKeywords.filter(k => parseFloat(k.position) <= 3).length,
      top10: allKeywords.filter(k => parseFloat(k.position) <= 10).length,
      top20: allKeywords.filter(k => parseFloat(k.position) <= 20).length,
      top100: allKeywords.filter(k => parseFloat(k.position) <= 100).length,
    };

    res.json({
      summary: { totalClicks, totalImpressions, avgCtr, avgPosition },
      keywords: topKeywords,
      longTail,
      topPages,
      rankingsTrend,
      kwSummary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

function getDateRange(period) {
  const today = new Date();
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const start = new Date(today);
  start.setDate(today.getDate() - days);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0],
  };
}