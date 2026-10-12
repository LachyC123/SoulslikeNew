# Pixel Dungeon (working title)

A landscape, touch-first browser action RPG: descend through pixel-art ruins, find the stairs, and build outrageous equipment combinations. The design plan is in [`docs/PIXEL_DUNGEON_GAME_PLAN.md`](docs/PIXEL_DUNGEON_GAME_PLAN.md). The original zip, which includes the approved reference images, is `Pixel_Dungeon_Game_Plan.zip`.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173 (also exposed on your LAN for phone testing)
npm test          # generation + combat rule tests
npm run build     # type-check + production build into dist/
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
| Interact (hold on stairs) | E | Prompt that appears next to your hero |
| Equipment / map / pause | I / M / Esc | Bag / minimap / ❚❚ |

## What's in this first slice

This covers milestones 1–2 of the plan, plus much of milestone 3.

- **Verdant Ruins, floors 1–3.** Seeded procedural floors. The generator builds a room graph first: a critical path, branches, a loop, and assigned room purposes (arrival, combat, discovery, guarded, recovery, exit, boss). It then validates each floor (reachable exit and rewards, a safe arrival, room count) and regenerates it if a check fails. Layout, loot, encounter and cosmetic randomness each use a separate seeded stream.
- **Combat.** Three weapon families with authored combos: sword (balanced), daggers (fast) and hammer (slow, staggering). Each has a skill: Travelling Crescent, Crossing Lunge or Ground Fracture.
  - Buffered combos and aim assist that stays on the current target.
  - Dodge can cancel windup and recovery, but not the active hit frames.
  - Hit-stop and screen shake on heavy impacts.
- **Enemies.** Rootling (pursuer and slam), Lantern Moth (ranged poison caster) and Thornling (lunging skirmisher), plus elites with mutations (spore burst or frenzied).
  - Every attack has an amber ground telegraph, and ranged shots show an aim line first.
  - An attack-token system stops every enemy from committing at once.
  - You get a protection window after taking a hit.
- **Boss: the Thorn Warden.** It has three moves: sweep, root charge and thorn eruptions. A missed charge into a wall exposes its core. Phase 2 starts at 50% health. The arena seals when you enter, and frost chills the boss instead of freezing it. After the fight you pick one of three rewards.
- **Statuses and synergies.** Poison and frost use buildup meters that decay. Poison refreshes rather than stacks. Frost freezes and builds resistance against repeated freezes, and hammers (or Shatterer weapons) shatter frozen foes.
  - Rings act on explicit events (shatter, kill, dodge). Each effect records its source chain, and chains are capped so they can't loop forever.
  - Rings: Frost Nova, Spore Bloom, Borrowed Shadow echo, Frost Step and others.
- **Loot.** Generated weapons, rings, chests and boots with five rarities. Rarity is shown by label and gems, not colour alone.
  - The comparison screen (Equipped vs Found → Equip / Store / Leave) shows damage per hit, attacks per second, sustained damage, buildup per hit, a plain-language tradeoff line and the synergy sentence.
  - The backpack holds 12 items; favouriting protects an item from salvage.
  - Each run guarantees an early alternative weapon and a ring that connects to something you own.
- **Persistence.** Versioned local saves of the run, floor state (opened chests, kills, items left on the ground) and loot RNG state. The game saves on item transactions, chests, floors, pause and focus loss. Continue restores the floor without duplicating rewards.
  - Embers are a permanent currency recorded at milestones. They buy upgrades (vigor, flask) with free respec.
  - Starter weapons unlock through play.
  - Backups can be exported and imported.
- **Accessibility and device handling.** Reduced shake, reduced flashes, a lower-effects mode, left-handed controls and a touch on/off/auto setting. The game pauses on blur, the rotate prompt appears in portrait, and first-run hints disappear once you've done what they ask.

## Not done yet (deviations from the plan)

- Regions 2–4, relics, passives, shops, the blacksmith, cursed shrines, secrets and puzzles.
- The first run uses hints on a normal procedural floor rather than a hand-built teaching route.
- No real-device phone testing yet. Layouts were checked in headless Chromium at 1280×720 and 844×390@3×.
