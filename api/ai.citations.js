// AI Citations API
// Queries Claude with relevant prompts and checks if VIEW Group is mentioned
// Stores results with timestamps for trend tracking

const PROMPTS = [
  // Norwegian - Accounting
  { text: "Hvilke regnskapsbyråer er best i Norge?", category: "Accounting" },
  { text: "Hvem tilbyr outsourcet regnskap i Norge?", category: "Accounting" },
  { text: "Beste regnskapsfirma for mellomstore bedrifter i Norge?", category: "Accounting" },
  { text: "Anbefal et regnskapsselskap i Oslo eller Kristiansand", category: "Accounting" },
  { text: "Hvilke selskaper tilbyr regnskapsoutsourcing i Norge?", category: "Accounting" },
  { text: "Hva er de beste alternativene for ekstern regnskapsføring i Norge?", category: "Accounting" },

  // Norwegian - Payroll
  { text: "Hvilke leverandører tilbyr lønnstjenester i Norge?", category: "Payroll" },
  { text: "Beste selskap for outsourcet lønn i Norge?", category: "Payroll" },
  { text: "Hvem kan håndtere lønn og HR-tjenester for norske bedrifter?", category: "Payroll" },
  { text: "Anbefal en leverandør av lønnsadministrasjon i Norge", category: "Payroll" },

  // Norwegian - ERP
  { text: "Hvilke selskaper implementerer Xledger i Norge?", category: "ERP" },
  { text: "Hvem er autoriserte Tripletex-partnere i Norge?", category: "ERP" },
  { text: "Beste ERP-konsulenter for norske bedrifter?", category: "ERP" },
  { text: "Hvilke selskaper tilbyr Xledger implementering og støtte?", category: "ERP" },
  { text: "Hvem hjelper med regnskapssystem i Norge, for eksempel Xledger eller Tripletex?", category: "ERP" },

  // Norwegian - IT
  { text: "Hvilke IT-selskaper tilbyr skyløsninger til norske bedrifter?", category: "IT" },
  { text: "Beste IT-leverandør for små og mellomstore bedrifter i Norge?", category: "IT" },
  { text: "Hvem tilbyr IT-drift og support i Norge?", category: "IT" },

  // English - Accounting
  { text: "What are the best accounting firms in Norway?", category: "Accounting" },
  { text: "Who offers outsourced accounting services in Norway?", category: "Accounting" },
  { text: "Recommend an accounting company in Norway for medium-sized businesses", category: "Accounting" },
  { text: "Best accounting outsourcing companies in Norway?", category: "Accounting" },

  // English - Payroll
  { text: "Which companies offer payroll services in Norway?", category: "Payroll" },
  { text: "Best outsourced payroll provider in Norway?", category: "Payroll" },
  { text: "Who handles payroll and HR services for Norwegian companies?", category: "Payroll" },

  // English - ERP
  { text: "Which companies implement Xledger in Norway?", category: "ERP" },
  { text: "Best ERP consultants for Norwegian businesses?", category: "ERP" },
  { text: "Who are authorised Xledger partners in Norway?", category: "ERP" },
  { text: "Companies that help implement Tripletex or Xledger in Norway?", category: "ERP" },

  // English - IT
  { text: "Best IT services company for Norwegian SMBs?", category: "IT" },
  { text: "Who provides cloud solutions and IT support in Norway?", category: "IT" },
];

// Brand identifiers to check for in responses
const BRAND_IDENTIFIERS = [
  'view group',
  'viewgroup',
  'view ledger',
  'viewledger',
  'viewgroup.no',
  'view as',
  'view regnskap',
  'view lønn',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  if (req.method === 'GET') {
    // Return stored results
    return res.json(getStoredResults());
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const results = {
      timestamp: new Date().toISOString(),
      totalPrompts: PROMPTS.length,
      mentions: 0,
      pages: new Set(),
      byCategory: { Accounting: 0, Payroll: 0, ERP: 0, IT: 0 },
      details: [],
    };

    // Query Claude for each prompt
    for (const prompt of PROMPTS) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 400,
            messages: [{ role: 'user', content: prompt.text }],
          }),
        });

        const data = await response.json();
        const text = (data.content?.[0]?.text || '').toLowerCase();

        const mentioned = BRAND_IDENTIFIERS.some(id => text.includes(id.toLowerCase()));

        if (mentioned) {
          results.mentions++;
          results.byCategory[prompt.category] = (results.byCategory[prompt.category] || 0) + 1;

          // Extract any URLs mentioned
          const urlMatches = text.match(/viewgroup\.no[^\s)"]*/g) || [];
          urlMatches.forEach(url => results.pages.add('https://' + url));
        }

        results.details.push({
          prompt: prompt.text,
          category: prompt.category,
          mentioned,
          snippet: mentioned ? data.content?.[0]?.text?.slice(0, 200) : null,
        });

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error('Prompt error:', err.message);
        results.details.push({
          prompt: prompt.text,
          category: prompt.category,
          mentioned: false,
          error: err.message,
        });
      }
    }

    results.pages = Array.from(results.pages);
    results.pageCount = results.pages.length;

    // Store results for trend tracking
    const stored = getStoredResults();
    stored.history = stored.history || [];
    stored.history.unshift({
      timestamp: results.timestamp,
      mentions: results.mentions,
      pages: results.pageCount,
      byCategory: results.byCategory,
    });
    // Keep last 10 scans
    stored.history = stored.history.slice(0, 10);
    stored.latest = results;
    global._aiCitationsStore = stored;

    res.json(results);
  } catch (err) {
    console.error('AI Citations error:', err);
    res.status(500).json({ error: err.message });
  }
}

function getStoredResults() {
  return global._aiCitationsStore || { history: [], latest: null };
}