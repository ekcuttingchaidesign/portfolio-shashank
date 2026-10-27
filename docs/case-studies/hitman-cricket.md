# Hitman Cricket — case study draft

Source for `/work/hitman-cricket`. Numbers come from the GoatCounter export
(16 Sep – 27 Oct 2026). GoatCounter counts an event at most once per player
per day, so figures are **player-days** unless marked exact. Lines marked
**[confirm]** are my guesses about your reasoning; fix or delete them.

## The card

| Year | Role | Chapters | Read |
| --- | --- | --- | --- |
| 2026 | Solo — design, build, ship | 7 | ~12 min |

## Chapters

1. **An experiment that wouldn't stop.** A test of ChatGPT Astra on 7 Sep;
   the base was good enough to keep, so I carried on with Claude. 765 commits
   in seven weeks. 479 players, a third of play-days from players on their
   11th day or later, 95% on phones.
2. **Identity without accounts.** Drafted in full below.
3. **Playing your friends when you're not online together (Rivals).** 141
   rooms, 83 joins, 89% of matches played apart, 56 rematches.
4. **The Dressing Room: a reason to keep playing.** Players were just
   playing. Kit unlocked at milestones gave them something to play *for*.
5. **One card for every ending.** Five modes, one end card; a rank is never
   shown until the server says it. "Reach the screen the way a player does."
6. **Teach once, ask late.** Coachmarks that never repeat; a rating asked on
   the second innings, never the first, never twice a visit (4.7 from 20).
7. **What the numbers said, and what's next.** Retention, the Super10 demand
   test (8 of 18 pressed I'M EXCITED), sharing as the thing that hasn't
   worked yet, and the Marathon.

### Evidence for chapter 4 (Dressing Room, launched 13 Oct)

- 93 items unlocked or claimed, across 27 different kits, bats and guards;
  132 times a player changed what they wore.
- The week before vs the week after launch: sessions past 20 minutes went
  from 19 to 47, and next-day returns from 15% to 21% of player-days, while
  total visits fell (479 → 350 player-days).
- Caveat to say out loud: new players also fell that week (167 → 56), so the
  audience was more of a returning core, and returning players play longer
  anyway. Claim "sessions got longer after it shipped", not "it caused it".
- The Boom bat is deliberately not free: it waits with a dot until the player
  presses UNLOCK, which teaches the interaction. 13 players claimed it.

---

## Chapter 2 — Identity without accounts

### Context

Hitman Cricket is a two-minute batting game in a phone browser. No install,
no sign-up: you open a link and you're batting.

### Problem

Without accounts, a player's career — runs, rank, unlocked kit — lives in the
browser. Lose the browser's memory and you lose the career, and worse, the
game quietly mints a second player under the same name.

That isn't an edge case here. **95% of players are on phones and 68% on
iPhones**, and Safari deletes everything a page's script stored after a week
away. For two players in three, a week off meant starting again.

### Constraints

- No sign-up wall. Anything asked before the first ball costs players.
- Mobile web only: no app storage, no push.
- Private windows can't be detected reliably, and forget everything on close.
- People forward links, so nothing in a link may wipe anything on sight.

### Options I didn't take

- **Required sign-up** (email or phone). **[confirm]** Rejected: a form
  before a two-minute game loses the players it's meant to keep.
- **Social login.** **[confirm]** Rejected: heavy for a game, and broken
  inside the Instagram and WhatsApp browsers many players arrive from.
- **Device storage only.** That was the starting point, and Safari is why it
  wasn't enough.

### Version 1: make the browser hard to lose, and give players a key

- **Identity kept in three places at once** — localStorage, a long-lived
  cookie and IndexedDB — restored from whichever survives. When copies
  disagree, the oldest wins.
- **A fourth copy Safari can't wipe:** the "return ticket", a cookie set by
  the server rather than the page, which Safari keeps for a year. When the
  other three come back empty, it puts the player back before the first ball.
  **8 players were brought back this way without doing anything.**
- **A career key** for when even that fails: three words and two digits,
  drawn as a ticket stub, saveable as an image, to WhatsApp, or copied.
  "Bring your record back" is a bottom sheet.
- **Names that can't be stolen:** a name and the same name with a number on
  the end belong to one person for a day after it's claimed. A player can
  rename once every 30 days, and going back to an old name is free.
- **`?fresh=1` asks before it clears anything**, because a link is something
  people send each other, and one that wiped a career on sight would be a
  prank with a cost.

**What happened:** 107 players claimed a name (89% of those who started).
But of 85 career keys issued, only **31 were saved**. About two in three players
with a name had no way back if their browser forgot them.

### Version 2: a password players already know how to keep

A key is something you have to save. A password is something people already
know how to keep, and their phone offers to remember it. So on 16 Oct I
added **Create a password** — and spent most of the design on *when* to ask.

- **Never before the first ball.** The name screen asks for a name, a kit
  and a batting hand, nothing more.
- **On My Stats from day one**, as a card on the career page.
- **On the end-of-innings card once a career passes 50 runs**, in solid
  orange so it can't be mistaken for PLAY AGAIN. By then the player has
  something worth protecting.
- **A nudge sheet after three end cards walked past**, then every five,
  never twice in a visit, and never in the way of batting.
- A hidden username field so Safari and Chrome offer to save it; an
  optional security question; restore lists names that have a password, so
  a player finds themselves by name, not by an id.

### Outcome (first 10 days)

- **11 passwords created; 10 of them from the end-of-innings card.**
- The nudge sheet was shown on 28 player-days and put off with "Later" on
  24. It produced 2 passwords.
- **5 careers restored by password in 10 days**, against 9 by career key in
  the 35 days before.

The ask in context worked; the interruption mostly didn't. Small numbers,
but they point the same way.

### Reflection

- **[confirm]** Next: drop the nudge sheet's frequency, or fold it into the
  end card entirely, since that's where passwords actually get made.
- **[confirm]** I'd have offered the password from day one instead of the
  key — the key solved my problem (a recoverable id) before it solved the
  player's (not having to save something).
- The return ticket is the part nobody sees, and it's the part that saved
  the most careers without asking anyone for anything.
