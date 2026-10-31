# Avalon 0.4 contribution ledger

Date: 2026-10-30.

The previous 35 open stack PRs merge against their original bases.
Their heads already enter main through assembly PR #48.
Release v0.3.0 publishes that existing CLI and Python package.

This table records 32 new contributions before the final measured release PR.
The three extra corrections follow independently reproduced review findings.
Each linked PR records its focused behavior and validation.
GitHub records the current merge state.
The release verification receipt records the final merged head separately.

| PR | Contribution | Reviewed head |
| --- | --- | --- |
| [#49](https://github.com/marco-trotta1/avalon-rl/pull/49) | docs(research): freeze the next Avalon evidence gates | `f0fe941250801322e12f2b3ea5c169505520fa06` |
| [#50](https://github.com/marco-trotta1/avalon-rl/pull/50) | fix(release): ship executable examples and verify package artifacts | `1c3dc9d43512a0e8e308b19f7623a86d8a0f0d36` |
| [#51](https://github.com/marco-trotta1/avalon-rl/pull/51) | feat(sampling): parse bounded inert probability receipts | `675e1ee50d3ca9a458330885bfdab669c7888d16` |
| [#52](https://github.com/marco-trotta1/avalon-rl/pull/52) | feat(sampling): audit keyed token supports and unknown evidence | `5e3f376ae61c2e30c6d067fe0a5439c292a6a8ec` |
| [#53](https://github.com/marco-trotta1/avalon-rl/pull/53) | feat(sampling): replay stable finite token probabilities | `4f5be9efdda6623a43f08e4d1e95ab63c4537bde` |
| [#54](https://github.com/marco-trotta1/avalon-rl/pull/54) | feat(trace): parse declarative outcome contracts | `55de1383fdd50c6100814c6ed37c186f8f740fee` |
| [#55](https://github.com/marco-trotta1/avalon-rl/pull/55) | feat(world): export bounded learning tables through the reducer | `76efcb1239d3985a261dd0eecc9415bad36f6ffa` |
| [#56](https://github.com/marco-trotta1/avalon-rl/pull/56) | feat(policy): parse finite operations MDP tables | `03e80732272fac64d2e5b6aee231dc67ffdd4729` |
| [#57](https://github.com/marco-trotta1/avalon-rl/pull/57) | feat(policy): execute seeded bounded Q-learning updates | `25809ed72de855b09985b8471846dfd1a8454dc1` |
| [#58](https://github.com/marco-trotta1/avalon-rl/pull/58) | feat(sampling): replay ordered effective logit processors | `65df825c25f3e4a6a42847021e5a1619ebca1efd` |
| [#59](https://github.com/marco-trotta1/avalon-rl/pull/59) | feat(sampling): preserve token roles and training masks | `e52203c6627b4933742d2cb209116d1f2f3b5fba` |
| [#60](https://github.com/marco-trotta1/avalon-rl/pull/60) | feat(sampling): expose full distributions and correction impact | `866364bbdc29e9510eb846392148b0baa4e11360` |
| [#61](https://github.com/marco-trotta1/avalon-rl/pull/61) | feat(sampling): bind categorical gradient witnesses to token evidence | `059d4f6928bd203cc68fff378ed1bbcd47ec4ed7` |
| [#62](https://github.com/marco-trotta1/avalon-rl/pull/62) | feat(sampling): serialize private witnesses and grouped audit reports | `cb93f60e2ce30fd49e372f5f45aac409fa7cfa7d` |
| [#63](https://github.com/marco-trotta1/avalon-rl/pull/63) | feat(trace): audit final outcomes and frame conditions | `26eaec64a42a835292dfe2ac054ec2aca9a2092d` |
| [#64](https://github.com/marco-trotta1/avalon-rl/pull/64) | feat(trace): retain temporal effects and action authority | `9bde9136a37e6d1a6f9618213454a0e8824e279e` |
| [#65](https://github.com/marco-trotta1/avalon-rl/pull/65) | feat(policy): compare reward arms with independent outcomes | `accfb06695caf11297d4b04f0291fb3cb6d18521` |
| [#66](https://github.com/marco-trotta1/avalon-rl/pull/66) | feat(policy): compare fixed and random task schedules | `d62aaf4163d995530a941802b9e73d104936ab4f` |
| [#67](https://github.com/marco-trotta1/avalon-rl/pull/67) | feat(policy): select tasks from training disagreements | `2de40f99010619f60f4a11d65b3a98bc87d7dd69` |
| [#68](https://github.com/marco-trotta1/avalon-rl/pull/68) | feat(policy): freeze task-family and seed holdouts | `38fe59d9c007059a97ceff75f75956742a68f06c` |
| [#69](https://github.com/marco-trotta1/avalon-rl/pull/69) | feat(sampling): benchmark frozen families against dense assertions | `8f3437484f5354e9a4cca53d30714d68d75f8ecc` |
| [#70](https://github.com/marco-trotta1/avalon-rl/pull/70) | feat(trace): audit declared isomorphic episode pairs | `d7904e21bdb3f5c7d46d7a450bd317ed9d2ab5e0` |
| [#71](https://github.com/marco-trotta1/avalon-rl/pull/71) | feat(trace): bind private witnesses to selected episode evidence | `9115dbb0c12e8c4fc76c3d8b7d828466bd0957d4` |
| [#72](https://github.com/marco-trotta1/avalon-rl/pull/72) | feat(trace): audit group holdouts and bind retained witness data | `295f95edc0924d3feac5bd25ee7fcc3a4630f144` |
| [#73](https://github.com/marco-trotta1/avalon-rl/pull/73) | feat(trace): compare contracts with independent finite controls | `9ff2789c5db3113141ea5335669aee8d6b504a24` |
| [#74](https://github.com/marco-trotta1/avalon-rl/pull/74) | feat(policy): run frozen paired-seed experiments | `e552a2326a08fd0d4903ce6436f083fbef3f5f5a` |
| [#75](https://github.com/marco-trotta1/avalon-rl/pull/75) | feat(policy): export learned traces and measured baseline evidence | `fb72700239bdb9fd9abeb494a648144c990310cd` |
| [#76](https://github.com/marco-trotta1/avalon-rl/pull/76) | feat(cli): expose sampling forensics and learned trace contracts | `b73707f59c500339d3759f0ff6f1549acc918de8` |
| [#77](https://github.com/marco-trotta1/avalon-rl/pull/77) | fix(sampling): retain independently proven membership violations | `c8293955ccc6ddcc21b95d8ec187f311a1200645` |
| [#78](https://github.com/marco-trotta1/avalon-rl/pull/78) | fix(world): require room for the complete known solution | `364a116a89fe7aa41dfcfcdb75a7ce34429bf3a0` |
| [#79](https://github.com/marco-trotta1/avalon-rl/pull/79) | fix(trace): preserve optional fields in declared episode pairs | `5671fc024b2ccb713630c2f7d9903e6ae98a5573` |
| [#80](https://github.com/marco-trotta1/avalon-rl/pull/80) | test(lab): diagnose learned reward failures across the runtime boundary | `f3fa9810f1eb3f41b6b986a48945eab8862d3dff` |

The final release PR adds package versions, measured evidence, and the generated-cache exclusion.
The tests first reproduce that cache inclusion before the package rules exclude it.
No private research files enter the changes.
