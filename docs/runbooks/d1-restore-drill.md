# D1 restore drill (owner runs it)

Proves that a full export of the production database `ck-leads` can be loaded into a fresh database and gives back the
same rows. Claude never runs this: it reads and writes remote D1 with your Cloudflare login.

Run it from `worker/` on your own computer, signed in with `npx wrangler login`. About 10 minutes.

**The export holds personal data (leads, emails, phone numbers).** Keep `backup.sql` only for the drill, never commit it
(`.gitignore` refuses `backup*.sql`), and delete it at the end.

## 1. Export production

```sh
npx wrangler d1 export ck-leads --remote --output=backup.sql
```

## 2. Create the drill database and load the export

```sh
npx wrangler d1 create ck-leads-drill
npx wrangler d1 execute ck-leads-drill --remote --file=backup.sql
```

`d1 create` prints a binding block for `wrangler.toml`: do NOT add it. The drill database is addressed by name only.

## 3. Count rows on both databases

The tables come from `worker/migrations/` (0001 to 0005): `leads`, `messages`, `suppression`, `events`,
`investor_profiles`, `newsletter_subscribers`, `dld_area_month`, `dld_month_totals`, `market_stats`, `market_sync_runs`,
`market_sync_checks`, `market_cache`. Run the same query on each database:

```sh
Q="SELECT 'leads' AS t, COUNT(*) AS n FROM leads
UNION ALL SELECT 'messages', COUNT(*) FROM messages
UNION ALL SELECT 'suppression', COUNT(*) FROM suppression
UNION ALL SELECT 'events', COUNT(*) FROM events
UNION ALL SELECT 'investor_profiles', COUNT(*) FROM investor_profiles
UNION ALL SELECT 'newsletter_subscribers', COUNT(*) FROM newsletter_subscribers
UNION ALL SELECT 'dld_area_month', COUNT(*) FROM dld_area_month
UNION ALL SELECT 'dld_month_totals', COUNT(*) FROM dld_month_totals
UNION ALL SELECT 'market_stats', COUNT(*) FROM market_stats
UNION ALL SELECT 'market_sync_runs', COUNT(*) FROM market_sync_runs
UNION ALL SELECT 'market_sync_checks', COUNT(*) FROM market_sync_checks
UNION ALL SELECT 'market_cache', COUNT(*) FROM market_cache"
npx wrangler d1 execute ck-leads --remote --command "$Q"
npx wrangler d1 execute ck-leads-drill --remote --command "$Q"
```

## 4. Compare

Every table must show the same count on both. A row written to production between step 1 and step 3 (an enquiry, the
daily retention job at 01:17 UTC, a market sync) can make production differ by that row: run step 1 again if a count
is off, or run the drill when the site is quiet. Any other difference means the backup cannot be trusted: keep the
drill database, stop, and report it.

Write the result in the run log: date, the 12 counts, pass or fail.

## 5. Clean up

```sh
npx wrangler d1 delete ck-leads-drill
rm backup.sql
```

On Windows (cmd) the last line is `del backup.sql`. Check that `git status` does not list any `backup*.sql`.
