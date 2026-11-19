# Maintenance 3 (PR 133): visual proof

The Dependabot updates added to PR 133 (astro 7.4.7 to 7.4.11, wrangler 4.158.0 to 4.160.1 in /site and /worker,
@cloudflare/vitest-plugin 1.6.0 to 1.8.0, vite 8.3.6 to 8.3.8, @cloudflare/workers-types 5.20261107.1 to 5.20261112.1)
change nothing a visitor sees.

## Built output

Before (this branch with astro 7.4.7) and after (with these updates), each built three ways: noindex (CI), public, and
public with PUBLIC_CF_ANALYTICS_TOKEN set (the deploy-site build). In all three, every file is byte-identical, the hashed
/_astro/ assets included. No normalisation was needed.

## Screenshots

Taken with the PR 132 harness (`../maintenance-2/harness/shots.mjs`, the same recorded Worker responses, fixed clock,
the same Chromium binary) on the noindex builds: the same 20 views at 375 and 1280, full page, at 2x.

- Before and after: 0.0000% of pixels changed on all 40 pairs (`../maintenance-2/harness/diff.py`).
- All 40 PNG files are byte-identical to `../maintenance-2/after/`. Since they are byte-identical, they are not committed
  again; the manifest below lets anyone check a fresh run against them.

| shot | pixels changed (before to after) | sha256 (same as maintenance-2/after) |
|---|---|---|
| 404-1280 | 0.0000% | `d91a3f0169e6116627c40a0bddff4b120ed858643ae7536c6deeb83af326cc25` |
| 404-375 | 0.0000% | `1d8b79c26aa3ef1d534f93feeec720025b775c25565b7651845d0a94d173d4f6` |
| about-1280 | 0.0000% | `d89b77022b1a2b0575737dba809f2ba5696f18d63ace5f3e8a04a80a4153455a` |
| about-375 | 0.0000% | `8ba5a025490f1dc2ed4aab4248649c0d7a566f16e6eaf86e759b96d484354b27` |
| areas-abu-dhabi-change-1280 | 0.0000% | `a09300ffeac2b721392c47f7eda5874d29bbf8545d2a605375002ddb554745d6` |
| areas-abu-dhabi-change-375 | 0.0000% | `431babfdb18b69c40b5cfc64f4bc3257ee9669820997eee8043a0feabc282ccb` |
| areas-abu-dhabi-value-1280 | 0.0000% | `81830bbfe1841f3d43f327207a53458110565b2d66f9467fe7430c0998fc6e39` |
| areas-abu-dhabi-value-375 | 0.0000% | `18993d9c911fd507aaa80a433161a1d26c5c7e61a70e28274734843ccacc1551` |
| areas-dubai-change-1280 | 0.0000% | `fbdd78b4c143a1f23b5c5663456135bf748cf4b52191baac75caa7a838d811fd` |
| areas-dubai-change-375 | 0.0000% | `2201e238cd7ad0ce57f8c43ed4706057927741b95a4d118a4d4c855826115325` |
| areas-dubai-value-1280 | 0.0000% | `0af1fbb97f094cb3464e3902eb39f3aa688eb6d8352fb90920390dc4c66089a9` |
| areas-dubai-value-375 | 0.0000% | `c90d98f581f2b1f1eaae8cae62affe27bf67313dd49e76a919620d2cd918185f` |
| buy-1280 | 0.0000% | `12137f02204b802d080b561930c71b935b17fa960c4c215d3c4e5d41d0d5138d` |
| buy-375 | 0.0000% | `7daea852c6118cf08bed536644c7d377163ef4e666855de78c860dbceb810325` |
| contact-1280 | 0.0000% | `249cffbbb8c2a85812fd1bd4e941335c8f52d4597a396228e8c21005d37b258e` |
| contact-375 | 0.0000% | `197c8de1592bb5609473e529f0968b8c96fdfd533f2d045622554f78a624d9b2` |
| faq-1280 | 0.0000% | `6cb55acfae7e201561ab617fa65c5ab9d99b8e384833914550ae79aeff590366` |
| faq-375 | 0.0000% | `1cc95f16a2446541341b5155c080486c6723e7ff4837595d716fcb4510c2ef5b` |
| guide-dubai-marina-1280 | 0.0000% | `37091a5f45e12d56ec862c1d484be45768c5b829a7f9e73d623acf8972d96134` |
| guide-dubai-marina-375 | 0.0000% | `c3379c21bca45eab7125bed2c64270df91611a7b1ed0de3359d86e0ee9fb638b` |
| guide-saadiyat-island-1280 | 0.0000% | `7e762b6685f06e07d42825badf7f61db10594f0b1d5f2c272843046f91d06898` |
| guide-saadiyat-island-375 | 0.0000% | `6899edc09f9d80be3b27ddd244e62c88728147883b70d87fd819d45c9a0e1d04` |
| home-1280 | 0.0000% | `1a57a5a63c1048f860663456b39d505522bb72d281b71ddd05f3ef594ccd88c6` |
| home-375 | 0.0000% | `3311ee61555ad5056bf24f42126896bbfe94d8a99cb3ce35287cd753bcded0c2` |
| insights-1280 | 0.0000% | `80ff5e02fefbde6a565c706329b445334aeb23c8136b597cc7daf96576fcd402` |
| insights-375 | 0.0000% | `d74895edb35b5feea8234bffa0ded5be29095c55b4cb868dd9ba446369c66b27` |
| insights-costs-investors-forget-before-yield-1280 | 0.0000% | `660ae0f32b566802a7fb26d2eb1b8b6c23dcb1d97087ea5da4aa298215f4cc3c` |
| insights-costs-investors-forget-before-yield-375 | 0.0000% | `2458f4847725747166a476c652a581159205a0602c0ea2f54c12e7ea0b1f2a75` |
| insights-does-rising-transaction-value-mean-rising-prices-1280 | 0.0000% | `ecf3eb218afef8b4cdf217b472a2f73a6a389bc2d58f2c3b8fbee10c53cbabef` |
| insights-does-rising-transaction-value-mean-rising-prices-375 | 0.0000% | `ec4cb9490bcea640a6a276d48d86d007c635210abb9d744ceb3eb39dfc8dba0a` |
| insights-dubai-2026-so-far-official-numbers-1280 | 0.0000% | `04574150ed03d99ef92fe0831c34b98adbc97468b2236701e17f72b519a987d4` |
| insights-dubai-2026-so-far-official-numbers-375 | 0.0000% | `b6bc5580a528a8ec1d3d04d571b9eea702f7c0ee05b5de24d00c19e788b134a5` |
| invest-1280 | 0.0000% | `1e8ed4f3a3ef0dd76b124df9825c00f840337de76c9870b1ed66b82e06cbcbc5` |
| invest-375 | 0.0000% | `2535d2295bfba5df5d274950fc2c88c32fed56345161fedef0cd5ce3c69fe812` |
| investment-approach-1280 | 0.0000% | `8889e894be901752f2b15b90c84e5ad780f151ac7170edcc888d81e70849bde6` |
| investment-approach-375 | 0.0000% | `c94cde03bff3b54d854742da4d96e0974b49c61acb8376e3920a63a529f86714` |
| new-launches-1280 | 0.0000% | `b0d798513363e0a9ace6d449c6d5fdebbf8130e5bd17db22600dc71fab728406` |
| new-launches-375 | 0.0000% | `45cbb3315adc3859696c774e0038cd0208b9e5f4da9013bf440cc2953d529700` |
| sell-1280 | 0.0000% | `bd11d886fdd52011cb74e5e9b476622706813e5963de2a4aa512883bb6145d2e` |
| sell-375 | 0.0000% | `48ead1cb40c8725b33ab52c6cd79de9cf29a60e184e81baadd2327ece0d69864` |
