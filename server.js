// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const {
  parseSecretCfg,
  runAllAccountsScript,
  runSingleAccountScript,
  parseSavedAccountHtml,
} = require('./services/scraperService');
const {
  detectSoldierArchetype,
  evaluateCollectiveRaidPool,
  recommendBestUpgrade,
} = require('./services/strategyEngine');

const app = express();
app.use(cors());
app.use(express.json());

const CACHE_FILE = path.join(__dirname, 'data/accountsCache.json');
const RAW_HTML_DIR = path.join(__dirname, 'data/raw_html');

if (!fs.existsSync(RAW_HTML_DIR)) {
  fs.mkdirSync(RAW_HTML_DIR, { recursive: true });
}

function buildEnrichedAccounts() {
  const { accountsList } = parseSecretCfg();
  const rawAccounts = accountsList.map((acc) => parseSavedAccountHtml(acc));
  const collectiveMetrics = evaluateCollectiveRaidPool(rawAccounts);

  return rawAccounts.map((acc) => {
    const arch = detectSoldierArchetype(acc.firstSoldier);
    acc.firstSoldier.archetype = arch.name;
    acc.firstSoldier.aiRecommendation = recommendBestUpgrade(
      acc.firstSoldier,
      collectiveMetrics
    );
    acc.collectivePool = collectiveMetrics;
    return acc;
  });
}

// GET /api/accounts - Immediately parses existing HTML files in data/raw_html/
// Only runs run_accounts.sh if ?refresh=true is explicitly requested
app.get('/api/accounts', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';

    if (forceRefresh) {
      console.log('Running run_accounts.sh --sync-only...');
      await runAllAccountsScript(true);
    }

    const enriched = buildEnrichedAccounts();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(enriched, null, 2));
    console.log(`Served ${enriched.length} accounts to frontend.`);
    res.json(enriched);
  } catch (error) {
    console.error('Error in GET /api/accounts:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mini Troopers Backend running on http://localhost:${PORT}`);
});