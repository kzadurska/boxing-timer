import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const SETTINGS_KEY = 'boxing-timer-settings';

const DEFAULT_SETTINGS = {
  numSets: 10,
  roundsPerSet: 1,
  roundDuration: 60,
  breakDuration: 10,
  warningSignalRound: 10,
  warningSignalBreak: 3,
};

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrate old numRounds key to numSets
      if ('numRounds' in parsed && !('numSets' in parsed)) {
        parsed.numSets = parsed.numRounds;
      }
      delete parsed.numRounds;
      // Merge with defaults to handle any missing keys from future updates
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (err) {
    // Corrupted data or storage unavailable -- fall back to defaults
  }
  return DEFAULT_SETTINGS;
}

function App() {
  // Settings state - loaded from localStorage
  const [settings, setSettings] = useState(loadSettings);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      // Storage full or unavailable -- ignore
    }
  }, [settings]);

  const [showSettings, setShowSettings] = useState(false);

  // Timer state
  const [phase, setPhase] = useState('warmup'); // 'warmup', 'fight', 'break'
  const [currentSet, setCurrentSet] = useState(1);
  const [currentRound, setCurrentRound] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [shouldShake, setShouldShake] = useState(false);

  // Ref to track current values for the interval
  const phaseRef = useRef('warmup');
  const currentSetRef = useRef(1);
  const currentRoundRef = useRef(1);
  const lastRoundRef = useRef(1);
  const hasShaken = useRef(false);
  const lastPhaseRef = useRef('warmup');

  // Screen Wake Lock ref
  const wakeLockRef = useRef(null);

  // Audio refs - Web Audio API for reliable mobile playback
  const audioContextRef = useRef(null);
  const boxBufferRef = useRef(null);
  const bellBufferRef = useRef(null);
  const audioUnlockedRef = useRef(false);

  // Fetch and decode an audio file into an AudioBuffer
  const loadAudioBuffer = async (url) => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return audioContextRef.current.decodeAudioData(arrayBuffer);
  };

  // Play an AudioBuffer using Web Audio API
  const playSound = (buffer) => {
    if (!audioContextRef.current || !buffer) return;
    // Resume context if it was suspended (mobile requirement)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.start(0);
  };

  // Ensure AudioContext is created and resumed - call from every user tap handler.
  // iOS standalone PWA suspends the context aggressively (background, screen lock, etc.)
  // so we must re-resume it on every user gesture, not just the first.
  const ensureAudioContext = async () => {
    // First time: create the context + load buffers
    if (!audioUnlockedRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioCtx();

      // Play a silent buffer to fully unlock audio on iOS
      const silentBuffer = audioContextRef.current.createBuffer(1, 1, 22050);
      const silentSource = audioContextRef.current.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.connect(audioContextRef.current.destination);
      silentSource.start(0);

      // Load the actual sound files
      try {
        const [boxBuffer, bellBuffer] = await Promise.all([
          loadAudioBuffer('/box.mp3'),
          loadAudioBuffer('/single-bell.mp3'),
        ]);
        boxBufferRef.current = boxBuffer;
        bellBufferRef.current = bellBuffer;
      } catch (err) {
        console.error('Failed to load audio buffers:', err);
      }

      audioUnlockedRef.current = true;
    }

    // Always resume on user gesture -- handles iOS PWA suspending the context
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  // Screen Wake Lock - prevent screen from going dark while timer is running
  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch (err) {
      console.log('Wake Lock request failed:', err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        // Already released
      }
      wakeLockRef.current = null;
    }
  };

  // Re-resume AudioContext and re-acquire wake lock when PWA returns from background.
  // Browsers automatically release the wake lock when the page becomes hidden,
  // so we must re-acquire it when the page becomes visible again.
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (audioContextRef.current) {
          audioContextRef.current.resume().catch(() => {});
        }
        // Re-acquire wake lock if timer is still running
        if (!isPausedRef.current) {
          requestWakeLock();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      releaseWakeLock();
    };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    currentSetRef.current = currentSet;
  }, [currentSet]);

  useEffect(() => {
    currentRoundRef.current = currentRound;
  }, [currentRound]);  // Calculate duration based on phase
  const getPhaseDuration = () => {
    if (phase === 'warmup') return 5;
    if (phase === 'fight') return settings.roundDuration;
    if (phase === 'break') return settings.breakDuration;
    return 0;
  };

  const phaseDuration = getPhaseDuration();

  // Check for warning signal and trigger shake animation
  useEffect(() => {
    const timeRemaining = phaseDuration - elapsedSeconds;
    const warningTime = phase === 'fight' ? settings.warningSignalRound :
                        phase === 'break' ? settings.warningSignalBreak :
                        0;

    // Trigger shake when we hit the warning time (not before or after)
    if (timeRemaining === warningTime && warningTime > 0 && !hasShaken.current && !isPaused) {
      setShouldShake(true);
      hasShaken.current = true;

      // Play bell sound for warning
      playSound(bellBufferRef.current);

      // Remove shake class after animation completes
      const shakeTimeout = setTimeout(() => {
        setShouldShake(false);
      }, 250);

      return () => clearTimeout(shakeTimeout);
    }
  }, [elapsedSeconds, phase, phaseDuration, settings.warningSignalRound, settings.warningSignalBreak, isPaused]);

  // Reset shake flag when phase or round changes
  useEffect(() => {
    hasShaken.current = false;
  }, [phase, currentRound]);

  // Play box sound when phase changes (round starts/ends)
  useEffect(() => {
    // Play box sound only when phase actually changes
    if (phase !== lastPhaseRef.current && (phase === 'fight' || phase === 'break')) {
      if (!isPaused) {
        playSound(boxBufferRef.current);
      }
    }

    // Update last phase
    lastPhaseRef.current = phase;
  }, [phase, isPaused]);

  // Play box sound on round change within the same set (fight -> fight)
  useEffect(() => {
    if (currentRound !== lastRoundRef.current && phase === 'fight' && !isPaused) {
      playSound(boxBufferRef.current);
    }
    lastRoundRef.current = currentRound;
  }, [currentRound, phase, isPaused]);

  // Timer effect - use single effect that doesn't depend on phase
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1; // Increment by 1 second since interval is 1000ms
        const currentPhase = phaseRef.current;

        const currentDuration = currentPhase === 'warmup'
          ? 5
          : currentPhase === 'fight'
          ? settings.roundDuration
          : currentPhase === 'break'
          ? settings.breakDuration
          : 0;

        // Check if phase is complete (countdown reaches zero)
        if (next > currentDuration) {
          // Transition to next phase
          if (currentPhase === 'warmup') {
            setPhase('fight');
            return 0;
          } else if (currentPhase === 'fight') {
            if (currentRoundRef.current < settings.roundsPerSet) {
              // More rounds in this set -- next round (fight -> fight)
              setCurrentRound((prev) => prev + 1);
              return 0;
            } else if (currentSetRef.current < settings.numSets) {
              // Set complete, take a break before next set
              setPhase('break');
              return 0;
            } else {
              // All sets done -- stop
              setCurrentSet(1);
              setCurrentRound(1);
              setPhase('warmup');
              setIsPaused(true);
              releaseWakeLock();
              return 0;
            }
          } else if (currentPhase === 'break') {
            // Break over -- start round 1 of next set
            setCurrentSet((prev) => prev + 1);
            setCurrentRound(1);
            setPhase('fight');
            return 0;
          }
          return 0;
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, settings.roundDuration, settings.breakDuration, settings.numSets, settings.roundsPerSet]);

  const handleStart = async () => {
    // Ensure audio is ready on user gesture (critical for mobile/PWA)
    await ensureAudioContext();
    await requestWakeLock();
    setShowSettings(false);
    setPhase('warmup');
    setCurrentSet(1);
    setCurrentRound(1);
    setElapsedSeconds(0);
    setIsPaused(false);
    hasShaken.current = false;
    lastPhaseRef.current = 'warmup';
    lastRoundRef.current = 1;
  };

  const handlePause = async () => {
    if (isPaused) {
      // Resuming - ensure audio context is active and keep screen on
      await ensureAudioContext();
      await requestWakeLock();
    } else {
      // Pausing - allow screen to sleep
      await releaseWakeLock();
    }
    setIsPaused(!isPaused);
  };

  const handleReset = () => {
    setPhase('warmup');
    setCurrentSet(1);
    setCurrentRound(1);
    setElapsedSeconds(0);
    setIsPaused(true);
    hasShaken.current = false;
    lastPhaseRef.current = 'warmup';
    lastRoundRef.current = 1;
    releaseWakeLock();
  };

  const handleSettingChange = (key, value) => {
    // Allow empty string for editing
    if (value === '') {
      setSettings((prev) => ({
        ...prev,
        [key]: '',
      }));
      return;
    }

    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      setSettings((prev) => {
        const newSettings = {
          ...prev,
          [key]: numValue,
        };

        // Auto-adjust warning signals when durations are reduced
        if (key === 'roundDuration' && newSettings.warningSignalRound >= numValue) {
          newSettings.warningSignalRound = Math.max(0, numValue - 1);
        }
        if (key === 'breakDuration' && newSettings.warningSignalBreak >= numValue) {
          newSettings.warningSignalBreak = Math.max(0, numValue - 1);
        }

        return newSettings;
      });
    }
  };

  const displayTime = formatTime(Math.max(0, Math.floor(phaseDuration - elapsedSeconds)));
  const displaySet = `Set ${currentSet}/${settings.numSets}`;
  const displayRound = `Round ${currentRound}/${settings.roundsPerSet}`;
  const displayPhase = phase === 'warmup' ? 'Warm-up' : phase === 'fight' ? 'Fight' : phase === 'break' ? 'Break' : 'Ready';

  // Check if settings have validation errors
  const hasValidationErrors =
    settings.warningSignalRound >= settings.roundDuration ||
    settings.warningSignalBreak >= settings.breakDuration ||
    settings.warningSignalRound === '' ||
    settings.warningSignalBreak === '' ||
    settings.roundDuration === '' ||
    settings.breakDuration === '' ||
    settings.numSets === '' ||
    settings.roundsPerSet === '';

  const getPhaseClassName = () => {
    if (phase === 'warmup') return 'phase-warmup';
    if (phase === 'fight') return 'phase-fight';
    if (phase === 'break') return 'phase-break';
    return '';
  };

  return (
    <div className={`App ${getPhaseClassName()}`}>
      <main className="App-main">
        <section className={`timer-container ${showSettings ? 'settings-mode' : ''} ${shouldShake ? 'shake' : ''}`}>
          {!showSettings ? (
            <>
              <div>
                <div className="timer-round">{displaySet} &middot; {displayRound}</div>
                <div className="timer-time">{displayTime}</div>
                <div className="timer-phase">{displayPhase}</div>
              </div>
            </>
          ) : (
            <>
              <h2 className="settings-title">Settings</h2>
              <div className="settings-grid">
                <div className="setting-input">
                  <label htmlFor="numSets">Number of Sets</label>
                  <input
                    id="numSets"
                    type="number"
                    min="1"
                    max="99"
                    value={settings.numSets}
                    onChange={(e) => handleSettingChange('numSets', e.target.value)}
                  />
                </div>

                <div className="setting-input">
                  <label htmlFor="roundsPerSet">Rounds per Set</label>
                  <input
                    id="roundsPerSet"
                    type="number"
                    min="1"
                    max="99"
                    value={settings.roundsPerSet}
                    onChange={(e) => handleSettingChange('roundsPerSet', e.target.value)}
                  />
                </div>

                <div className="setting-input">
                  <label htmlFor="roundDuration">Round Duration (sec)</label>
                  <input
                    id="roundDuration"
                    type="number"
                    min="5"
                    max="3600"
                    value={settings.roundDuration}
                    onChange={(e) => handleSettingChange('roundDuration', e.target.value)}
                  />
                </div>

                <div className="setting-input">
                  <label htmlFor="breakDuration">Break Duration (sec)</label>
                  <input
                    id="breakDuration"
                    type="number"
                    min="0"
                    max="300"
                    value={settings.breakDuration}
                    onChange={(e) => handleSettingChange('breakDuration', e.target.value)}
                  />
                </div>

                <div className="setting-input">
                  <label htmlFor="warningSignalRound">Warning Before Round Ends (sec)</label>
                  <input
                    id="warningSignalRound"
                    type="number"
                    min="0"
                    value={settings.warningSignalRound}
                    onChange={(e) => handleSettingChange('warningSignalRound', e.target.value)}
                    className={settings.warningSignalRound !== '' && settings.warningSignalRound >= settings.roundDuration ? 'invalid' : ''}
                  />
                  {settings.warningSignalRound !== '' && settings.warningSignalRound >= settings.roundDuration && (
                    <span className="error-text">Must be less than round duration ({settings.roundDuration}s)</span>
                  )}
                </div>

                <div className="setting-input">
                  <label htmlFor="warningSignalBreak">Warning Before Break Ends (sec)</label>
                  <input
                    id="warningSignalBreak"
                    type="number"
                    min="0"
                    value={settings.warningSignalBreak}
                    onChange={(e) => handleSettingChange('warningSignalBreak', e.target.value)}
                    className={settings.warningSignalBreak !== '' && settings.warningSignalBreak >= settings.breakDuration ? 'invalid' : ''}
                  />
                  {settings.warningSignalBreak !== '' && settings.warningSignalBreak >= settings.breakDuration && (
                    <span className="error-text">Must be less than break duration ({settings.breakDuration}s)</span>
                  )}
                </div>
              </div>

              <div className="controls">
                <button
                  className="btn btn-done"
                  onClick={() => setShowSettings(false)}
                  disabled={hasValidationErrors}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </section>

        {!showSettings && (
          <section className="info-card">
            <div className="info-grid">
              <div className="info-item">
                <div className="info-label">Sets</div>
                <div className="info-value">{settings.numSets}</div>
              </div>
              <div className="info-item">
                <div className="info-label">Rounds</div>
                <div className="info-value">{settings.roundsPerSet}</div>
              </div>
              <div className="info-item">
                <div className="info-label">Fight</div>
                <div className="info-value">{settings.roundDuration}s</div>
              </div>
              <div className="info-item">
                <div className="info-label">Rest</div>
                <div className="info-value">{settings.breakDuration}s</div>
              </div>
            </div>
          </section>
        )}

        {!showSettings && (
          <section className="controls-card">
            <div className="controls">
              {phase === 'warmup' && isPaused ? (
                <>
                  <button className="btn btn-start" onClick={handleStart}>
                    Start
                  </button>
                  <button className="btn btn-settings" onClick={() => setShowSettings(true)}>
                    Settings
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-pause" onClick={handlePause}>
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button className="btn btn-reset" onClick={handleReset}>
                    Reset
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
