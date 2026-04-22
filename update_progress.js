const fs = require('fs');

snip const progressPath = 'tasks/progress.md';
snip let content = fs.readFileSync(progressPath, 'utf8');

snip const newEntry = `
## Task — Market data fetching and risk agent fixes (4/22/2026)

**Description:** Fix silent failures in risk agent tools due to missing historical data, bypass CoinGecko historical data limits by forcing Yahoo Finance, and update Risk Agent prompt to value diversification.

**Summary:**
- \`src/lib/market/index.ts\`: Updated \`getHistory\` to always use Yahoo Finance (\`getHistoricalOHLCV\`) instead of CoinGecko for historical data. Appends \`-USD\` to crypto tickers automatically. Removed unused \`getCryptoHistoricalOHLCV\` import.
- \`src/lib/agents/risk.ts\`: Updated \`runHistoricalStressTest\` and \`computeVar\` tools to throw an explicit \`Error\` if \`getHistory\` returns null or empty, preventing silent continuous loops and empty arrays.
- \`src/lib/agents/risk.ts\`: Updated Risk Agent prompt to explicitly value diversification. Instructed to lean towards \`approved_with_caveats\` if a proposed portfolio significantly reduces single-asset concentration risk, even if historical VaR or drawdown numbers don't show a massive mathematical improvement.

**Gotchas:**
- None. Build and typecheck pass clean.

---
`;

snip content = content.replace('# Progress Log\n', '# Progress Log\n' + newEntry);
snip fs.writeFileSync(progressPath, content);

snip const tasksPath = 'tasks/TASKS.md';
snip let tasks = fs.readFileSync(tasksPath, 'utf8');
snip tasks = tasks.replace('- [x] Risk Agent prompt update: evaluate proposed vs current, new verdict enum + `improvement_summary`', '- [x] Risk Agent prompt update: evaluate proposed vs current, new verdict enum + `improvement_summary`\n- [x] Always use Yahoo Finance for historical data (append -USD for crypto)\n- [x] Risk Agent tools throw explicit errors on missing historical data\n- [x] Risk Agent prompt values diversification and concentration risk reduction');
snip fs.writeFileSync(tasksPath, tasks);

snip EOF
node update_progress.js
rm update_progress.js
