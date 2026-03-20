export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    summary: {
      totalSpend: '$0',
      totalClicks: 0,
      totalImpressions: 0,
      totalConversions: 0,
      avgCpc: '$0',
      avgCtr: '0%',
      roas: '0x',
    },
    byImpressions: [],
    byClicks: [],
    message: 'Google Ads API requires developer token — connect via Google Ads Manager to enable.'
  });
}
