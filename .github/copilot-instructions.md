# Copilot Instructions for Boxing Timer

## Project Overview
Boxing Timer is a React-based web application for interval training. It provides a configurable timer for boxing rounds with adjustable durations, break times, and warning signals.

**Tech Stack**: React 18, Create React App (CRA), Testing Library, pnpm

## Architecture & Key Concepts

### Application Structure
- **Single Page Application**: Entry point is `src/index.js` → `src/App.js`
- **React 18 with Strict Mode**: For development error detection
- **Create React App**: Use `react-scripts` for builds/tests; no manual webpack config
- **Styling**: CSS modules in separate `.css` files (e.g., `App.css`, `index.css`)

### Core Features (from REQUIREMENTS.md)
1. **Timer Display**: Shows current round (1/x) and time left before end (MM:SS)
2. **Playback Controls**: Pause/Play and Reset buttons
3. **Settings Panel**: Configure:
   - Number of rounds
   - Round duration (seconds)
   - Break duration (seconds)
   - Warning signal timing (seconds before round ends)
  - Warning signal timing (seconds before break ends)
3. when user configures timer, after hitting start, add a "warm up" count down of 5 seconds. not configurable

4. **Audio Alerts**: Warning sounds at configured intervals
5. **Responsive Design**: Mobile-first approach required

## Developer Workflows

### Running the Application
```bash
npm start          # Dev server at http://localhost:3000 with hot reload
npm test           # Jest tests in interactive watch mode
npm run build      # Production build → `build/` folder
```

### Testing
- Framework: React Testing Library (not Enzyme)
- Config: `setupTests.js` includes jest-dom matchers
- Test file pattern: `*.test.js` (e.g., `App.test.js`)
- Always test user interactions, not implementation details

## Code Patterns & Conventions

### React Patterns
- **Functional Components**: No class components; use hooks for state/effects
- **CSS Modules**: Import CSS directly (`import './App.css'`); BEM naming if needed
- **Analytics Integration**: `vitals.js` exports `sendToVercelAnalytics` for web vitals tracking

### State Management (if component complexity grows)
- **Keep state local** unless shared across multiple components
- Use `useState` for simple state, `useReducer` for complex timer logic
- Consider lifting state to `App.js` for round/break timing synchronization

### File Organization
```
src/
├── App.js               # Main component with timer logic
├── App.css              # App styles
├── App.test.js          # App tests
├── index.js             # React root entry
├── index.css            # Global styles
├── vitals.js            # Vercel web vitals
└── setupTests.js        # Test configuration
```

### Component Structure (Expected Pattern)
The app should be organized with:
- **App.js**: Container managing timer state, settings, and phase transitions
- **Timer Display**: Shows `round X/Y` and elapsed time in MM:SS format
- **Settings Panel**: Form inputs for `numRounds`, `roundDuration`, `breakDuration`, `warningSignal`
- **Playback Controls**: Pause/Play and Reset buttons with appropriate disabled states
- **Audio Handler**: Encapsulates Web Audio or `<audio>` element logic for warning sounds

## Key Implementation Details

### Timer Logic: State Machine Pattern
The timer follows this state flow:
```
[IDLE] → [RUNNING_ROUND] → [RUNNING_BREAK] → [RUNNING_ROUND] → ... → [COMPLETED]
                  ↓                 ↓
            [PAUSED_ROUND]   [PAUSED_BREAK]
                  ↓                 ↓
              (same phase on resume)
```

**Implementation Strategy:**
- Store `{phase, currentRound, elapsedSeconds, isPaused, settings}`
- Use `setInterval` with 100ms tick for smooth display
- On each tick: increment `elapsedSeconds`, check if phase should transition, check if warning sound should trigger
- Warning sound triggers when `elapsedSeconds === (phaseDuration - warningSignal)`
- Reset clears everything and returns to idle state
- **Example**: 120s round, 10s warning → sound at 110s elapsed

### Validation Requirements
- Rounds: 1-99 (minimum 1, practical max 99)
- Round duration: 5-3600s (5s minimum, 1 hour max)
- Break duration: 0-300s (0 = no break)
- Warning signal: 0 to phaseDuration - 1 (can't warn for full phase)

### Audio Implementation Pattern
- Use Web Audio API or HTML5 `<audio>` elements
- Place audio files in `public/` folder
- Reference as `process.env.PUBLIC_URL + '/audio-file.mp3'`

**Example Pattern:**
```javascript
// In App.js
const playWarningSound = () => {
  const audio = new Audio(process.env.PUBLIC_URL + '/warning.mp3');
  audio.play().catch(err => console.warn('Audio play failed:', err));
};

// Call in useEffect when warning condition is met
useEffect(() => {
  if (shouldPlayWarning) {
    playWarningSound();
  }
}, [shouldPlayWarning]);
```

### Responsive Mobile-First CSS
- Start with mobile viewport in base styles
- Use `@media (min-width: X)` for larger screens
- Ensure touch-friendly button sizes (≥48px)

**Example Pattern:**
```css
/* Base mobile styles */
.timer-display {
  font-size: 2rem;
  padding: 1rem;
  text-align: center;
}

.control-button {
  min-height: 48px;
  min-width: 48px;
  margin: 0.5rem;
}

/* Desktop enhancement */
@media (min-width: 768px) {
  .timer-display {
    font-size: 3rem;
  }

  .settings-panel {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
}
```

## Dependencies & Build Notes

### Key Dependencies
- `react`, `react-dom`: Core framework
- `react-scripts`: CRA build tooling (do not eject unless essential)
- `@testing-library/react`: User-centric testing

### Build Artifacts
- Development: Hot module reloading enabled via `react-scripts`
- Production: Minified, hashed filenames in `build/` folder
- Don't manually edit build output; regenerate with `npm run build`

## Common Patterns to Avoid

- ❌ Direct DOM manipulation (use React state/JSX instead)
- ❌ Class components (use functional components + hooks)
- ❌ Eject from CRA (use env variables or code splitting instead)
- ❌ Hardcoded paths (use `process.env.PUBLIC_URL` for assets)
- ❌ Testing implementation details (test user behavior)

## Git & Deployment Notes

### Vercel Deployment
- **Framework**: Create React App (auto-detected by Vercel)
- **Build Command**: `npm run build` (default in CRA)
- **Output Directory**: `build/` (default in CRA)
- **Environment**: `vitals.js` sends Web Vitals to Vercel Analytics automatically
- **Deployment**: Push to `main` branch for automatic deployment
- **Preview**: PR branches auto-generate preview URLs

### Package Management
- Package manager: **pnpm** (see `pnpm-lock.yaml`)
- Branch: `main` is production-ready
- Use `npm run build` before deployment; output is static HTML/JS/CSS
