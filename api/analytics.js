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

    const [sessionsRes, pagesRes, convRes, eventsByNameRes, eventsByChannelRes, contactPageRes] = await Promise.all([
      // Overall metrics
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
      // Top pages
      client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'pagePath' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'conversions' }, { name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5,
      }),
      // Trend over time
      client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'conversions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      // Conversions by event name (all conversion events)
      client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'conversions' }],
        orderBys: [{ metric: { metricName: 'conversions' }, desc: true }],
        metricFilter: {
          filter: {
            fieldName: 'conversions',
            numericFilter: { operation: 'GREATER_THAN', value: { int64Value: '0' } },
          },
        },
        limit: 20,
      }),
      // Conversions by channel grouping
      client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'conversions' }],
        orderBys: [{ metric: { metricName: 'conversions' }, desc: true }],
      }),
      // Views on /kontakt-oss-kort/
      client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        dimensionFilter: {
          filter: {
            fieldName: 'pagePath',
            stringFilter: { matchType: 'CONTAINS', value: 'kontakt-oss-kort' },
          },
        },
      }),
    ]);

    const summary = sessionsRes[0].rows?.[0]?.metricValues || [];
    const sessions  = parseInt(summary[0]?.value || 0);
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

    // Conversions by event name — real GA4 event names
    const convByEvent = (eventsByNameRes[0].rows || []).map(row => ({
      event: row.dimensionValues[0].value,
      conversions: parseInt(row.metricValues[0].value || 0),
    })).filter(e => e.conversions > 0);

    // Conversions by channel
    const convByChannel = (eventsByChannelRes[0].rows || []).map(row => ({
      channel: row.dimensionValues[0].value,
      conversions: parseInt(row.metricValues[0].value || 0),
    })).filter(c => c.conversions > 0);

    // Contact page views
    const contactViews = (contactPageRes[0].rows || []).reduce(
      (sum, row) => sum + parseInt(row.metricValues[0].value || 0), 0
    );

    // Map specific known events to KPI cards
    const eventMap = {};
    convByEvent.forEach(e => { eventMap[e.event] = e.conversions; });

    const formViews       = 0; // GA4 doesn't track form_start by default unless custom
    const formCompletions = (eventMap['kontakt_oss'] || 0) + (eventMap['få_et_tilbud'] || 0) + (eventMap['newsletter_form_submit'] || 0);
    const emailClicks     = eventMap['email_click'] || 0;
    const phoneClicks     = eventMap['phone_call'] || 0;
    const newsletterSignups = eventMap['newsletter_form_submit'] || 0;

    res.json({
      sessions,
      bounceRate: bounceRate.toFixed(1) + '%',
      avgDuration: formatDuration(avgDuration),
      conversions,
      topPages,
      trend,
      convByEvent,
      convByChannel,
      conversionTracking: {
        formViews,
        formCompletions,
        emailClicks,
        phoneClicks,
        newsletterSignups,
        contactPageViews: contactViews,
      },
    });
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