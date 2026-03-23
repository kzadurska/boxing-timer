import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function App() {
  // Settings state
  const [settings, setSettings] = useState({
    numRounds: 2,
    roundDuration: 8,
    breakDuration: 4,
    warningSignalRound: 2,
    warningSignalBreak: 2,
  });

  const [showSettings, setShowSettings] = useState(false);

  // Timer state
  const [phase, setPhase] = useState('warmup'); // 'warmup', 'fight', 'break'
  const [currentRound, setCurrentRound] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [shouldShake, setShouldShake] = useState(false);

  // Ref to track current values for the interval
  const phaseRef = useRef('warmup');
  const currentRoundRef = useRef(1);
  const hasShaken = useRef(false);
  const lastPhaseRef = useRef('warmup');

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

  // Re-resume AudioContext when PWA returns from background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && audioContextRef.current) {
        audioContextRef.current.resume().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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

  // Reset shake flag when phase changes
  useEffect(() => {
    hasShaken.current = false;
  }, [phase]);

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
            if (currentRoundRef.current < settings.numRounds) {
              setPhase('break');
              return 0;
            } else {
              // Loop back to warmup after last round
              setCurrentRound(1);
              setPhase('warmup');
              setIsPaused(true);
              return 0;
            }
          } else if (currentPhase === 'break') {
            setCurrentRound((prev) => prev + 1);
            setPhase('fight');
            return 0;
          }
          return 0;
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, settings.roundDuration, settings.breakDuration, settings.numRounds]);

  const handleStart = async () => {
    // Ensure audio is ready on user gesture (critical for mobile/PWA)
    await ensureAudioContext();
    setShowSettings(false);
    setPhase('warmup');
    setCurrentRound(1);
    setElapsedSeconds(0);
    setIsPaused(false);
    hasShaken.current = false;
    lastPhaseRef.current = 'warmup';
  };

  const handlePause = async () => {
    if (isPaused) {
      // Resuming - ensure audio context is active
      await ensureAudioContext();
    }
    setIsPaused(!isPaused);
  };

  const handleReset = () => {
    setPhase('warmup');
    setCurrentRound(1);
    setElapsedSeconds(0);
    setIsPaused(true);
    hasShaken.current = false;
    lastPhaseRef.current = 'warmup';
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
  const displayRound = `Round ${currentRound}/${settings.numRounds}`;
  const displayPhase = phase === 'warmup' ? 'Warm-up' : phase === 'fight' ? 'Fight' : phase === 'break' ? 'Break' : 'Ready';

  // Check if settings have validation errors
  const hasValidationErrors = 
    settings.warningSignalRound >= settings.roundDuration ||
    settings.warningSignalBreak >= settings.breakDuration ||
    settings.warningSignalRound === '' ||
    settings.warningSignalBreak === '' ||
    settings.roundDuration === '' ||
    settings.breakDuration === '' ||
    settings.numRounds === '';

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
                <div className="timer-round">{displayRound}</div>
                <div className="timer-time">{displayTime}</div>
                <div className="timer-phase">{displayPhase}</div>
              </div>
            </>
          ) : (
            <>
              <h2 className="settings-title">Settings</h2>
              <div className="settings-grid">
                <div className="setting-input">
                  <label htmlFor="numRounds">Number of Rounds</label>
                  <input
                    id="numRounds"
                    type="number"
                    min="1"
                    max="99"
                    value={settings.numRounds}
                    onChange={(e) => handleSettingChange('numRounds', e.target.value)}
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
                <div className="info-value">{settings.numRounds}</div>
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
