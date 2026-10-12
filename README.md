# Pixel Dungeon (working title)

A landscape, touch-first browser action RPG: descend through pixel-art ruins, find the stairs, and build outrageous equipment combinations. The design plan is in [`docs/PIXEL_DUNGEON_GAME_PLAN.md`](docs/PIXEL_DUNGEON_GAME_PLAN.md). The original zip, which includes the approved reference images, is `Pixel_Dungeon_Game_Plan.zip`.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173 (also exposed on your LAN for phone testing)
npm test          # generation + combat rule tests
npm run build     # type-check + production build into dist/
npm run build:single  # also writes dist/pixel-dungeon.html: one self-contained file for hosting
```

It's TypeScript, Vite and Canvas 2D, with no runtime dependencies. All art is pixel art drawn procedurally in code and all audio is synthesised with WebAudio, so the game needs no asset files.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | WASD / arrows | Floating stick (left half) |
| Attack (hold to repeat) | J / left-click (aims at cursor) | ⚔: tap = assisted aim, drag = manual aim |
| Dodge (i-frames) | Space / K | ➶ |
| Weapon skill | L / right-click | Drag to aim, release to cast, drop on ✕ to cancel |
| Swap weapons | Q | ⇄ |
| Flask | F | Red flask |
| Relic ability | R | Relic button above the flask |
| Interact (hold on stairs) | E | Prompt that appears next to your hero |
| Equipment / map / pause | I / M / Esc | Bag / minimap / ❚❚ |

## What's in the game

- **Verdant Ruins, floors 1–3**, each a seeded procedural floor (room graph → validation → regenerate if invalid), with merchant and cursed-shrine rooms. Floors 2+ can roll a **floor condition** (Blood Moon, Volatile Air, The Brood, Warded Halls…).
- **9 weapon families × 3 movesets**: sword, daggers, hammer, spear, scythe, axe, bow, wand and returning blade, each with its own skill (crescent, lunge, fracture, rush, reaping orbit, leap, volley, pattern burst, recall).
- **Near-endless item variety.** Properties are composed from stats, conditional bonuses and *trigger × effect × element* procs (13 triggers × 15 effects × 5 elements, with rolled magnitudes), plus mythic rule-breakers (twin strikes, phoenix, contagion, stormborn…). Weapons can be dual-element.
  - A novelty memory, kept across runs, steers generation away from what you've seen recently.
  - Weapon art is procedurally built from materials and parts, so the inventory illustration matches the in-hand sprite.
  - A name generator covers common names, epithets and named mythics.
- **Relic slot** with 12 active abilities (blink, nova, starfall, vortex, spirits, bulwark, stillness, tempest, sentry, quake, warcry, mirror).
- **Boons**: run-only passives. You choose one of three on every staircase, and can also buy them from merchants or take a cursed pact at a shrine (each pact states its price).
- **Harder combat.**
  - 7 enemy families: rootling, moth, thornling, moss sentinel (front shield), spore bulb (mortars), cinder wisp (healer), shellback (charger).
  - 12 stacking mutations, from armoured and swift to vampiric, splitting, volatile, warded and hulking.
  - More foes per room, steeper floor scaling, and a 1,500 HP Thorn Warden that summons in phase 2.
- **Four statuses**: poison (ticks), frost (freeze; heavy hits and crits shatter frozen foes), burn (fast ticks) and shock (interrupts, conducts damage to neighbours). Effects chain through each other with a depth guard.
- **FX**: filled swing ribbons, pixel-disintegration deaths, lightning arcs, element-coloured novas and explosions, dynamic lights, rarity loot beams with mythic fanfare, combo counter and multi-kill callouts, hit squash, low-health heartbeat, falling leaves and butterflies.
- **Comparison screen**: damage per hit, attacks per second, sustained damage, buildup per hit, a plain-language tradeoff line and a synergy explanation.
- **Persistence**: versioned local saves that never duplicate rewards. Embers buy permanent upgrades, and starter weapons unlock when you descend while wielding them.

## Not done yet (deviations from the plan)

- Regions 2–4, relics, passives, shops, the blacksmith, cursed shrines, secrets and puzzles.
- The first run uses hints on a normal procedural floor rather than a hand-built teaching route.
- No real-device phone testing yet. Layouts were checked in headless Chromium at 1280×720 and 844×390@3×.
