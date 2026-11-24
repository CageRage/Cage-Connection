'use strict';
const fs = require('node:fs');

function addQcCreditRules(document) {
  for (const [roomRoot, seats] of [['secureGames', 2], ['secureGamesV5', 4]]) {
    const room = document.rules?.[roomRoot]?.['$code'];
    if (!room || room.qcCreditConfirmations) {
      throw new Error(`Expected an existing ${roomRoot}/$code rule without a QC confirmation rule`);
    }
    const member = Array.from({length: seats}, (_, seat) =>
      `root.child('${roomRoot}').child($code).child('members/${seat}/uid').val() === auth.uid`
    ).join(' || ');
    room.qcCreditConfirmations = {
      '$uid': {
        '$entry': {
          '.write': `auth != null && auth.uid === $uid && $entry.matches(/^[a-f0-9]{64}$/) && (${member})`,
          '.validate': `auth != null && auth.uid === $uid && $entry.matches(/^[a-f0-9]{64}$/) && (${member}) && newData.hasChildren(['key','source'])`,
          key: {'.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 4096'},
          source: {'.validate': 'newData.isString() && newData.val().length <= 2048 && newData.val().matches(/^https?:\\/\\/[!-~]+$/)'},
          '$other': {'.validate': false}
        }
      }
    };
  }
  return document;
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node add-qc-credit-rules.cjs CURRENT_RULES NEW_RULES');
  const rules = addQcCreditRules(JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '')));
  fs.writeFileSync(output, JSON.stringify(rules, null, 2) + '\n', {flag: 'wx'});
}
module.exports = addQcCreditRules;
