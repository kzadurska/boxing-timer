# Boxing Timer

A training timer app for boxers (and similar interval training). Counts time in configurable intervals of rounds, sets, and breaks.

## Concepts

- **Round**: A single fight interval (timed countdown)
- **Set**: A group of 1 or more consecutive rounds followed by a single break
- **Break**: A rest period that occurs after all rounds in a set are completed

### Timer Flow

```
warmup -> [round, round, ..., break] -> [round, round, ..., break] -> ... -> [round, round, ...] -> done
           \_____ set 1 _____/           \_____ set 2 _____/                  \__ last set (no break) __/
```

- The last set has no break at the end
- Rounds within a set play back-to-back (no break between them)

## Main View

- Current set and round indicator: `Set 1/3 · Round 2/4`
- Countdown timer: `00:20`
- Current phase label: Warm-up / Fight / Break
- Info card showing configured: Sets, Rounds, Fight duration, Rest duration
- Controls: Start, Pause/Resume, Reset, Settings

## Settings

| Setting                        | Description                                     | Example |
| ------------------------------ | ----------------------------------------------- | ------- |
| Number of Sets                 | How many sets (groups of rounds + break)         | 3       |
| Rounds per Set                 | How many fight rounds before a break             | 4       |
| Round Duration (sec)           | Length of each fight round                       | 120     |
| Break Duration (sec)           | Length of break between sets                     | 30      |
| Warning Before Round Ends (sec)| Warning signal N seconds before a round ends     | 10      |
| Warning Before Break Ends (sec)| Warning signal N seconds before a break ends     | 10      |

- Settings are persisted to localStorage across sessions
- Old `numRounds` setting is automatically migrated to `numSets`
- Warning signals must be less than their respective durations (validated in UI)

## Audio

- **Box sound** (`box.mp3`): Plays on phase transitions (fight start, break start) and on round transitions within a set (fight -> fight)
- **Bell sound** (`single-bell.mp3`): Plays as a warning signal before a round or break ends
- Uses Web Audio API for reliable playback on mobile and PWA
- AudioContext is created and unlocked on first user tap (Start/Resume)
- AudioContext is re-resumed on every user interaction and on `visibilitychange` to handle iOS PWA suspension

## PWA

- Installable as PWA (manifest.json with standalone display mode)
- Service worker with cache-first strategy
- Both MP3 audio files are pre-cached for offline use
- Apple-specific PWA meta tags for iOS home screen support

## Screen Wake Lock

- Screen Wake Lock API keeps the screen on while the timer is running
- Acquired on Start and Resume, released on Pause, Reset, and timer completion
- Re-acquired on `visibilitychange` when the app returns from background (browsers release the lock when the page is hidden)
- Feature-detected; silently degrades on unsupported browsers

## Technical Details

- React (Create React App)
- Mobile-first responsive design (RWD)
- Single component (`App.js`) with all timer logic
- Shake animation on warning signals
- 5-second warmup phase before the first round
