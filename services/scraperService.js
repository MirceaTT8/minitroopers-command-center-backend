// services/scraperService.js
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseHqHtml, parseFirstSoldierHtml } = require('../parsers/htmlParser');

const SCRIPTS_DIR = path.join(__dirname, '../scripts');
const SECRET_CFG_PATH = path.join(SCRIPTS_DIR, 'secret.cfg');
const RAW_HTML_DIR = path.join(__dirname, '../data/raw_html');

function getBashExecutable() {
  const gitBashPaths = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs\\Git\\bin\\bash.exe')
      : '',
  ];

  for (const p of gitBashPaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  return 'bash';
}

function normalizeScriptLineEndings() {
  const files = [
    'troopers.sh',
    'troopers.cfg',
    'secret.cfg',
    'run_accounts.sh',
    'com.culture',
    'fr.culture',
  ];
  for (const file of files) {
    const fullPath = path.join(SCRIPTS_DIR, file);
    if (fs.existsSync(fullPath)) {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const cleaned = raw.replace(/\r\n/g, '\n').replace(/\u00A0/g, ' ');
      if (raw !== cleaned) {
        fs.writeFileSync(fullPath, cleaned, 'utf8');
      }
    }
  }
}

function extractBashArray(content, arrayName) {
  const regex = new RegExp(`${arrayName}\\s*=\\s*\\(([\\s\\S]*?)\\)`, 'm');
  const match = content.match(regex);
  if (!match) return [];

  const innerBlock = match[1]
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .join(' ');

  const items = [];
  const tokenRegex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let token;
  while ((token = tokenRegex.exec(innerBlock)) !== null) {
    const val = token[1] ?? token[2] ?? token[3];
    if (val) items.push(val);
  }
  return items;
}

/**
 * Reads accounts from secret.cfg AND falls back to scanning data/raw_html/*_t0.html
 */
function parseSecretCfg() {
  const recruitsMap = {};
  let accountsList = [];

  if (fs.existsSync(SECRET_CFG_PATH)) {
    normalizeScriptLineEndings();
    const content = fs.readFileSync(SECRET_CFG_PATH, 'utf8');
    const rawAccounts = extractBashArray(content, 'accounts');
    const rawRecruits = extractBashArray(content, 'recruits');

    for (const entry of rawRecruits) {
      const colonIdx = entry.indexOf(':');
      if (colonIdx !== -1) {
        const userLower = entry.slice(0, colonIdx).trim().toLowerCase();
        const countVal = parseInt(entry.slice(colonIdx + 1).trim(), 10);
        if (!Number.isNaN(countVal)) {
          recruitsMap[userLower] = countVal;
        }
      }
    }

    accountsList = rawAccounts.map((entry) => {
      const colonIdx = entry.indexOf(':');
      const login = colonIdx !== -1 ? entry.slice(0, colonIdx).trim() : entry.trim();
      const password = colonIdx !== -1 ? entry.slice(colonIdx + 1) : '';
      const loginLower = login.toLowerCase();
      const configuredRecruits =
        recruitsMap[loginLower] !== undefined ? recruitsMap[loginLower] : null;

      return {
        id: loginLower,
        login,
        password,
        configuredRecruits,
        epicEligible: configuredRecruits === null || configuredRecruits >= 5,
      };
    });
  }

  // Fallback: Also scan data/raw_html/ for any *_t0.html files not already in accountsList
  if (fs.existsSync(RAW_HTML_DIR)) {
    const files = fs.readdirSync(RAW_HTML_DIR);
    for (const file of files) {
      if (file.endsWith('_t0.html')) {
        const loginLower = file.replace('_t0.html', '').toLowerCase();
        if (!accountsList.some((a) => a.id === loginLower)) {
          accountsList.push({
            id: loginLower,
            login: loginLower,
            password: '',
            configuredRecruits: recruitsMap[loginLower] ?? null,
            epicEligible: true,
          });
        }
      }
    }
  }

  // Sort naturally (berbelita1, berbelita2, ..., berbelita16)
  accountsList.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
  );

  return { accountsList, recruitsMap };
}

function runAllAccountsScript(syncOnly = true) {
  return new Promise((resolve, reject) => {
    normalizeScriptLineEndings();
    const bashExe = getBashExecutable();
    const scriptPath = path.join(SCRIPTS_DIR, 'run_accounts.sh');
    const args = [scriptPath];
    if (syncOnly) args.push('--sync-only');

    execFile(
      bashExe,
      args,
      { cwd: SCRIPTS_DIR, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr || err.message));
        }
        resolve(stdout);
      }
    );
  });
}

function runSingleAccountScript(account, syncOnly = false) {
  return new Promise((resolve, reject) => {
    normalizeScriptLineEndings();
    const bashExe = getBashExecutable();
    const scriptPath = path.join(SCRIPTS_DIR, 'troopers.sh');
    const args = [
      scriptPath,
      account.login,
      account.password || '',
      '',
      syncOnly ? '--sync-only' : '',
    ];

    execFile(
      bashExe,
      args,
      { cwd: SCRIPTS_DIR, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr || err.message));
        }
        resolve(stdout);
      }
    );
  });
}

function parseSavedAccountHtml(account) {
  const loginLower = account.login.toLowerCase();
  const hqFile = path.join(RAW_HTML_DIR, `${loginLower}_hq.html`);
  const t0File = path.join(RAW_HTML_DIR, `${loginLower}_t0.html`);

  const hqHtml = fs.existsSync(hqFile) ? fs.readFileSync(hqFile, 'utf8') : '';
  const t0Html = fs.existsSync(t0File) ? fs.readFileSync(t0File, 'utf8') : '';

  const hqParsed = parseHqHtml(hqHtml);
  const t0Parsed = parseFirstSoldierHtml(t0Html, hqParsed);

  return {
    id: account.id,
    name: account.login,
    configuredRecruits: account.configuredRecruits,
    epicEligible: account.epicEligible,
    raidPhase: hqParsed.raidPhase,
    credits: t0Parsed.credits || hqParsed.credits,
    raidCurrency: t0Parsed.armyPower || hqParsed.armyPower,
    isSelectingUpgrade: t0Parsed.isSelectingUpgrade,
    firstSoldier: t0Parsed.firstSoldier,
  };
}

module.exports = {
  parseSecretCfg,
  runAllAccountsScript,
  runSingleAccountScript,
  parseSavedAccountHtml,
};