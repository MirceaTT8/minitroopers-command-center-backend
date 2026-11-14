// backend/server.js
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// GET /api/accounts - Triggers script execution and returns parsed army data
app.get('/api/accounts', (req, res) => {
  // Option A: If you want to run your real bash script archive:
  // exec('bash ./scripts/run.sh.txt', (error, stdout, stderr) => { ... });

  // For now, returning the structured JSON that your Vue 3 frontend expects:
  const accountsData = [
    {
      id: 'berbelita1',
      name: 'berbelita1',
      raidPhase: 4,
      credits: 222,
      raidCurrency: 49,
      firstSoldier: {
        slot: 0,
        name: 'Mr.Reinelmes',
        level: 8,
        archetype: 'Mid-Range Bruiser',
        upgradeCost: 181,
        aiConfig: {
          favouriteWeapon: 'Comanche Auto',
          favouriteTarget: 'In the head!',
          preferredVictim: 'The biggest threat',
          fightingStyle: 'Standard',
          priorityTarget: 'Default',
        },
        skills: [
          'Comanche Auto',
          'Browning',
          'Bazooka',
          'Grenade',
          'Pilot',
          'Saboteur',
          'Sprint',
          'Dodge',
          'Anatomy',
          'Hard Boiled',
          'Smart',
          'Suspicious',
        ],
        availableUpgrades: [
          {
            id: 'opt1',
            name: 'Twinoid',
            type: 'Active',
            color: 'Yellow',
            description: 'Fires twice per reload cycle. Strong synergy with Comanche Auto.',
          },
          {
            id: 'opt2',
            name: 'Sniper Rifle',
            type: 'Weapon',
            color: 'Red',
            description: 'Warning: Exceeds 2-weapon rule and increases Saboteur disarm risk.',
          },
        ],
        aiRecommendation: {
          recommendedOptionId: 'opt1',
          recommendedSkill: 'Twinoid',
          reasons: [
            'Individual Build: Matches Armor-Piercing Mid-Range Bruiser archetype.',
            'Rule Check: Avoids adding an extra firearm (prevents AI weapon-swap loops).',
            'Raid Synergy: Boosts sustained wave DPS for Recruiter Raid Phase 4.',
          ],
        },
      },
    }
    // ... other accounts (berbelita2 to 7) can be added here or parsed dynamically
  ];

  res.json(accountsData);
});

const PORT = process.0 || 3000;
app.listen(PORT, () => {
  console.log(`Mini Troopers Backend running on http://localhost:${PORT}`);
});