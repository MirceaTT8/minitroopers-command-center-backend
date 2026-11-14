// parsers/htmlParser.js
const cheerio = require('cheerio');
const skillsDictionary = require('../config/skillsDictionary.json');

/**
 * Decodes the Base64 JSON embedded in https://data.trooperstest.gued.es/card/<base64>.svg
 */
function decodeCardSvgPayload(imgSrc) {
  try {
    if (!imgSrc || !imgSrc.includes('/card/')) return null;
    const base64Part = imgSrc.split('/card/')[1].replace('.svg', '');
    if (base64Part === 'add') return null;
    const jsonStr = Buffer.from(base64Part, 'base64url').toString('utf8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Normalizes a skill name and attaches Type, Color, and Sort Order
 */
function classifySkill(skillName) {
  const cleanName = (skillName || '').trim();
  const meta = skillsDictionary[cleanName] || {
    type: 'Passive',
    color: 'Green',
    sortOrder: 4,
  };
  return {
    name: cleanName,
    type: meta.type,
    color: meta.color,
    sortOrder: meta.sortOrder,
  };
}

/**
 * Parses /hq HTML for Credits, Army Power, Raid Phase, and Trooper Roster cards
 */
function parseHqHtml(hqHtml) {
  const $ = cheerio.load(hqHtml || '');

  const creditsText = $('.money').first().text().replace(/\D/g, '');
  const powerText = $('.power').first().text().replace(/\D/g, '');

  const credits = creditsText ? parseInt(creditsText, 10) : 0;
  const armyPower = powerText ? parseInt(powerText, 10) : 0;

  // Extract Raid Phase from <h1 class="hbox">Raid Phase X</h1>
  let raidPhase = 1;
  $('h1.hbox').each((_, el) => {
    const text = $(el).text();
    const match = text.match(/Raid Phase\s+(\d+)/i);
    if (match) {
      raidPhase = parseInt(match[1], 10);
    }
  });

  // Extract First Soldier card from /hq (#swf_tr_view a.tcard[href="/t/0"])
  const firstCardImg = $('a.tcard[href="/t/0"] img').first();
  const cardAltName = firstCardImg.attr('alt') || 'Trooper #0';
  const cardPayload = decodeCardSvgPayload(firstCardImg.attr('src'));

  // Level is 1 + number of level-up choices in cardPayload.c
  const inferredLevel = cardPayload && Array.isArray(cardPayload.c) ? cardPayload.c.length + 1 : 1;

  return {
    credits,
    armyPower,
    raidPhase,
    firstSoldierFromHq: {
      name: cardPayload?.n || cardAltName,
      level: inferredLevel,
      cardPayload,
    },
  };
}

/**
 * Parses /t/0 HTML for First Soldier stats, Upgrade Cost, AI dropdowns, Skills, or Level-Up Choices
 */
function parseFirstSoldierHtml(t0Html, fallbackHqData = {}) {
  const $ = cheerio.load(t0Html || '');
  const pageTitle = $('title').text() || '';

  // 1. Credits & Power fallback if present on /t/0
  const creditsText = $('.money').first().text().replace(/\D/g, '');
  const powerText = $('.power').first().text().replace(/\D/g, '');
  const credits = creditsText ? parseInt(creditsText, 10) : (fallbackHqData.credits ?? 0);
  const armyPower = powerText ? parseInt(powerText, 10) : (fallbackHqData.armyPower ?? 0);

  // 2. Soldier Name (from "<Name>'s stats sheet" or "<Name> has advanced to level X!")
  let soldierName = fallbackHqData.firstSoldierFromHq?.name || 'Commander';
  const headerText = $('h1, .hbox, title').text();
  const sheetMatch = headerText.match(/([A-Za-z0-9_.-]+)['’]s stats sheet/i);
  const advanceMatch = $('body').text().match(/([A-Za-z0-9_.-]+)\s+has advanced to level\s+(\d+)/i);

  if (sheetMatch) soldierName = sheetMatch[1];
  else if (advanceMatch) soldierName = advanceMatch[1];

  // 3. Soldier Level
  let level = fallbackHqData.firstSoldierFromHq?.level || 1;
  if (advanceMatch) {
    level = parseInt(advanceMatch[2], 10);
  } else {
    const levelTextMatch = $('body').text().match(/level\s+(\d+)/i);
    if (levelTextMatch) level = parseInt(levelTextMatch[1], 10);
  }

  // 4. Upgrade Cost & Level-Up Action Link ("Upgrade for 181")
  let upgradeCost = null;
  let levelupHref = null;

  $('a, button, .button, [onclick]').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const href = $(el).attr('href') || '';
    const match = text.match(/Upgrade for\s+(\d+)/i);
    if (match) {
      upgradeCost = parseInt(match[1], 10);
      if (href) levelupHref = href;
    }
  });

  // Also check if "You need X [T] to upgrade" notification is present
  if (upgradeCost === null) {
    const bodyText = $('body').text();
    const needMatch = bodyText.match(/You need\s+(\d+)\s*.*to upgrade/i);
    if (needMatch) upgradeCost = parseInt(needMatch[1], 10);
  }

  // Standard Mini Troopers upgrade cost formula fallback by level
  const LEVEL_COSTS = { 1: 8, 2: 15, 3: 27, 4: 49, 5: 75, 6: 110, 7: 140, 8: 181, 9: 245, 10: 330, 11: 401 };
  if (upgradeCost === null) {
    upgradeCost = LEVEL_COSTS[level] || 181;
  }

  // 5. Parse the 5 AI Config Dropdowns on /t/0
  const aiConfig = {
    favouriteWeapon: extractSelectValue($, 'Favourite Weapon') || 'Default',
    favouriteTarget: extractSelectValue($, 'Favourite Target') || 'Anywhere!',
    preferredVictim: extractSelectValue($, 'Preferred Victim') || 'The biggest threat',
    fightingStyle: extractSelectValue($, 'Fighting Style') || 'Standard',
    priorityTarget: extractSelectValue($, 'Priority Target') || 'Default',
  };

  // 6. Parse Unlocked Skills from the /t/0 Grid Tooltips
  const rawSkillsSet = new Set();
  $('[onmouseover*="Tip.show"]').each((_, el) => {
    // Skip top money and power boxes
    if ($(el).hasClass('money') || $(el).hasClass('power')) return;
    // Skip inactive/locked grid cells if marked as disabled/off
    const cls = ($(el).attr('class') || '').toLowerCase();
    if (cls.includes('off') || cls.includes('empty') || cls.includes('disabled')) return;

    const mouseOver = $(el).attr('onmouseover') || '';
    const h1Match = mouseOver.match(/<h1>(.*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      const skillTitle = h1Match[1].replace(/\\'/g, "'").trim();
      if (skillTitle && skillTitle !== 'Credits' && skillTitle !== 'Power') {
        rawSkillsSet.add(skillTitle);
      }
    }
  });

  // Sort skills strictly by sortOrder (Type/Color) then alphabetically
  const skills = Array.from(rawSkillsSet)
    .map(classifySkill)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  // 7. Parse Available Upgrade Choices if page is in "Select your upgrade" mode
  const availableUpgrades = [];
  const isSelectingUpgrade =
    pageTitle.toLowerCase().includes('select your upgrade') || Boolean(advanceMatch);

  $('a[href*="skill="]').each((idx, el) => {
    const href = $(el).attr('href') || '';
    const container = $(el).closest('li, div, tr');
    const skillName =
      $(el).find('h1, h2, strong, .name').first().text().trim() ||
      container.find('h1, h2, strong, .name').first().text().trim() ||
      `Upgrade Option ${idx + 1}`;
    const desc = container.text().replace(/\s+/g, ' ').trim();
    const classified = classifySkill(skillName);

    availableUpgrades.push({
      id: `skill_${idx}`,
      skillIndex: idx,
      href,
      name: classified.name,
      type: classified.type,
      color: classified.color,
      description: desc,
    });
  });

  return {
    credits,
    armyPower,
    isSelectingUpgrade,
    firstSoldier: {
      slot: 0,
      name: soldierName,
      level,
      upgradeCost,
      levelupHref,
      aiConfig,
      skills,
      availableUpgrades,
    },
  };
}

function extractSelectValue($, labelText) {
  let selectedText = null;
  $('select').each((_, selectEl) => {
    const prevText = $(selectEl).parent().prev().text() + ' ' + $(selectEl).parent().text();
    if (prevText.toLowerCase().includes(labelText.toLowerCase())) {
      const opt = $(selectEl).find('option:selected').first();
      if (opt.length) {
        selectedText = opt.text().trim();
      }
    }
  });
  return selectedText;
}

module.exports = {
  parseHqHtml,
  parseFirstSoldierHtml,
  classifySkill,
};