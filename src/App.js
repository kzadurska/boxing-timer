import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function App() {
  // Settings state
  const [settings, setSettings] = useState({
    numRounds: 6,
    roundDuration: 30,
    breakDuration: 10,
    warningSignalRound: 10,
    warningSignalBreak: 5,
  });

  const [showSettings, setShowSettings] = useState(false);

  // Timer state
  const [phase, setPhase] = useState('idle'); // 'idle', 'warmup', 'round', 'break', 'completed'
  const [currentRound, setCurrentRound] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(true);

  // Ref to track current values for the interval
  const phaseRef = useRef('idle');
  const currentRoundRef = useRef(1);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    currentRoundRef.current = currentRound;
  }, [currentRound]);  // Calculate duration based on phase
  const getPhaseDuration = () => {
    if (phase === 'warmup') return 5;
    if (phase === 'round') return settings.roundDuration;
    if (phase === 'break') return settings.breakDuration;
    return 0;
  };

  const phaseDuration = getPhaseDuration();

  // Timer effect - use single effect that doesn't depend on phase
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1; // Increment by 1 second since interval is 1000ms
        const currentPhase = phaseRef.current;

        if (currentPhase === 'idle' || currentPhase === 'completed') {
          return prev;
        }

        const currentDuration = currentPhase === 'warmup'
          ? 5
          : currentPhase === 'round'
          ? settings.roundDuration
          : currentPhase === 'break'
          ? settings.breakDuration
          : 0;

        // Check if phase is complete (countdown reaches zero)
        if (next >= currentDuration) {
          // Transition to next phase
          if (currentPhase === 'warmup') {
            setPhase('round');
            return 0;
          } else if (currentPhase === 'round') {
            if (currentRoundRef.current < settings.numRounds) {
              setPhase('break');
              return 0;
            } else {
              setPhase('completed');
              return 0;
            }
          } else if (currentPhase === 'break') {
            setCurrentRound((prev) => prev + 1);
            setPhase('round');
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
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleReset = () => {
    setPhase('idle');
    setCurrentRound(1);
    setElapsedSeconds(0);
    setIsPaused(false);
  };

  const handleSettingChange = (key, value) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      setSettings((prev) => ({
        ...prev,
        [key]: numValue,
      }));
    }
  };

  const displayTime = formatTime(Math.max(0, Math.floor(phaseDuration - elapsedSeconds)));
  const displayPhase = phase === 'warmup' ? 'Warm-up' : phase === 'round' ? `Round ${currentRound}/${settings.numRounds}` : phase === 'break' ? 'Break' : 'Ready';

  return (
    <div className="App">
      <main className="App-main">
        <section className="timer-container">
          {!showSettings ? (
            <>
              <div className="timer-display">
                <div className="timer-phase">{displayPhase}</div>
                <div className="timer-time">{displayTime}</div>
              </div>

              <div className="controls">
                {phase === 'idle' ? (
                  <>
                    <button className="btn btn-start" onClick={handleStart}>
                      Start
                    </button>
                    <button className="btn btn-settings" onClick={() => setShowSettings(true)}>
                      Settings
                    </button>
                  </>
                ) : phase === 'completed' ? (
                  <>
                    <button className="btn btn-start" onClick={handleStart}>
                      Start Again
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
                    max={settings.roundDuration - 1}
                    value={settings.warningSignalRound}
                    onChange={(e) => handleSettingChange('warningSignalRound', e.target.value)}
                  />
                </div>

                <div className="setting-input">
                  <label htmlFor="warningSignalBreak">Warning Before Break Ends (sec)</label>
                  <input
                    id="warningSignalBreak"
                    type="number"
                    min="0"
                    max={settings.breakDuration > 0 ? settings.breakDuration - 1 : 0}
                    value={settings.warningSignalBreak}
                    onChange={(e) => handleSettingChange('warningSignalBreak', e.target.value)}
                  />
                </div>
              </div>

              <div className="controls">
                <button className="btn btn-start" onClick={() => setShowSettings(false)}>
                  Done
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
