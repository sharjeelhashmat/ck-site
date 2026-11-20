# market-data

Snapshots of the public, read-only market answers of the site's Worker (https://ck-lead-worker.sharjeelhashmat.workers.dev).
The snapshot job of .github/workflows/market-data-sync.yml on phase2-site writes them after each successful weekly
sync. This is an orphan branch: it shares no history with the site and holds only this README and data/market/*.json.
Do not edit it by hand; the next snapshot replaces every file.

| File | Worker endpoint | Raw URL |
| --- | --- | --- |
| data/market/status.json | GET /market/status | https://raw.githubusercontent.com/sharjeelhashmat/ck-site/market-data/data/market/status.json |
| data/market/areas-ytd.json | GET /market/areas?period=ytd | https://raw.githubusercontent.com/sharjeelhashmat/ck-site/market-data/data/market/areas-ytd.json |
| data/market/launches.json | GET /market/launches | https://raw.githubusercontent.com/sharjeelhashmat/ck-site/market-data/data/market/launches.json |
| data/market/manifest.json | (written by the job) | https://raw.githubusercontent.com/sharjeelhashmat/ck-site/market-data/data/market/manifest.json |

Each data file is the Worker's answer byte for byte, unchanged. Dubai year to date totals are in areas-ytd.json under
dubai.ytd (sales_bn, total_bn, mortgages_bn, as_of); the top 8 Dubai areas are in dubai.top8. Abu Dhabi year to date
figures are in launches.json under abu_dhabi.

manifest.json holds the schema version, fetched_at (when the job read the Worker), the Worker's address, as_of (the
date of the newest Dubai transaction data) with the as_of date of every source, and each file's endpoint and sha256.
A commit is made only when a data file or this README changes, so fetched_at is the time of the last change, not of
the last check. raw.githubusercontent.com may serve a copy up to 5 minutes old.
