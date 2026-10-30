# Avalon PR ledger

Date: 2026-10-30.
Base commit: `4f6325d27642b741e0cb3a7f779320430041ab4c`.

This ledger records 47 constituent PRs from the authorized swarm build.
Git ancestry checks confirm that every listed head is in the assembled release history.
The final assembly PR adds the CLI-only scope, learning guide, strategy, and measured evidence.
The table distinguishes a merged PR from a contribution included through the assembled history.
The HTML viewer in PR #19 is superseded. The release contains no UI or site.

| PR | Contribution | Exact head | Delivery state |
| --- | --- | --- | --- |
| [#1](https://github.com/marco-trotta1/avalon-rl/pull/1) | feat: add versioned experience snapshots | `d512fd3744cf6fb2be2985e158fbd91f6c1be6a7` | Merged |
| [#2](https://github.com/marco-trotta1/avalon-rl/pull/2) | feat(audit): compare keyed snapshot transitions | `7e7eda8001e84037091f962e7ccbaf92afd847d9` | Merged |
| [#3](https://github.com/marco-trotta1/avalon-rl/pull/3) | feat(world): add deterministic operations state | `b057f7bff713f1d44ce71ae0affe55b33d95086e` | Included in release history |
| [#4](https://github.com/marco-trotta1/avalon-rl/pull/4) | feat(audit): compare nested numbers with explicit tolerances | `29e8ccb2c9bcbda7ebdfa017b7d6fdd6bb161e15` | Included in release history |
| [#5](https://github.com/marco-trotta1/avalon-rl/pull/5) | feat(python): record seeded Gymnasium snapshots | `4da57f1315e762c0a45178e50c8091a2cafccd17` | Included in release history |
| [#6](https://github.com/marco-trotta1/avalon-rl/pull/6) | feat(world): add task goals and independent evidence | `14cc3918c462d0580e3882b73b18f448a7ab1fed` | Included in release history |
| [#7](https://github.com/marco-trotta1/avalon-rl/pull/7) | feat(audit): validate complete episode and step coverage | `f01da887e1fe5530ae8160b38b35b6a5c1ee55a5` | Included in release history |
| [#8](https://github.com/marco-trotta1/avalon-rl/pull/8) | feat(world): record canonical replay and divergence receipts | `d3daad19409ec153280129b375cf3595432ab7c3` | Included in release history |
| [#9](https://github.com/marco-trotta1/avalon-rl/pull/9) | feat(audit): preserve ending signals and bootstrap semantics | `a9b3fbdbaa6a5490de57eb6687fd141d166813d6` | Included in release history |
| [#10](https://github.com/marco-trotta1/avalon-rl/pull/10) | feat(cli): audit local experience and demonstrate faults | `7db61c5901460b61d1199673ce48f8df0bd4cd90` | Merged |
| [#11](https://github.com/marco-trotta1/avalon-rl/pull/11) | feat(world): expose rewarded wrong outcomes with an oracle | `65f352fd8484c087710ccccea585777674480a02` | Included in release history |
| [#12](https://github.com/marco-trotta1/avalon-rl/pull/12) | feat(python): roundtrip real Minari datasets | `b08f9f9aa53008f39ebd2367bc9bc3dee9a8ab5f` | Included in release history |
| [#13](https://github.com/marco-trotta1/avalon-rl/pull/13) | feat(audit): verify continuity and episode closure | `cf50730a28088d06d77f36c1fb6a9ab76dd5f456` | Included in release history |
| [#14](https://github.com/marco-trotta1/avalon-rl/pull/14) | feat(python): execute NumPy learner conversion | `7d69eaa4a28a615037de49eb18e3c4bbcc6b14a3` | Included in release history |
| [#15](https://github.com/marco-trotta1/avalon-rl/pull/15) | feat(world): challenge verifier with valid fixture mutations | `8532563eeea1b36107a30625669f3e3829cc8ab0` | Included in release history |
| [#16](https://github.com/marco-trotta1/avalon-rl/pull/16) | feat(audit): preserve task identity and episode metadata | `4b3a3623111d26c356479f151df324ca855789a9` | Included in release history |
| [#17](https://github.com/marco-trotta1/avalon-rl/pull/17) | feat(python): inject controlled preservation faults | `65cca71843180640f30a074b059c25d3c7c6ef9f` | Included in release history |
| [#18](https://github.com/marco-trotta1/avalon-rl/pull/18) | feat(world): search a bounded counterexample space | `d768e9ab978340783de2754ca5a787446ac08b36` | Included in release history |
| [#19](https://github.com/marco-trotta1/avalon-rl/pull/19) | feat(report): inspect audit findings in an offline viewer | `40d03d88e8bd2b153a0c85ee326965cb6a164abf` | Merged |
| [#20](https://github.com/marco-trotta1/avalon-rl/pull/20) | feat(audit): fingerprint content and detect split overlap | `7b7e1cdaaf3750dbf38cd41d488d829fe006d720` | Included in release history |
| [#21](https://github.com/marco-trotta1/avalon-rl/pull/21) | feat(python): run reproducible local RL experiments | `ac16cc8275ebb39b25a8677aedbc6815afecf348` | Included in release history |
| [#22](https://github.com/marco-trotta1/avalon-rl/pull/22) | feat(world): select curriculum tasks from outcome evidence | `b61f2e8c2fd12ad5e2eeda236353465b46ed807b` | Included in release history |
| [#23](https://github.com/marco-trotta1/avalon-rl/pull/23) | feat(audit): localize pipeline divergence and verify hash links | `4abbd81ea1e6a584db35dcbe95b74d23713db7ea` | Included in release history |
| [#24](https://github.com/marco-trotta1/avalon-rl/pull/24) | feat(python): split datasets by connected episode groups | `7cd74906e4d3a0bfcf93e57faac937e55d581377` | Included in release history |
| [#25](https://github.com/marco-trotta1/avalon-rl/pull/25) | feat(world): export episodes as shared experience snapshots | `2a78a5c4ea71f366187559acc169857fc6137aed` | Included in release history |
| [#26](https://github.com/marco-trotta1/avalon-rl/pull/26) | feat(python): record trusted built-in Gymnasium environments | `3837cee6d52f7f059017b62dcd916dcc76549574` | Included in release history |
| [#27](https://github.com/marco-trotta1/avalon-rl/pull/27) | feat(report): export Markdown and SARIF evidence | `2218236caf476d2ef68d8969207bc46bee75c73c` | Merged |
| [#28](https://github.com/marco-trotta1/avalon-rl/pull/28) | feat(world): benchmark verifier accuracy cost and latency | `937d4bf423527ff5a30e04ae3a4a0b5b338cd1dc` | Included in release history |
| [#29](https://github.com/marco-trotta1/avalon-rl/pull/29) | feat(audit): extract private reproducible finding witnesses | `674ed24fec0db0c3e34bc3a34c7ec8b53033c051` | Included in release history |
| [#30](https://github.com/marco-trotta1/avalon-rl/pull/30) | feat(python): export local Minari datasets with strict conversion | `9c0e891887e3a4b39aa7abd209d9cca3c658c9a0` | Included in release history |
| [#31](https://github.com/marco-trotta1/avalon-rl/pull/31) | fix(world): close truncated episodes in the state type | `32ad55f944c80173dd72765858648a359c5a4426` | Included in release history |
| [#32](https://github.com/marco-trotta1/avalon-rl/pull/32) | fix(world): compare complete replay receipt evidence | `e019c49929e60674a23aa8a6b914401438d0ad80` | Included in release history |
| [#33](https://github.com/marco-trotta1/avalon-rl/pull/33) | feat(python): compare real pipeline audits with simple baselines | `4d8905b8cfef9f85a82947988114b929f1fcad92` | Included in release history |
| [#34](https://github.com/marco-trotta1/avalon-rl/pull/34) | fix(snapshot): reject JSON keys that lose evidence | `cf0f5126e39967367d1f81cf3ccfdfdee0dc0a4f` | Merged |
| [#35](https://github.com/marco-trotta1/avalon-rl/pull/35) | fix(audit): prevent finite numeric tolerance overflow | `e47f5a6b766daf52c0a482fd6d2d088c184e8e55` | Included in release history |
| [#36](https://github.com/marco-trotta1/avalon-rl/pull/36) | fix(audit): bind witnesses to target episode identity | `c9c632433e23d5994c44e686f7f0a5ed346c7a71` | Included in release history |
| [#37](https://github.com/marco-trotta1/avalon-rl/pull/37) | fix(world): prioritize unseen eligible curriculum tasks | `531fe5250869904415431dc47ca23f4fa7f688f2` | Included in release history |
| [#38](https://github.com/marco-trotta1/avalon-rl/pull/38) | fix(world): reject non-JSON and cyclic hash input | `19f969fbdfca8a004d580fad70233b677ad1287c` | Included in release history |
| [#39](https://github.com/marco-trotta1/avalon-rl/pull/39) | fix(python): prevent implicit Minari environment recovery | `82876f218c437da7b450cd3dde571dd187dbe73b` | Included in release history |
| [#40](https://github.com/marco-trotta1/avalon-rl/pull/40) | fix(python): validate reward precision before float conversion | `1de5ee14fc8bd5abde0b0ddf1813bb5ec07d8025` | Included in release history |
| [#41](https://github.com/marco-trotta1/avalon-rl/pull/41) | feat(lab): connect pipelines, witnesses, and learning worlds | `3a7c8f1265c5f03b78f5e9a4de211cb3b1c09dc7` | Included in release history |
| [#42](https://github.com/marco-trotta1/avalon-rl/pull/42) | fix(cli): reject named pipe inputs without blocking | `9c6ecfefb8c002de78324fb1d6920ed5061d0c97` | Included in release history |
| [#43](https://github.com/marco-trotta1/avalon-rl/pull/43) | feat(sdk): package typed audit and world APIs | `89d12b9843ae7c4853d3c230c342f2a9dbc3d16a` | Included in release history |
| [#44](https://github.com/marco-trotta1/avalon-rl/pull/44) | fix(report): import bounded generated audit reports | `3b5d6e839ce069c72a950717148a37868ce4bc78` | Included in release history |
| [#45](https://github.com/marco-trotta1/avalon-rl/pull/45) | ci: validate agent learning workflows and contributor evidence | `f58da591bb143d050593528bb4502942962da8f7` | Included in release history |
| [#46](https://github.com/marco-trotta1/avalon-rl/pull/46) | fix(report): flatten supplied Markdown line separators | `5c49ef8c4e14b0629bedf3c76ecb83c6c3950c00` | Included in release history |
| [#47](https://github.com/marco-trotta1/avalon-rl/pull/47) | fix: install Python package metadata before CI tests | `6b5bfaa7357ac91e93f5cee59346c2a9e7c34bb7` | Included in release history |

## Verification

Workers record focused tests, full suites, type checks, privacy checks, and whitespace checks before publication.
Independent reviews cover the audit engine, operations world, Python adapters, and CLI boundaries.
Proven defects receive failing regressions before corrections.
The final release evidence records the integrated checks and their practical limits.

A bulk retarget operation is rejected by automatic approval review.
The final assembly uses one reviewable integration PR instead of that operation.
No force push, branch deletion, registry publication, or production deployment occurs.

