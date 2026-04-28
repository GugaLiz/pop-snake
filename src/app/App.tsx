import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { GAME_MODES, type GameModeId } from '../config/gameConfig';
import { GameCanvas } from './GameCanvas';
import type { Direction, GameEvent, GameResult, GameSnapshot } from '../game/types';
import {
  getBestCombo,
  getBestScore,
  getBestSurvivalSeconds,
  getSettings,
  hasTutorialCompleted,
  markTutorialCompleted,
  saveSettings,
} from '../storage/localStorage';

const DESKTOP_STAGE = { width: 1180, height: 900 } as const;

const initialSnapshot: GameSnapshot = {
  mode: 'standard',
  objectiveText: '目标：达到 1500 分过关',
  score: 0,
  length: 3,
  combo: 0,
  maxCombo: 0,
  eliminated: 0,
  eaten: 0,
  stepsUsed: 0,
  survivalSeconds: 0,
  bestScore: getBestScore(),
  bestSurvivalSeconds: getBestSurvivalSeconds(),
  bestCombo: getBestCombo(),
  isDanger: false,
  isSlowed: false,
  objectiveCompleted: false,
  status: 'ready',
};

type Command = Direction | 'pause' | 'restart' | 'start';

export function App() {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);
  const [selectedMode, setSelectedMode] = useState<GameModeId>('standard');
  const [result, setResult] = useState<GameResult | null>(null);
  const [settings, setSettings] = useState(getSettings);
  const [tutorialDone, setTutorialDone] = useState(hasTutorialCompleted);
  const [showGuide, setShowGuide] = useState(false);
  const stageScale = useStageScale();
  const commandIdRef = useRef(0);
  const [command, setCommand] = useState<{ type: Command; id: number } | null>(null);

  const issueCommand = useCallback((nextCommand: Command) => {
    commandIdRef.current += 1;
    setCommand({ type: nextCommand, id: commandIdRef.current });
  }, []);

  const handleSnapshot = useCallback((nextSnapshot: GameSnapshot) => setSnapshot(nextSnapshot), []);
  const handleGameOver = useCallback((nextResult: GameResult) => setResult(nextResult), []);

  const handleEvent = useCallback((event: GameEvent) => {
    if (!settings.sfxEnabled) return;
    playSound(event.type);
  }, [settings.sfxEnabled]);

  useEffect(() => {
    if (tutorialDone) return;
    if (snapshot.eliminated > 0 || snapshot.survivalSeconds >= 30) {
      markTutorialCompleted();
      setTutorialDone(true);
    }
  }, [snapshot.eliminated, snapshot.survivalSeconds, tutorialDone]);

  const restart = () => {
    setResult(null);
    issueCommand('restart');
  };

  const changeMode = (mode: GameModeId) => {
    setResult(null);
    setSelectedMode(mode);
  };

  const toggleVirtualPad = () => {
    const next = { ...settings, virtualPadEnabled: !settings.virtualPadEnabled };
    setSettings(next);
    saveSettings(next);
  };

  const toggleSfx = () => {
    const next = { ...settings, sfxEnabled: !settings.sfxEnabled };
    setSettings(next);
    saveSettings(next);
  };

  const toggleScreenShake = () => {
    const next = { ...settings, screenShakeEnabled: !settings.screenShakeEnabled };
    setSettings(next);
    saveSettings(next);
  };

  const tutorialText = getTutorialText(snapshot, tutorialDone);
  const progress = getModeProgress(snapshot);

  return (
    <main className="stage-viewport">
      <div className="shell stage" style={{ '--stage-scale': stageScale } as CSSProperties}>
        <section className="hero-card">
          <div>
            <p className="eyebrow">纯前端试玩版</p>
            <h1>消消蛇</h1>
            <p className="subtitle">吃色块会变长，连续吃到 3 个同色就会消掉尾巴。</p>
          </div>
          <div className="hero-actions">
            <button className="pill-button" onClick={toggleSfx} type="button">音效：{settings.sfxEnabled ? '开' : '关'}</button>
            <button className="pill-button" onClick={toggleScreenShake} type="button">震动：{settings.screenShakeEnabled ? '开' : '关'}</button>
            <button className="pill-button" onClick={toggleVirtualPad} type="button">{settings.virtualPadEnabled ? '隐藏方向键' : '显示方向键'}</button>
          </div>
        </section>

        <section className="play-layout">
          <aside className="mode-bar panel">
            <div className="mode-select">
              {Object.values(GAME_MODES).map((mode) => (
                <button className={mode.id === selectedMode ? 'active' : ''} key={mode.id} onClick={() => changeMode(mode.id)} type="button">
                  {mode.name}
                </button>
              ))}
            </div>
            <p className="objective">{snapshot.objectiveText}</p>
            {progress && (
              <div className="progress-card compact">
                <span>{progress.label}</span>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.percent}%` }} /></div>
                <strong>{progress.value}</strong>
              </div>
            )}
          </aside>

          <div className="game-shell panel">
            <div className="top-hud">
              <div className="metric primary"><span>分数</span><strong>{snapshot.score}</strong></div>
              <div className="metric"><span>长度</span><strong>{snapshot.length}</strong></div>
              <div className="metric"><span>Combo</span><strong>x{Math.max(1, snapshot.combo)}</strong></div>
              <div className="metric"><span>消除</span><strong>{snapshot.eliminated}</strong></div>
              <div className="metric"><span>{snapshot.remainingSeconds !== undefined ? '剩余' : '时间'}</span><strong>{snapshot.remainingSeconds !== undefined ? `${snapshot.remainingSeconds}s` : `${snapshot.survivalSeconds}s`}</strong></div>
              {snapshot.stepsLeft !== undefined && <div className="metric"><span>步数</span><strong>{snapshot.stepsLeft}</strong></div>}
              <div className="records inline"><span>最高 {snapshot.bestScore}</span><span>最长 {snapshot.bestSurvivalSeconds}s</span></div>
              <div className="controls-row inline-controls">
                {snapshot.status === 'ready' ? <button onClick={() => issueCommand('start')} type="button">开始</button> : <button onClick={() => issueCommand('pause')} type="button">{snapshot.status === 'paused' ? '继续' : '暂停'}</button>}
                <button onClick={restart} type="button">重开</button>
                <button onClick={() => setShowGuide(true)} type="button">教程</button>
              </div>
            </div>
            {(snapshot.isDanger || snapshot.isSlowed) && (
              <div className="status-strip">
                {snapshot.isDanger && <span>蛇身变长了，尽快凑尾巴三连消除。</span>}
                {snapshot.isSlowed && <span>减速生效中</span>}
              </div>
            )}
            <div className="game-wrap">
              <GameCanvas mode={selectedMode} onSnapshot={handleSnapshot} onGameOver={handleGameOver} onEvent={handleEvent} screenShakeEnabled={settings.screenShakeEnabled} command={command} />
              {tutorialText && <div className="tutorial-banner">{tutorialText}</div>}
              {snapshot.status === 'ready' && !result && (
                <div className="overlay start-card"><p>{GAME_MODES[selectedMode].name}</p><strong>开始</strong><span>{GAME_MODES[selectedMode].description}</span><button onClick={() => issueCommand('start')} type="button">开始游戏</button></div>
              )}
              {snapshot.status === 'paused' && <div className="overlay">已暂停</div>}
              {showGuide && (
                <div className="overlay guide-card"><p>玩法示例</p><div className="demo-chain" aria-label="红绿红红红示例"><span className="demo-dot red" /><span className="demo-dot green" /><span className="demo-dot red" /><span className="demo-dot red pop" /><span className="demo-dot red pop" /></div><span>吃到的颜色会进入蛇尾。尾巴最后 3 节同色，就会一起消除。</span><button onClick={() => setShowGuide(false)} type="button">明白了</button></div>
              )}
              {result && (
                <div className="overlay result-card"><p>{result.objectiveCompleted ? '目标完成' : '本局结束'}</p><strong>{result.score}</strong><span>长度 {result.finalLength} · Combo x{Math.max(1, result.maxCombo)} · 消除 {result.eliminated} 节</span><button onClick={restart} type="button">再来一局</button></div>
              )}
            </div>
          </div>

          {settings.virtualPadEnabled && (
            <aside className="virtual-pad panel" aria-label="移动端方向键">
              <button className="up" onClick={() => issueCommand('up')} type="button">上</button>
              <button className="left" onClick={() => issueCommand('left')} type="button">左</button>
              <button className="right" onClick={() => issueCommand('right')} type="button">右</button>
              <button className="down" onClick={() => issueCommand('down')} type="button">下</button>
            </aside>
          )}
        </section>
      </div>
    </main>
  );
}

function useStageScale(): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      if (window.innerWidth <= 980) {
        setScale(1);
        return;
      }
      const safeWidth = window.innerWidth - 24;
      const safeHeight = window.innerHeight - 24;
      setScale(Math.min(safeWidth / DESKTOP_STAGE.width, safeHeight / DESKTOP_STAGE.height, 1));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  return scale;
}

function getModeProgress(snapshot: GameSnapshot): { label: string; value: string; percent: number } | null {
  if (snapshot.mode === 'standard') return { label: '过关进度', value: `${snapshot.score}/1500`, percent: Math.min(100, (snapshot.score / 1500) * 100) };
  if (snapshot.mode === 'endless') return null;
  if (snapshot.mode === 'timed') return { label: '目标进度', value: `${snapshot.score}/1200 或 ${snapshot.eliminated}/18`, percent: Math.max(Math.min(100, (snapshot.score / 1200) * 100), Math.min(100, (snapshot.eliminated / 18) * 100)) };
  if (snapshot.mode === 'steps') return { label: '消除进度', value: `${snapshot.eliminated}/15`, percent: Math.min(100, (snapshot.eliminated / 15) * 100) };
  return { label: '长度目标', value: `当前 ${snapshot.length} / 目标 9`, percent: Math.max(0, 100 - Math.min(100, Math.abs(snapshot.length - 9) * 22)) };
}

function getTutorialText(snapshot: GameSnapshot, tutorialDone: boolean): string | null {
  if (tutorialDone || snapshot.status === 'gameover') return null;
  if (snapshot.eaten === 0) return '吃到色块后，蛇尾会长出对应颜色。';
  if (snapshot.eaten < 3) return '观察尾巴颜色，最后 3 节同色才会消除。';
  if (snapshot.eliminated === 0) return '尾巴已有两节同色时，再吃同色就能消掉尾巴。';
  return null;
}

let audioContext: AudioContext | undefined;

function playSound(type: GameEvent['type']): void {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ??= new AudioContextClass();
  if (audioContext.state === 'suspended') void audioContext.resume();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  const frequency = type === 'eat' ? 520 : type === 'eliminate' ? 820 : type === 'powerup' ? 660 : 180;
  const duration = type === 'eliminate' ? 0.14 : 0.08;
  oscillator.type = type === 'gameover' ? 'sawtooth' : 'square';
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}
