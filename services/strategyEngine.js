// services/strategyEngine.js
const ARCHETYPES = [
  {
    name: 'Close-Range Shock / Knockdown',
    weapons: ['Pump Action Shotgun', 'Semi-Auto Shotgun', 'Double-barrelled Shotgun', 'Shotgun'],
    backups: ['Revolver', 'Beretta'],
    coreSkills: ['Motorcycle', 'Rush', 'Charge', 'Hydroshock', 'Hydroshock Shells', 'Paralysing Shells', 'Hard Boiled', 'Bulletproof Vest', 'Tuck \'n\' Roll', 'Sturdy', 'Suspicious'],
    recommendedStyle: 'Hunter',
    recommendedTarget: 'Gutshot',
  },
  {
    name: 'Armor-Piercing Mid-Range Bruiser',
    weapons: ['Comanche Auto', 'Thompson', 'FAMAS'],
    backups: ['Desert Eagle', 'Uzi'],
    coreSkills: ['Twinoid', 'Trigger Happy', 'Nimble Fingers', 'Explosive Shells', 'Toxic Shells', 'Dodger', 'Dodge', 'Hard Boiled', 'Sprinter', 'Sprint', 'On Point', 'Suspicious'],
    recommendedStyle: 'Standard',
    recommendedTarget: 'Gutshot',
  },
  {
    name: 'Crit Burst SMG / Rifle',
    weapons: ['UMP', 'Assault Rifle', 'AK47'],
    backups: ['Pistol', 'Revolver', 'Beretta'],
    coreSkills: ['Anatomy', 'Heartbreaker', 'Vicious', 'Laser Sights', 'Frenzy', 'Adrenaline', 'Hyperactive', 'Survivor', 'Hard Boiled', 'Suspicious'],
    recommendedStyle: 'Standard',
    recommendedTarget: 'In the head!',
  },
  {
    name: 'Heavy Suppression Gunner',
    weapons: ['Heavy Machine Gun', 'Minigun', 'Gatling Gun'],
    backups: ['Revolver', 'Sub-Machine Gun'],
    coreSkills: ['Loader', 'Battle-Ready', 'Back Pack', 'Heavyweight', 'Cold-Blooded', 'Sturdy', 'Hard Boiled', 'Bulletproof Vest', 'Suspicious'],
    recommendedStyle: 'Standard',
    recommendedTarget: 'Anywhere!',
  },
  {
    name: 'Global Executioner Sniper',
    weapons: ['SparrowHawk', 'Sparrowhawk', 'MOS-TECK', 'Sniper', 'Sniper Rifle'],
    backups: ['Desert Eagle', 'Revolver'],
    coreSkills: ['Sniper', 'Eagle Eye', 'Anatomy', 'Heartbreaker', 'Vicious', 'Laser Sights', 'Hydroshock', 'Suspicious', 'Out of Sight', 'Camouflage', 'On Point'],
    recommendedStyle: 'Defender',
    recommendedTarget: 'In the head!',
  },
  {
    name: 'Explosive / AoE Demolitions',
    weapons: ['Rocket Launcher', 'Bazooka', 'Bazooka M1', 'Bazooka M25', 'Mortar', 'Infernal Tube'],
    backups: ['FAMAS', 'Pump Action Shotgun'],
    coreSkills: ['Loader', 'Munitions', 'Grenade Benny', 'Sticky Grenade', 'Bouncing Grenade', 'Explosive Shells', 'Suspicious', 'Hard Boiled', 'On Point'],
    recommendedStyle: 'Defender',
    recommendedTarget: 'Anywhere!',
  },
  {
    name: 'Combat Medic / Global Specialist',
    weapons: ['Assault Rifle', 'FAMAS', 'Light Machine Gun'],
    backups: ['Beretta', 'Revolver'],
    coreSkills: ['Doctor', 'Saboteur', 'Comms. Officer', 'Smart', 'Suspicious', 'Walkie-Talkie', 'Hard Boiled', 'Dodger', 'Tuck \'n\' Roll', 'Survivor', 'Bulletproof Vest', 'Out of Sight'],
    recommendedStyle: 'Defender',
    recommendedTarget: 'Anywhere!',
  },
];

/**
 * Detects the soldier's archetype based on unlocked skills/weapons and Fav. Weapon
 */
function detectSoldierArchetype(soldier) {
  const skillNames = (soldier.skills || []).map((s) => (typeof s === 'string' ? s : s.name));
  const favWeapon = soldier.aiConfig?.favouriteWeapon || '';

  // Check if Global Specialist / Medic role is unlocked
  if (skillNames.some((s) => ['Saboteur', 'Comms. Officer', 'Comms. Officier', 'Doctor'].includes(s))) {
    return ARCHETYPES[6];
  }

  for (const arch of ARCHETYPES) {
    if (arch.weapons.includes(favWeapon) || skillNames.some((s) => arch.weapons.includes(s))) {
      return arch;
    }
  }
  return ARCHETYPES[1]; // Default to Mid-Range Bruiser
}

/**
 * Calculates collective Raid Pool metrics across all accounts
 */
function evaluateCollectiveRaidPool(accounts) {
  let scouts = 0;
  let saboteurs = 0;
  let globalSabotagePower = 0;
  let commsOfficers = 0;
  let globalCommsPoints = 0;
  let doctors = 0;
  let munitions = 0;

  for (const acc of accounts) {
    const soldier = acc.firstSoldier;
    if (!soldier) continue;
    const lvl = soldier.level || 1;
    const skillNames = (soldier.skills || []).map((s) => (typeof s === 'string' ? s : s.name));

    if (skillNames.includes('Scout')) scouts += 1;
    if (skillNames.includes('Saboteur')) {
      saboteurs += 1;
      globalSabotagePower += Math.max(0, lvl - 5); // +1 Sabotage per level above 5
    }
    if (skillNames.includes('Comms. Officer') || skillNames.includes('Comms. Officier')) {
      commsOfficers += 1;
      if (lvl >= 6) globalCommsPoints += 5 + (lvl - 6);
    }
    if (skillNames.includes('Doctor')) doctors += 1;
    if (skillNames.includes('Munitions')) munitions += 1;
  }

  const waveDeploymentCapacity = Math.min(20, 4 + scouts);

  return {
    totalAccounts: accounts.length,
    waveDeploymentCapacity,
    scouts,
    scoutStatus:
      scouts < 2
        ? 'Need 2-4 Scouts to reach 6-8 deployment capacity'
        : scouts <= 4
          ? 'Optimal (2-4 Scouts)'
          : 'WARNING: 5+ Scouts causes AoE & Friendly-Fire bloat!',
    saboteurs,
    globalSabotagePower,
    commsOfficers,
    globalCommsPoints,
    commsBugAlert:
      globalCommsPoints >= 10 && globalCommsPoints < 20
        ? 'WARNING: 10+ Comms unlocks Retreat (known Raid bug removes surviving recruits!)'
        : 'Safe',
    doctors,
    munitions,
  };
}

/**
 * Scores available upgrades for a soldier using Individual Build + Collective Raid rules
 */
function recommendBestUpgrade(soldier, collectiveMetrics) {
  const arch = detectSoldierArchetype(soldier);
  const currentSkills = (soldier.skills || []).map((s) => (typeof s === 'string' ? s : s.name));
  const weaponCount = (soldier.skills || []).filter((s) => s.type === 'Weapon').length;
  const options = soldier.availableUpgrades || [];

  if (options.length === 0) {
    return {
      recommendedOptionId: null,
      recommendedSkill: 'Unlock upgrade on /t/0 to view rolled choices',
      reasons: [
        `Detected Archetype: ${arch.name} (Style: ${arch.recommendedStyle}, Target: ${arch.recommendedTarget}).`,
        `Collective Pool: ${collectiveMetrics.saboteurs} Saboteurs (${collectiveMetrics.globalSabotagePower} disarm pts), ${collectiveMetrics.scouts} Scouts.`,
      ],
    };
  }

  let bestOption = options[0];
  let bestScore = -999;
  let bestReasons = [];

  for (const opt of options) {
    let score = 0;
    const reasons = [];

    // Rule 1: Universal S+ Tier Skills (Smart & Suspicious)
    if (opt.name === 'Smart') {
      score += 100;
      reasons.push('S+ Tier Universal Rule: +1 level-up choice and 100% Propaganda immunity.');
    }
    if (opt.name === 'Suspicious') {
      score += 95;
      reasons.push('S+ Tier Raid MVP: 100% immune to enemy Sabotage and allied Friendly Fire.');
    }

    // Rule 2: Collective Raid Specializations
    if (opt.name === 'Saboteur') {
      score += 90;
      reasons.push('S-Tier Global Passive: Disarms enemy weapons across every Raid wave from reserve.');
    }
    if (opt.name === 'Doctor' && collectiveMetrics.doctors < 4) {
      score += 85;
      reasons.push('A-Tier Wave Sustain: Heals surviving troopers between Raid phases.');
    }
    if (opt.name === 'Scout') {
      if (collectiveMetrics.scouts >= 4) {
        score -= 60;
        reasons.push('AVOID: Army already has 4 Scouts (5+ causes AoE & Friendly-Fire wipeouts).');
      } else {
        score += 65;
        reasons.push('Global Passive: +1 Wave Deployment capacity (within 2-4 Scout cap).');
      }
    }
    if (opt.name === 'Spy') {
      score -= 80;
      reasons.push('F-Tier in Raids: Spies infiltrate early waves alone and die or trigger friendly fire.');
    }

    // Rule 3: Enforce 2-Weapon Rule
    if (opt.type === 'Weapon' && weaponCount >= 2 && !['Loader', 'Nimble Fingers', 'Hydroshock', 'Hydroshock Shells', 'Paralysing Shells'].includes(opt.name)) {
      score -= 40;
      reasons.push(`Warning: Soldier already carries ${weaponCount} weapon skills (exceeding 2 weapons causes AI swap loops & Saboteur disarm risk).`);
    }

    // Rule 4: Individual Archetype Synergy
    if (arch.coreSkills.includes(opt.name)) {
      score += 55;
      reasons.push(`Direct synergy with ${arch.name} build matrix.`);
    }
    if (['Hard Boiled', 'Sturdy', 'Bulletproof Vest', 'Bulletproof vest'].includes(opt.name)) {
      score += 45;
      reasons.push('S-Tier Survival: Damage reduction & HP carry over across multi-wave Raids.');
    }

    if (reasons.length === 0) {
      reasons.push(`Standard tactical utility for ${arch.name}.`);
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
      bestReasons = reasons;
    }
  }

  return {
    recommendedOptionId: bestOption.id,
    recommendedSkill: bestOption.name,
    reasons: bestReasons,
  };
}

module.exports = {
  detectSoldierArchetype,
  evaluateCollectiveRaidPool,
  recommendBestUpgrade,
};