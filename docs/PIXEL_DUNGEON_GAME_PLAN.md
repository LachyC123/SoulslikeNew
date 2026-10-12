# Pixel Dungeon — Detailed Game Plan

Design draft · 12 October 2026 · Working title only

This document consolidates the decisions made in the conversation and develops them into a production plan. Numbers are initial tuning targets, not playtested results. The three generated concepts were approved by the user as visual references on 12 October 2026. They are visual targets, not screenshots of an implemented game. Region names, item examples and narrative details below are proposed creative choices.

## 1. The game in one paragraph

A landscape, mobile-first browser action RPG in which you descend through beautiful pixel-art dungeons, searching each floor for the exit while assembling increasingly outrageous equipment combinations. You manually move, attack, dodge and use abilities. Early regions feel enchanting; deeper regions become stranger and more dangerous. Death loses your run equipment, but earned currency funds permanent upgrades. Solo play comes first. A later co-op version is a possibility, not part of the initial release commitment.

The defining pleasure is discovering that two individually interesting items combine into something spectacular. Exploration supplies opportunities; combat tests the build; the exit gives you a meaningful choice about when to leave.

## 2. Agreed design decisions

| Area | Direction |
|---|---|
| Perspective | 2D top-down, with consistent sprite and tile scale |
| Platform | Browser, touch-first landscape; desktop controls also supported |
| Combat | Manual attacks, dodge and abilities; fast light weapons and weighty heavy weapons |
| Character system | Equipment determines the build; no fixed combat class |
| Randomisation | Layouts, encounters, loot, equipment properties, compatible visual components and boss variations |
| Run structure | Four regions, three floors each; bosses end floors 3, 6, 9 and 12 |
| Normal exit | Usable when found; no requirement to clear the entire floor |
| Failure | Lose run gear; retain banked progression and unlocks |
| Difficulty | Challenging but fair; clear warnings and recovery opportunities |
| Discoveries | Secrets, shops, blacksmiths, curses, short puzzles and environmental interactions |
| Power ceiling | Rare, spectacular combinations are desirable |
| Session handling | Suspend and resume a run across several phone sessions |

The scope does not promise literally unique content forever. Procedural systems combine a finite, carefully authored vocabulary. Repeatable visual and combat rules are necessary for players to learn.

## 3. Run pacing

Target roughly 30–45 minutes for a direct successful run, with thorough exploration potentially taking longer. A region should take approximately 7–10 minutes plus brief reward decisions. Ordinary floors target around 2–4 minutes on the main route; the third floor is shorter before its boss. Measure these targets during playtests rather than stretching rooms to hit a duration.

Each region follows introduction, development and climax. Floor one introduces its environment and enemy relationships. Floor two combines those threats with optional risks. Floor three offers a shorter approach, preparation space and boss arena. After a boss, choose one of three substantial rewards, recover a modest amount of health and enter the next region.

Normal floors have no global countdown. Optional timed encounters announce their rules before activation. Descending is one-way; holding the descend control briefly prevents accidental departure. The exit screen shows useful reminders such as an unvisited shop, but never demands full completion.

## 4. The first five minutes

The first-ever run begins on a short curated teaching route within the first region. Later runs use normal procedural floors immediately.

| Time | Player experience |
|---|---|
| 0–15 seconds | Move through a sunlit ruined garden; the objective reads “Find the stairs.” Only movement guidance appears. |
| 15–40 seconds | Attack a simple root creature with a generous windup. Its reaction demonstrates hit feedback. |
| 40–60 seconds | A clearly marked ground attack teaches dodging. Failure hurts but should not immediately kill a healthy beginner. |
| 1–2 minutes | Find a second weapon; a paused comparison explains damage per hit, speed and the weapon skill. |
| 2–3 minutes | Reach a fork: a safe-looking route and a visible optional chest guarded by a stronger enemy. |
| 3–4 minutes | Find a ring that interacts with one available weapon. A short synergy message explains the connection. |
| 4–5 minutes | Discover the stairs and choose whether to descend or investigate the remaining branch. |

Tutorial guidance disappears after the action succeeds, remains available in help, and never repeats every run. Later discoveries teach curses, relics and blacksmiths at the moment they become relevant.

## 5. World and visual progression

| Region | Floors | Visual identity | Combat/environment identity |
|---|---|---|---|
| Verdant Ruins | 1–3 | Moss, warm stone, turquoise water, pale flowers, sunbeams | Root creatures, moth casters, thorn traps and simple lanes |
| Ember Conservatory | 4–6 | Copper glasshouses, orange foliage, ash gardens, glowing furnaces | Charging constructs, fire vents, oil and movable cover |
| The Glass Depths | 7–9 | Dark teal cathedral stone, violet crystals, star-like pools | Armoured insects, spear sentinels, refraction hazards and frost interactions |
| The Inverted Crown | 10–12 | Suspended gardens, pale roots, broken royal architecture over darkness | Echo attacks, coordinated elites and strange but clearly telegraphed hazards |

The sequence gives each run a recognisable dramatic arc. Each region has several compatible subthemes, floor conditions and route styles. Later expansion can introduce alternate regions in the same difficulty bands; the first version should establish four strong identities before increasing the pool.

Visual priorities: clear character silhouettes; beautiful environmental composition; bright, readable magic. Reject mismatched pixel scales, excessive bloom and props scattered without a spatial purpose. An art pass must preserve walking space, attack warnings and enemy visibility.

## 6. Procedural floor generation

Generate the route graph before choosing tiles and props. The graph defines a safe arrival, a critical path to the exit, optional branches, reward locations and at least one useful loop where space permits. An initial target is 7–11 meaningful spaces per normal floor, mixing short connectors and larger encounters. Boss approaches use fewer spaces.

Generation proceeds in this order:

1. Choose region, subtheme, floor condition and pacing profile.
2. Create a connected room graph with bounded travel distances.
3. Assign purposes: arrival, combat, traversal, discovery, recovery, secret and exit.
4. Select compatible room structures and align doorways.
5. Place navigation boundaries, hazards and interactables.
6. Choose encounters using a threat budget and room suitability rules.
7. Allocate rewards and services across the region.
8. Add lighting, vegetation and decorative detail in permitted zones.
9. Validate the floor; repair it or regenerate when invalid.

Required validation includes reachable exit, safe arrival, usable door clearance, no rewards inside collision, no mandatory ability-gated route, and enough movement space for the chosen enemies. Hidden rooms are optional. A puzzle solution cannot require a randomly unavailable item.

Use separate seeded random streams for layout, loot, encounters and cosmetic effects. Adding a decorative sparkle must not change the next treasure drop. Save the generation version and instantiated state, not only a seed.

Anti-repetition rules limit consecutive identical room roles, recently used landmark rooms and repeated encounter combinations. These rules increase meaningful variety without making unsupported guarantees about infinite uniqueness.

## 7. Mobile controls and combat rhythm

The left thumb uses a floating movement joystick. The right thumb operates attack, dodge, weapon skill and relic ability. A smaller nearby control swaps two equipped weapons. Healing is accessed through a separate deliberate flask control, placed after touch testing. Interaction is contextual near the character, never behind the combat buttons.

Tap attack for an assisted strike in the intended direction. Hold to repeat normal attacks. Drag from attack to aim manually. Aim assistance prioritises facing direction and the current target; it should not jump between targets mid-combo. Skills use drag-to-aim and release-to-cast, with a clear cancellation zone.

Use one dependable dodge with a short recovery/recharge. Basic attacks have no stamina cost. Heavy attacks have a visible commitment window: dodge can cancel preparation or recovery where defined, but not every active impact frame. Show a short aiming guide for attacks whose reach is otherwise unclear.

Fairness requirements: visible windup before dangerous attacks, readable hitboxes, no silent offscreen projectiles, limited overlapping enemy attack commitments, and a brief protection window after damage to prevent instant repeated hits. Enemy attacks can remain threatening without every nearby enemy striking simultaneously.

Weapon swapping is fast but respects attack state. Swapping must not reset cooldowns, duplicate damage, skip recovery indefinitely or cleanse debuffs. Skills on both weapons retain their own cooldowns while unequipped.

## 8. Weapon generation and identity

A generated weapon is a compatible combination of family, moveset variant, visual construction, element, stat profile and special properties. It is not a random list of independent numbers.

| Family | Core feel | Example skill | Distinctive visual requirements |
|---|---|---|---|
| Daggers | Fast, short reach, frequent buildup | Crossing lunge | Paired small silhouettes and short slash ribbons |
| Sword | Mobile, balanced arcs and reliable combos | Travelling crescent | Clearly different blade shapes and readable swing arcs |
| Spear | Long, narrow attacks and spacing | Piercing rush | Long shaft, visible tip and linear impact streak |
| Hammer | Slow windup, stagger and broad impact | Ground fracture | Different heavy heads, compression pose and radial debris |
| Scythe | Broad sweeps and crowd positioning | Reaping orbit | Hooked silhouette and continuous curved sweep |
| Bow | Directed ranged shots and charge decisions | Splitting volley | Readable draw, projectile trails and impact types |
| Wand | Elemental patterns with lower physical impact | Pattern-specific burst | Distinct core ornaments and projectile shapes |
| Returning blade | Outbound and return positioning | Curved recall | Clearly traceable flight and recovery path |

Full-content target: eight families with two or three meaningful behaviour variants each. Start with sword, daggers and hammer. Visual components must share known grip anchors and animation compatibility. Some components change silhouette only; behaviour-changing components also need explicit gameplay data.

An enlarged inventory illustration can show detail unavailable on the world sprite, but must depict the same item. Stat-only rolls will sometimes look similar. Major mechanical variations must be visible in the silhouette, animation, trail or projectile pattern.

Example generation constraints: heavy heads cannot receive dagger swing animations; returning projectiles have a defined return path; attack-speed bonuses cannot collapse all windups to zero; projectile multiplication has explicit interaction rules. Speed, reach and damage are budgeted together so one ordinary roll does not dominate all others.

## 9. Equipment, inventory and passives

Equipment slots: two weapons, one chest piece, one pair of boots, two rings and one relic. Chest and boots alter the character sprite through compatible layers. Avoid adding many low-impact armour slots solely to increase drop quantity.

Chest pieces supply defence and one useful property. Boots affect movement or dodge behaviour. Rings introduce triggers and build connections. The relic supplies the additional active ability. Weapon skills belong to weapons.

The backpack initially holds 12 equipment items. Currency and crafting materials use counters rather than taking equipment slots. A full bag never silently destroys a find. Equip, replace, leave or salvage with clear feedback; swapping leaves displaced equipment in the bag if space exists or asks which item to leave.

Use six passive slots as an initial target. Early passive choices fill slots; later choices can upgrade a compatible passive or replace one. A passive choice screen pauses solo play and offers three options, usually including at least one relevant to the current build when the content pool supports it. Passives are run-only.

Avoid tiny marginal upgrades dominating loot. Trash drops can be converted at safe interaction points. Salvage previews its return and protects favourited items from bulk actions. Shops accept run gold; blacksmith work uses run materials. Permanent progression currency is visibly separate.

## 10. Rarity and meaningful loot

| Tier | Intended role |
|---|---|
| Common | Reliable family behaviour with a readable stat profile |
| Uncommon | Adds one useful property |
| Rare | Combines properties that can support a build |
| Epic | Strong synergy or a substantial behaviour variation |
| Mythic | A rare rule-changing property with suitable presentation |

Rarity is shown by label, border treatment and icon, not colour alone. Higher rarity does not guarantee a better choice for every build. A strong ordinary weapon can be worth upgrading.

Use bounded randomness: guarantee an early alternative weapon and a meaningful build modifier, distribute recovery opportunities across each region, and ensure that important reward choices are not all unusable for the current player. Never secretly guarantee every desired item. Record what has been offered to reduce repetitive choices within a run.

Full-content planning target: around 40 reusable affixes, 24 ring effects, 24 passives and 8 relic abilities. These are expansion goals, not a requirement for the first playable version. Prioritise interaction quality over combinatorial marketing numbers.

## 11. Wild combinations and event rules

Effects respond to explicit events such as direct hit, critical hit, status activation, dodge, shatter and kill. Every effect records its source, owner, target and whether it was caused by another triggered effect.

| Build | Components | Result |
|---|---|---|
| Plague Orchard | Poison daggers, spreading-poison ring, death-spore passive | Poisoned kills create spores that infect nearby enemies |
| Walking Avalanche | Frost hammer, shatter ring, frost dodge | Dodge builds frost; heavy impacts shatter frozen groups into shards |
| Storm Collector | Returning spear, lightning marks, pulling relic | Gather enemies and trigger chains on the returning strike |
| Unwise Fireworks | Explosive wand, projectile split, burning death bursts | A successful volley starts a room-clearing cascade |
| Borrowed Shadow | Echo-on-dodge ring, sword projectile property | A shadow repeats the next eligible basic attack |

Allow strong chains while explicitly preventing infinite self-triggering. An effect may trigger other approved effects, but cannot recursively re-trigger itself without a bounded rule. Aggregate redundant damage ticks and restrict repeated hits from a single attack. Visual particle limits must not arbitrarily erase already-earned damage.

Bosses should not gain hidden resistance merely because a player's build is powerful. Use visible, predictable status rules. If a combination breaks performance or produces literal infinite damage, fix the rule openly rather than secretly adjusting enemies against that player.

## 12. Status effects and readability

Each status has buildup, activation, active duration and recovery/decay states. The initial model uses a readable threshold meter. Buildup decays after a short period without further application. Exact thresholds and durations are tuning data, with enemy-specific resistance shown when relevant.

| Status | Building up | Active state | Mechanical purpose |
|---|---|---|---|
| Poison | Droplet meter and gathering green bubbles | Timed toxic pulses | Damage over time and spread interactions |
| Frost | Snowflake meter and ice around feet | Ice shell; distinct shatter burst | Slow, freeze and shatter opportunities |
| Burn | Ember meter and accumulating sparks | Controlled flames and regular pulses | Sustained damage and ignition interactions |
| Shock | Lightning meter and short crackles | Distinct discharge and visible links | Brief interruption and chain effects |

Boss frost fills a visible chill/stagger system instead of allowing permanent freezes. Repeated hard control has explicit resistance and recovery. Poison and burn cannot stack infinitely by refreshing themselves: define maximum stacks, refresh rules and damage ownership in item descriptions and the codex.

Show at most the most relevant few status icons over ordinary enemies; tapping a target or opening the codex exposes detail. Player statuses appear near health. Text and symbols support colour. Buildup and damage numbers use different presentation so “+12 poison” is never confused with 12 immediate damage.

Rendering priority: enemy telegraphs, player and enemy silhouettes, important projectiles, impacts, then decorative particles. Friendly effects must not obscure hostile ground markings. Include reduced flashes, reduced shake and a lower-effects mode.

## 13. Enemy generation

Build enemies from authored body families and attack kits, then apply compatible mutations and bounded stat profiles. A body family establishes silhouette and basic behaviour. A mutation adds visible equipment, growths, colour accents or a new announced mechanic.

Initial roles: pursuer, lunging skirmisher, ranged caster, armoured blocker, area controller and support unit. Room composition changes the tactical problem: a blocker shielding a caster feels different from two lunging enemies around a trap.

Examples: a root creature can carry thorn armour or release death spores; a sentinel can use spear lanes or hammer circles; a moth caster can leave frost trails or launch poison seeds. Do not freely attach every attack to every body. Special moves need matching animations and warning cues.

Ordinary enemies get zero or one mutation, elites up to two compatible mutations. Never stack movement suppression, unavoidable area coverage and immediate burst into a no-escape encounter. Enemy coordination limits concurrent committed attacks and preserves retreat space.

Plan for three or four body families per region in the full game, using careful encounter combinations to deepen variety. A new palette alone does not count as a new enemy family.

## 14. Bosses

Full-game target: two boss families per region with controlled loadout, elemental and arena variants. The initial slice needs one excellent boss. Each boss has three core moves, one distinctive interaction and a second-phase variation. Keep learned windup timings consistent across compatible variants.

Proposed first families: the Thorn Warden in the ruins, the Furnace Keeper in the conservatory, the Glass Choir in the depths and the Crown Beneath at the end. These are concepts, not final names.

The Thorn Warden uses a sweeping branch, a straight root charge and marked thorn eruptions. It exposes a vulnerable core after a missed charge. A frost mutation changes selected ground effects and appearance, while preserving readable timing. Arena obstacles cannot block every safe lane.

Boss entrances show a clear warning, allow equipment organisation and provide a modest recovery opportunity. Once committed, the arena closes. Health phases must not erase all player-earned statuses without explanation. Defeat produces a short celebration, loot choice and unlocked staircase; it should not bury the reward under a long unskippable sequence.

## 15. Exploration and discoveries

Secret entrances have observable clues: unusual airflow, repeated scratches, a cracked tile motif or displaced vegetation. Interacting with a clue can open the secret with baseline abilities. Elemental equipment may offer an additional convenient solution, but not the sole required one.

Shops sell a small selection: recovery, equipment and one unusual offer. The blacksmith upgrades one item or rerolls one selected eligible property at a clearly shown cost. Repeated upgrades cost more, helping a favourite weapon remain useful without making every drop irrelevant.

Cursed shrines show the complete bargain before acceptance. Examples: Glass Pact trades maximum health for damage; Hungry Steel grows through kills while weakening healing; Debt of Gold grants an item in return for a stated share of future gold. A curse has a readable persistent icon and description.

Puzzles should take roughly 15–45 seconds when understood: align mirrors, activate plates, guide a rolling orb or time a crossing. No repeated mandatory memory puzzles. Optional challenge rooms explain locking, rewards and failure conditions before entry.

Environmental interactions use consistent rules: oil burns, brittle cover breaks, water can briefly freeze where designed, traps affect eligible enemies. The same visual object should behave the same way across generated floors.

## 16. HUD and comparison design

Top left: portrait, health, shield and active negative effects. Top centre: region and floor; temporary objective text. Top right: compact explored map and pause. Bottom left: joystick. Bottom right: combat controls and two-weapon swap. Keep important threats away from areas permanently hidden by thumbs through camera framing and encounter layout.

The map shows explored connections, discovered exit, shops, left-behind loot and marked secrets. It does not expose every undiscovered room. Map enlargement pauses solo play.

Item comparison pauses solo play and offers equipped/found cards with large icons, short descriptions and relevant numerical differences. Show damage per hit, attack speed, reach or stagger where meaningful, status buildup, special behaviour and a current-build synergy message. “Damage 46” must not imply greater sustained damage than a much faster 18-damage weapon.

Provide Equip, Store and Leave actions. Rings first ask which occupied slot to replace, then update comparisons for that slot. Differences use arrows and words alongside colour. Details are expandable; core decisions fit without scrolling on the supported landscape viewport.

Prototype the real UI at phone size. The concept image's dense paper doll and backpack may need a separate tab if they reduce comparison readability. Target generous touch areas, safe-area margins, adjustable control positions and a left-handed arrangement.

## 17. Death, hub and permanent progression

Death ends the run. A compact recap shows floor reached, cause of death, important build items, earned progression currency and new unlocks. No pay-to-revive mechanic is planned. Restart should require very few actions.

Run gold, materials, weapons, armour, rings, relics and passives reset. Earned permanent currency, discoveries, best records, cosmetics and upgrade purchases persist. Permanent currency is awarded at explicit milestones and recorded immediately, not only when the death screen is reached.

The hub is a small garden above the descent with a starting-weapon rack, upgrade altar, codex and training target. Keep preparation brief. Unlock starter families through play; choose one basic starter weapon rather than a complete powerful build.

Permanent upgrades include a bounded health increase, modest flask improvements, additional starter options and limited reward rerolls. Cap numerical advantages so eventual success does not depend on endlessly grinding stats. Offer free hub respecs for upgrade allocation. New-content unlocks and play knowledge remain important after numerical caps.

## 18. Saving, menus and session interruptions

Menus: Continue, New Run, Upgrades, Collection, Settings and Credits. Starting a new run while one is active asks whether to abandon it. Continue opens the latest valid saved state. Include clear loading, retry and missing-asset states.

Save inventory instances, generated floor state, opened chests, defeated enemies, progression, health, cooldowns, active effects and random generator state. Use versioned recoverable saves and bounded periodic snapshots. Save at item transactions, floor transitions, rewards and pause. Prevent duplicated rewards when restoring after interruption.

Losing focus immediately pauses solo simulation and releases held inputs. Resume with a short ready state so the player is not hit before regaining control. Audio resumes only when browser interaction allows it. A killed browser may restore the last committed snapshot; do not promise perfect recovery from every abrupt device shutdown.

Local saves are the first-version assumption. Clearing browser data may remove them. Provide an export/import backup option; cloud saves and cross-device continuation require a separate service decision. Offline play should only be advertised after explicitly implemented and tested.

## 19. Art, animation and sound production

Choose one coherent pixel-art source or production pipeline before bulk content. Audit licensing, sprite dimensions, animation directions, tiles, UI and equipment attachment points. No specific commercial pack has been selected or verified in this plan.

Create an asset manifest covering player, armour overlays, weapons, enemies, bosses, room tiles, props, status icons, particles and audio. Build one finished room and combat encounter before producing every region. Procedural visual variety depends on creating compatible components; it does not remove the art workload.

Animation coverage: idle, movement, light/heavy attack anticipation and recovery, dodge, cast, hurt, death, enemy windups, enemy impacts, chest opening, shrine use, item pickup and floor transition. Use four readable facing directions initially with matching equipment layers; expand only if the animation budget supports it.

Sound layers distinguish movement, weapon swing, impact, status activation, enemy warning, loot, UI and ambience. Heavy weapons use lower impact weight and a stronger response; daggers use lighter, rapid transients. Reserve pronounced hit-stop for big impacts and shatters. Avoid stopping play for every damage-over-time tick.

## 20. Browser implementation boundaries

Choose and verify the browser framework and versions at implementation kickoff. The game needs sprite animation, tilemaps, cameras, multi-touch input, audio, particle pooling and a maintainable data-driven architecture. This design does not require a runtime generative-AI service or API keys.

Separate input, simulation, generation, combat, inventory, persistence, UI and presentation. Visual particles respond to combat events rather than deciding damage. Items and enemies use stable data identifiers. Render at a controlled pixel-art scale and adapt decorative effect density to measured device performance.

Performance target: responsive 60 frames per second on the selected reference phones, with a deliberate lower-effects option. This is a target requiring active-play measurement. Test worst-case chain reactions, several hazards, damage numbers and inventory transitions; an empty room is insufficient evidence.

Load region assets deliberately, pool frequent objects, cap redundant decorative effects and limit concurrent sounds. Never sacrifice a required enemy warning for a particle budget. Handle touch cancellation, changing browser chrome, orientation changes and context loss. Portrait displays a friendly rotate prompt; do not claim full portrait play support.

## 21. Future co-op boundaries

Keep actor ownership, item identity and input actions separate from local presentation so a future co-op design has sensible foundations. This is not equivalent to having multiplayer ready.

Before implementing co-op, decide authority, hosting, loot ownership, pausing, revival, scaling, reconnects and save ownership. Solo inventory pause will need a different multiplayer rule. Two-player arenas and simultaneous spell effects require additional readability and performance work. Do not delay the solo slice to build speculative networking infrastructure.

## 22. Production milestones

| Milestone | Deliverable | Review gate |
|---|---|---|
| 1. Visual and control proof | Finished small garden room, animated player, sword and hammer, one enemy, touch controls | Both weapons feel distinct and the phone view is readable |
| 2. Complete floor | Seeded routes, exit, loot comparison, death and restart | Explore, swap an item, find exit, fail and restart with ordinary input |
| 3. Three-floor region | Three weapon families, three enemy families, poison/frost, one boss, shop, shrine and secret | Complete a varied region and demonstrate a meaningful synergy |
| 4. Persistence and progression | Hub, permanent upgrades, suspend/resume, recap and passive choices | Interrupted sessions recover coherently without reward duplication |
| 5. Full descent | Four regions and twelve floors; staged weapon/enemy expansion | Full run has varied pacing and a satisfying final encounter |
| 6. Second polish pass | Animation, audio, VFX, accessibility, mobile performance and UI refinements | Review active gameplay and fix the most visible weaknesses |

Review after the first playable slice and again after the main polish pass. Do not describe milestones as complete until observed in a running game. Preserve functioning systems when adding content.

## 23. Verification and acceptance

Generation checks should sample many seeds for connectivity, valid placement, objective access and enemy-room compatibility, then manually inspect representative outputs. Save failing seeds as regression cases. Statistical variety counts cannot replace playtesting whether the floors feel different.

Combat checks cover fast and slow weapons, buffered input, swapping, cooldown preservation, status buildup/decay, boss control resistance, simultaneous triggers and death during an effect chain. Test a deliberately powerful build to expose recursion and performance problems.

Touch checks cover simultaneous movement and attack, finger leaving a button, browser losing focus, notches, smallest supported viewport and both control handedness layouts. Test on actual target phones before claiming device compatibility.

Inventory checks include two rings, full bag, swapping while full, dropping and recollecting items, shop purchases, salvage protection and comparison of different weapon families. Save checks include interrupted transitions, old versions, invalid data and reopening the browser.

Visual review captures exploration, ordinary combat, the busiest supported effect combination, a boss warning, equipment comparison and death/restart. Pass only when threats remain readable and actions have visible and audible feedback.

## 24. Approved visual references

### Reference A — Early exploration and combat

![Approved early-region reference: Verdant Ruins, with warm sunlight, mossy architecture, turquoise water, poison attacks and mobile controls.](references/01_Verdant_Ruins.png)

Preserve the inviting atmosphere, planted stone architecture, clear floor space, teal-scarfed adventurer, jewel-like water, visible equipment and compact dark HUD with warm metal edging. Translate its environmental richness into reusable tiles and composed room modules. The opening game should visibly belong to this image's art direction.

### Reference B — Later region and build spectacle

![Approved later-region reference: The Glass Depths, with crystal architecture, a frost hammer, shattering enemies and separate enemy attack warnings.](references/02_Glass_Depths_Combat.png)

Preserve the cold teal and violet environment, warm lamps, dark negative space and bright cyan frost impacts. The important combat relationship is a visible heavy strike leading to frozen enemies shattering and spreading effects. Keep the amber enemy attack lane and green poison hazard distinguishable beneath the spectacle. Use the same gameplay projection and control positions as the early region when implementing both.

### Reference C — Equipment decisions

![Approved equipment reference: paper doll, contrasting weapon silhouettes, equipped-versus-found cards, stat tradeoffs, synergy explanation and large action buttons.](references/03_Equipment_Comparison.png)

Preserve the large side-by-side weapon illustrations, equipped/found labels, concise stat rows, obvious tradeoffs, character equipment preview and simple Equip/Store/Leave actions. The synergy sentence is a core requirement. Actual item text should label damage per hit and status buildup explicitly. The image's backpack contents and extra HUD ornaments are illustrative; do not add resource systems solely because their icons appear here.

The early garden concept establishes mossy stone, teal water, warm light and a small readable adventurer. The crystal-dungeon concept establishes the deeper mood and frost-shatter spectacle. The equipment concept establishes side-by-side choices, recognisable weapon silhouettes and plain-language synergy explanations.

Treat these images as art direction. Their projection, pixel density, HUD positioning and text must be standardised in the real game. In particular, keep one camera angle across every region, use identical control placement throughout, reduce excessive environmental detail around threats and make actual comparison text readable at phone size. Region labels in concept art are illustrative, not authoritative additional regions.

The first implementation goal is one beautiful, responsive three-floor region in which exploration produces a surprising build and a readable boss tests it. Expand only after that complete loop is enjoyable.
