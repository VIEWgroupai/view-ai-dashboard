import { BetaAnalyticsDataClient } from '@google-analytics/data';

const client = new BetaAnalyticsDataClient({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '256632570';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const dateRange = getDateRange(req.query.period);
    const [sessionsRes, pagesRes, convRes] = await Promise.all([
      client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        metrics: [
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'conversions' },
        ],
      }),
      client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'pagePath' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'conversions' }, { name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5,
      }),
      client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'conversions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
    ]);

    const summary = sessionsRes[0].rows?.[0]?.metricValues || [];
    const sessions = parseInt(summary[0]?.value || 0);
    const bounceRate = parseFloat(summary[1]?.value || 0) * 100;
    const avgDuration = parseFloat(summary[2]?.value || 0);
    const conversions = parseInt(summary[3]?.value || 0);

    const topPages = (pagesRes[0].rows || []).map(row => ({
      page: row.dimensionValues[0].value,
      source: row.dimensionValues[1].value,
      views: parseInt(row.metricValues[0].value),
      conversions: parseInt(row.metricValues[1].value),
      sessions: parseInt(row.metricValues[2].value),
      convRate: row.metricValues[2].value > 0
        ? ((row.metricValues[1].value / row.metricValues[2].value) * 100).toFixed(1) + '%'
        : '0%',
    }));

    const trend = (convRes[0].rows || []).map(row => ({
      date: row.dimensionValues[0].value,
      sessions: parseInt(row.metricValues[0].value),
      conversions: parseInt(row.metricValues[1].value),
    }));

    res.json({ sessions, bounceRate: bounceRate.toFixed(1) + '%', avgDuration: formatDuration(avgDuration), conversions, topPages, trend });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

function getDateRange(period) {
  const days = period === '7d' ? '7daysAgo' : period === '90d' ? '90daysAgo' : '30daysAgo';
  return { startDate: days, endDate: 'today' };
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}
