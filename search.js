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

    const [keywordsRes, pagesRes] = await Promise.all([
      searchconsole.searchanalytics.query({
        siteUrl: SITE_URL,
        requestBody: {
          startDate, endDate,
          dimensions: ['query'],
          rowLimit: 20,
          orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
        },
      }),
      searchconsole.searchanalytics.query({
        siteUrl: SITE_URL,
        requestBody: {
          startDate, endDate,
          dimensions: ['page'],
          rowLimit: 10,
          orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
        },
      }),
    ]);

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
    const avgCtr = totalClicks && totalImpressions ? ((totalClicks / totalImpressions) * 100).toFixed(1) + '%' : '0%';
    const avgPosition = keywords.length ? (keywords.reduce((s, k) => s + parseFloat(k.position), 0) / keywords.length).toFixed(1) : '0';

    res.json({ summary: { totalClicks, totalImpressions, avgCtr, avgPosition }, keywords: topKeywords, longTail });
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
