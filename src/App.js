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
      
      // Remove shake class after animation completes
      setTimeout(() => {
        setShouldShake(false);
      }, 250);
    }
  }, [elapsedSeconds, phase, phaseDuration, settings.warningSignalRound, settings.warningSignalBreak, isPaused]);

  // Reset shake flag when phase changes
  useEffect(() => {
    hasShaken.current = false;
  }, [phase]);

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

  const handleStart = () => {
    setShowSettings(false);
    setPhase('warmup');
    setCurrentRound(1);
    setElapsedSeconds(0);
    setIsPaused(false);
    hasShaken.current = false;
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleReset = () => {
    setPhase('warmup');
    setCurrentRound(1);
    setElapsedSeconds(0);
    setIsPaused(true);
    hasShaken.current = false;
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
