import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { GAME_CONFIG, GAME_MODES, type GameModeId } from '../config/gameConfig';
import { GameCanvas } from './GameCanvas';
import type { Direction, GameEvent, GameResult, GameSnapshot } from '../game/types';
import {
  getDailyChallengeStatus,
  getBestCombo,
  getBestScore,
  getBestSurvivalSeconds,
  getSettings,
  getStickerCollection,
  getStickerDefinitions,
  hasTutorialCompleted,
  markTutorialCompleted,
  saveSettings,
} from '../storage/localStorage';

const DESKTOP_STAGE = { width: 1180, height: 900 } as const;

const initialSnapshot: GameSnapshot = {
  mode: 'sprint',
  objectiveText: '目标：90 秒内冲更高分，三消可以返时并解锁强化',
  dailyChallengeText: undefined,
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
  missionStates: [],
  selectedUpgrades: [],
  upgradeChoices: [],
  status: 'ready',
};

type Command = Direction | 'pause' | 'restart' | 'restart-play' | 'start' | 'skill' | 'upgrade-0' | 'upgrade-1' | 'upgrade-2' | 'puzzle-replay' | 'puzzle-next';
type Tone = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

const MODE_LABELS: Record<GameModeId, { tone: Tone; tag: string }> = {
  sprint: { tone: 'legendary', tag: '主推' },
  daily: { tone: 'epic', tag: '每日' },
  standard: { tone: 'common', tag: '经典' },
  endless: { tone: 'rare', tag: '耐玩' },
  timed: { tone: 'rare', tag: '快节奏' },
  steps: { tone: 'common', tag: '规划' },
  precision: { tone: 'epic', tag: '挑战' },
  puzzle: { tone: 'epic', tag: '解谜' },
  rush: { tone: 'rare', tag: '开路' },
};

const PRIMARY_MODES: GameModeId[] = ['sprint', 'daily'];
const BRANCH_MODES: GameModeId[] = ['puzzle', 'rush'];
const MORE_MODES: GameModeId[] = ['endless', 'precision', 'standard', 'timed', 'steps'];

export function App() {
  const stickerDefinitions = getStickerDefinitions();
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);
  const [selectedMode, setSelectedMode] = useState<GameModeId>('sprint');
  const [result, setResult] = useState<GameResult | null>(null);
  const [settings, setSettings] = useState(getSettings);
  const [tutorialDone, setTutorialDone] = useState(hasTutorialCompleted);
  const [showGuide, setShowGuide] = useState(false);
  const [dailyStatus, setDailyStatus] = useState({ completed: false, bestScore: 0 });
  const [stickers, setStickers] = useState(getStickerCollection);
  const [selectedUpgradeIndex, setSelectedUpgradeIndex] = useState(0);
  const [showMoreModes, setShowMoreModes] = useState(false);
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

  useEffect(() => {
    if (!snapshot.dailyChallengeKey) return;
    setDailyStatus(getDailyChallengeStatus(snapshot.dailyChallengeKey));
    setStickers(getStickerCollection());
  }, [snapshot.dailyChallengeKey, result]);

  useEffect(() => {
    setStickers(getStickerCollection());
  }, [result]);

  useEffect(() => {
    if (!MORE_MODES.includes(selectedMode)) return;
    setShowMoreModes(true);
  }, [selectedMode]);

  useEffect(() => {
    if (snapshot.status !== 'upgrade') return;
    setSelectedUpgradeIndex(0);
  }, [snapshot.status, snapshot.upgradeChoices]);

  useEffect(() => {
    if (snapshot.status !== 'upgrade') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (snapshot.upgradeChoices.length === 0) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedUpgradeIndex((current) => (current - 1 + snapshot.upgradeChoices.length) % snapshot.upgradeChoices.length);
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedUpgradeIndex((current) => (current + 1) % snapshot.upgradeChoices.length);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        issueCommand(`upgrade-${selectedUpgradeIndex}` as Command);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [issueCommand, selectedUpgradeIndex, snapshot.status, snapshot.upgradeChoices]);

  const restart = () => {
    setResult(null);
    issueCommand('restart');
  };

  const replay = () => {
    setResult(null);
    issueCommand('restart-play');
  };

  const replayPuzzleLevel = () => {
    setResult(null);
    issueCommand('puzzle-replay');
  };

  const nextPuzzleLevel = () => {
    setResult(null);
    issueCommand('puzzle-next');
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
  const resumePercent = Math.max(0, Math.min(100, Math.round((snapshot.resumeCountdownProgress ?? 0) * 100)));
  const puzzleProgress = selectedMode === 'puzzle' ? parsePuzzleObjective(snapshot.objectiveText) : null;
  const rushSkillReady = Boolean(snapshot.rushSkillReady);
  const rushCooldownText = snapshot.rushSkillCooldownSeconds ? `${snapshot.rushSkillCooldownSeconds}s` : '就绪';
  const comboActive = selectedMode !== 'puzzle' && snapshot.combo > 1;
  const currentModeSummary = getCurrentModeSummary(selectedMode, snapshot, {
    puzzleProgress,
    rushSkillReady,
    rushCooldownText,
    dailyStatus,
  });
  const statusMessages = [
    snapshot.isDanger ? '蛇身变长了，尽快凑尾巴三连消除。' : null,
    snapshot.isSlowed ? '减速生效中' : null,
    snapshot.mode === 'rush' && snapshot.status === 'playing'
      ? rushSkillReady
        ? '开路已就绪，按空格可沿当前方向直线清障。'
        : `开路冷却中 · ${rushCooldownText}`
      : null,
    snapshot.comboRewardText ?? null,
  ].filter(Boolean) as string[];
  const puzzleLevelMatch = result?.mode === 'puzzle' ? result.objectiveText.match(/第\s*(\d+)\/(\d+)\s*关/) : null;
  const puzzleChapterCleared = Boolean(
    result?.mode === 'puzzle'
      && result.objectiveCompleted
      && puzzleLevelMatch
      && Number(puzzleLevelMatch[1]) === Number(puzzleLevelMatch[2]),
  );
  const puzzleOptimalReached = Boolean(
    result?.mode === 'puzzle'
      && result.objectiveCompleted
      && result.puzzleStepDelta !== undefined
      && result.puzzleStepDelta <= 0,
  );
  const buttonNavEnabled = showGuide || result !== null || snapshot.status === 'ready' || snapshot.status === 'paused';

  useEffect(() => {
    if (!buttonNavEnabled) return;

    const getButtons = () => {
      let selector = 'button[data-nav-button="true"]';
      if (result) selector = '.result-card button[data-nav-button="true"]';
      else if (showGuide) selector = '.guide-card button[data-nav-button="true"]';
      else if (snapshot.status === 'ready') selector = '.start-card button[data-nav-button="true"]';
      else if (snapshot.status === 'paused') selector = '.top-hud button[data-nav-button="true"]';

      return Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).filter(
        (button) => !button.disabled && button.offsetParent !== null,
      );
    };

    const focusFirst = () => {
      const buttons = getButtons();
      if (buttons.length > 0) buttons[0].focus();
    };

    const moveFocus = (direction: 'left' | 'right' | 'up' | 'down') => {
      const buttons = getButtons();
      if (buttons.length === 0) return;

      const active = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
      if (!active || !buttons.includes(active)) {
        focusFirst();
        return;
      }

      const activeRect = active.getBoundingClientRect();
      const activeCenterX = activeRect.left + activeRect.width / 2;
      const activeCenterY = activeRect.top + activeRect.height / 2;

      const candidates = buttons
        .filter((button) => button !== active)
        .map((button) => {
          const rect = button.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          return { button, centerX, centerY };
        })
        .filter((candidate) => {
          if (direction === 'left') return candidate.centerX < activeCenterX - 4;
          if (direction === 'right') return candidate.centerX > activeCenterX + 4;
          if (direction === 'up') return candidate.centerY < activeCenterY - 4;
          return candidate.centerY > activeCenterY + 4;
        })
        .sort((a, b) => {
          const primary =
            direction === 'left' || direction === 'right'
              ? Math.abs(a.centerX - activeCenterX) - Math.abs(b.centerX - activeCenterX)
              : Math.abs(a.centerY - activeCenterY) - Math.abs(b.centerY - activeCenterY);
          if (primary !== 0) return primary;
          const secondary =
            direction === 'left' || direction === 'right'
              ? Math.abs(a.centerY - activeCenterY) - Math.abs(b.centerY - activeCenterY)
              : Math.abs(a.centerX - activeCenterX) - Math.abs(b.centerX - activeCenterX);
          return secondary;
        });

      if (candidates.length > 0) {
        candidates[0].button.focus();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (snapshot.status === 'upgrade') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveFocus('left');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveFocus('right');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveFocus('up');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveFocus('down');
      } else if (event.key === 'Enter') {
        const active = document.activeElement;
        if (active instanceof HTMLButtonElement && active.dataset.navButton === 'true') {
          event.preventDefault();
          active.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLButtonElement) || active.dataset.navButton !== 'true') {
        focusFirst();
      }
    });

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buttonNavEnabled, result, showGuide, snapshot.status]);

  return (
    <main className="stage-viewport">
      <div className="shell stage" style={{ '--stage-scale': stageScale } as CSSProperties}>
        <section className="hero-card">
          <div>
            <p className="eyebrow">V3 开发中</p>
            <h1>消消蛇</h1>
            <p className="subtitle">主玩冲刺与每日已可体验，解谜和开路分支都已接入，模式入口已按 V3 收敛。</p>
          </div>
          <div className="sticker-preview">
            <strong className="sticker-title">每日贴纸 {stickers.length}/{stickerDefinitions.length}</strong>
            <span className="sticker-help">完成不同每日规则可解锁</span>
            <div className="sticker-row">
              {stickerDefinitions.map((sticker) => (
                <span
                  className={`sticker-badge${stickers.includes(sticker.id) ? ' unlocked' : ''}`}
                  key={sticker.id}
                  title={stickers.includes(sticker.id) ? `已解锁：${sticker.shortLabel}` : `未解锁：${sticker.shortLabel}`}
                >
                  {sticker.shortLabel}
                </span>
              ))}
            </div>
          </div>
          <div className="hero-actions">
            <button className="pill-button" data-nav-button="true" onClick={toggleSfx} type="button">音效：{settings.sfxEnabled ? '开' : '关'}</button>
            <button className="pill-button" data-nav-button="true" onClick={toggleScreenShake} type="button">震屏：{settings.screenShakeEnabled ? '开' : '关'}</button>
            <button className="pill-button" data-nav-button="true" onClick={toggleVirtualPad} type="button">{settings.virtualPadEnabled ? '隐藏方向键' : '显示方向键'}</button>
          </div>
        </section>

        <section className="play-layout">
          <aside className="mode-bar panel">
            <div className="mode-section">
              <strong className="side-title">主玩法</strong>
              <div className="mode-select">
                {PRIMARY_MODES.map((modeId) => {
                  const mode = GAME_MODES[modeId];
                  return (
                    <button className={`mode-button rarity-${MODE_LABELS[mode.id].tone}${mode.id === selectedMode ? ' active' : ''}`} data-nav-button="true" key={mode.id} onClick={() => changeMode(mode.id)} type="button">
                      <span className={`mode-tag rarity-${MODE_LABELS[mode.id].tone}`}>{MODE_LABELS[mode.id].tag}</span>
                      <strong>{mode.name}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mode-section">
              <strong className="side-title">玩法分支</strong>
              <div className="mode-select">
                {BRANCH_MODES.map((modeId) => {
                  const mode = GAME_MODES[modeId];
                  return (
                    <button className={`mode-button rarity-${MODE_LABELS[mode.id].tone}${mode.id === selectedMode ? ' active' : ''}`} data-nav-button="true" key={mode.id} onClick={() => changeMode(mode.id)} type="button">
                      <span className={`mode-tag rarity-${MODE_LABELS[mode.id].tone}`}>{MODE_LABELS[mode.id].tag}</span>
                      <strong>{mode.name}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mode-section">
              <button className={`more-modes-toggle${showMoreModes ? ' active' : ''}`} data-nav-button="true" onClick={() => setShowMoreModes((current) => !current)} type="button">
                <span className="more-modes-label">更多玩法</span>
                <strong className="more-modes-state">{showMoreModes ? '收起' : '展开'}</strong>
              </button>
              {showMoreModes && (
                <div className="mode-select more-mode-select">
                  {MORE_MODES.map((modeId) => {
                    const mode = GAME_MODES[modeId];
                    return (
                      <button className={`mode-button rarity-${MODE_LABELS[mode.id].tone}${mode.id === selectedMode ? ' active' : ''}`} data-nav-button="true" key={mode.id} onClick={() => changeMode(mode.id)} type="button">
                        <span className={`mode-tag rarity-${MODE_LABELS[mode.id].tone}`}>{MODE_LABELS[mode.id].tag}</span>
                        <strong>{mode.name}</strong>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className={`current-mode-card rarity-${MODE_LABELS[selectedMode].tone}${result ? ' condensed' : ''}`}>
              <div className="current-mode-head">
                <span className={`mode-tag rarity-${MODE_LABELS[selectedMode].tone}`}>{MODE_LABELS[selectedMode].tag}</span>
                <strong>{GAME_MODES[selectedMode].name}</strong>
              </div>
              <p className="current-mode-copy">{currentModeSummary.copy}</p>
              <div className="current-mode-pills">
                {currentModeSummary.pills.map((pill) => (
                  <span className="current-mode-pill" key={pill}>{pill}</span>
                ))}
              </div>
            </div>
          </aside>

          <div className="game-shell panel">
            <div className="top-hud">
              <div className="metric primary"><span>分数</span><strong>{snapshot.score}</strong></div>
              <div className="metric"><span>长度</span><strong>{snapshot.length}</strong></div>
              <div className={`metric${comboActive ? ' combo-hot' : ''}`}><span>{selectedMode === 'puzzle' ? '目标' : selectedMode === 'rush' ? '清障' : 'Combo'}</span><strong>{selectedMode === 'puzzle' && puzzleProgress ? `${puzzleProgress.cleared}/${puzzleProgress.total}` : selectedMode === 'rush' ? `${snapshot.rushClearedObstacles ?? 0}` : `x${Math.max(1, snapshot.combo)}`}</strong></div>
              <div className="metric"><span>{selectedMode === 'sprint' || selectedMode === 'daily' ? '强化' : selectedMode === 'puzzle' ? '关卡' : selectedMode === 'rush' ? '技能' : '消除'}</span><strong>{selectedMode === 'sprint' || selectedMode === 'daily' ? snapshot.selectedUpgrades.length : selectedMode === 'puzzle' && puzzleProgress ? `${puzzleProgress.level}/${puzzleProgress.levelTotal}` : selectedMode === 'rush' ? rushCooldownText : snapshot.eliminated}</strong></div>
              <div className={`metric${comboActive ? ' combo-time-hot' : ''}`}><span>{selectedMode === 'puzzle' ? '步数' : snapshot.remainingSeconds !== undefined ? '剩余' : '时间'}</span><strong>{selectedMode === 'puzzle' ? `${snapshot.stepsUsed}步` : snapshot.remainingSeconds !== undefined ? `${snapshot.remainingSeconds}s` : `${snapshot.survivalSeconds}s`}</strong></div>
              {snapshot.stepsLeft !== undefined && <div className="metric"><span>步数</span><strong>{snapshot.stepsLeft}</strong></div>}
              <div className="records inline"><span>最高 {snapshot.bestScore}</span><span>最长 {snapshot.bestSurvivalSeconds}s</span></div>
              <div className="controls-row inline-controls">
                {snapshot.status === 'ready' ? <button data-nav-button="true" onClick={() => issueCommand('start')} type="button">开始</button> : <button data-nav-button="true" onClick={() => issueCommand('pause')} type="button">{snapshot.status === 'paused' ? '继续' : '暂停'}</button>}
                {selectedMode === 'rush' && snapshot.status !== 'ready' && snapshot.status !== 'gameover' && (
                  <button data-nav-button="true" onClick={() => issueCommand('skill')} type="button">
                    {rushSkillReady ? '开路' : `冷却 ${rushCooldownText}`}
                  </button>
                )}
                <button data-nav-button="true" onClick={restart} type="button">重开</button>
                <button data-nav-button="true" onClick={() => setShowGuide(true)} type="button">教程</button>
              </div>
            </div>
            <div className={`status-strip${statusMessages.length > 0 ? ' active' : ''}${snapshot.comboRewardText ? ' combo-banner' : ''}`} aria-hidden={statusMessages.length === 0}>
              {statusMessages.length > 0 ? statusMessages.map((message) => <span key={message}>{message}</span>) : <span>状态提示区</span>}
            </div>
            <div className="game-wrap" style={{ '--board-cols': GAME_CONFIG.boardColumns, '--board-rows': GAME_CONFIG.boardRows } as CSSProperties}>
              <GameCanvas mode={selectedMode} onSnapshot={handleSnapshot} onGameOver={handleGameOver} onEvent={handleEvent} screenShakeEnabled={settings.screenShakeEnabled} command={command} inputLocked={result !== null || showGuide} />
              {tutorialText && <div className="tutorial-banner">{tutorialText}</div>}
              {snapshot.status === 'ready' && !result && (
                <div className="overlay start-card">
                  <p>{GAME_MODES[selectedMode].name}</p>
                  <strong>{selectedMode === 'puzzle' && puzzleProgress ? `第 ${puzzleProgress.level} 关` : selectedMode === 'rush' ? '开路' : '开始'}</strong>
                  <span>
                    {selectedMode === 'puzzle' && snapshot.dailyChallengeText
                      ? snapshot.dailyChallengeText
                      : selectedMode === 'rush'
                        ? '45 秒短局冲刺，边吃边长，空格沿当前方向直线清障。'
                        : GAME_MODES[selectedMode].description}
                  </span>
                  <button data-nav-button="true" onClick={() => issueCommand('start')} type="button">
                    {selectedMode === 'puzzle' ? '开始闯关' : selectedMode === 'rush' ? '开始冲刺' : '开始游戏'}
                  </button>
                </div>
              )}
              {snapshot.status === 'paused' && <div className="overlay">已暂停</div>}
              {snapshot.status === 'upgrade' && (
                <div className="overlay upgrade-card">
                  <p>选一个本局强化</p>
                  <div className="upgrade-grid">
                    {snapshot.upgradeChoices.map((choice, index) => (
                      <button className={`upgrade-option rarity-${choice.rarity}${selectedUpgradeIndex === index ? ' selected' : ''}`} data-nav-button="true" key={choice.id + index} onClick={() => issueCommand(`upgrade-${index}` as Command)} type="button">
                        <div className="upgrade-option-top">
                          <strong className={`upgrade-title rarity-text-${choice.rarity}`}>{choice.title}</strong>
                        </div>
                        <span className="upgrade-effect">{choice.effectText}</span>
                        <span className="upgrade-desc">{choice.description}</span>
                      </button>
                    ))}
                  </div>
                  <span>方向键选择，回车确认</span>
                </div>
              )}
              {snapshot.status === 'resume' && (
                <div className="overlay resume-card">
                  <p>准备继续</p>
                  <div className="resume-visual" data-step={snapshot.resumeCountdownSeconds ?? 3}>
                    <div className="resume-ring">
                      <strong className="resume-digit" key={snapshot.resumeCountdownSeconds ?? 3}>{snapshot.resumeCountdownSeconds ?? 3}</strong>
                    </div>
                    <div className="resume-track" aria-hidden="true">
                      <div className="resume-fill" style={{ width: `${resumePercent}%` }} />
                    </div>
                    <div className="resume-ticks" aria-hidden="true">
                      {[3, 2, 1].map((step) => (
                        <span className={step === (snapshot.resumeCountdownSeconds ?? 3) ? 'active' : ''} key={step}>
                          {step}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span>3 秒后自动继续，或按方向键立刻出发</span>
                </div>
              )}
              {showGuide && (
                <div className="overlay guide-card">
                  <p>玩法示例</p>
                  {selectedMode === 'rush' ? (
                    <>
                      <div className="demo-chain" aria-label="rush guide"><span className="demo-dot yellow" /><span className="demo-dot yellow" /><span className="demo-dot red pop" /><span className="demo-dot red pop" /><span className="demo-dot green" /></div>
                      <span>前方被障碍挡住时，先用空格开路，再转向吃块。开掉的障碍会直接换成分数。</span>
                    </>
                  ) : (
                    <>
                      <div className="demo-chain" aria-label="红绿红红红示例"><span className="demo-dot red" /><span className="demo-dot green" /><span className="demo-dot red" /><span className="demo-dot red pop" /><span className="demo-dot red pop" /></div>
                      <span>吃到的颜色会进入蛇尾。尾巴最后 3 节同色，就会一起消除。</span>
                    </>
                  )}
                  <button data-nav-button="true" onClick={() => setShowGuide(false)} type="button">明白了</button>
                </div>
              )}
              {result && (
                <div className="overlay result-card">
                  <p>{result.objectiveCompleted ? '目标完成' : '本局结束'}</p>
                  <strong>{result.score}</strong>
                  <span>
                    {result.mode === 'daily' && result.dailyChallengeText
                      ? result.dailyChallengeText
                      : result.mode === 'puzzle'
                        ? `${result.objectiveCompleted ? '本关通过' : '本关失败'} · 已吃掉 ${result.eliminated} 个方向目标 · 共走 ${result.stepsUsed} 步`
                        : result.mode === 'rush'
                          ? `${result.objectiveCompleted ? '开路成功' : '冲刺结束'} · 已清 ${result.rushClearedObstacles ?? 0} 格障碍 · 共走 ${result.stepsUsed} 步`
                          + ` · 技能 ${result.rushSkillUses ?? 0} 次`
                          : `长度 ${result.finalLength} · Combo x${Math.max(1, result.maxCombo)} · 消除 ${result.eliminated} 节`}
                  </span>
                  {result.mode === 'puzzle' && result.puzzleOptimalSteps !== undefined && (
                    <div className={`daily-result-banner puzzle-steps${puzzleOptimalReached ? ' success' : ''}`}>
                      最优 {result.puzzleOptimalSteps} 步 · 你用了 {result.stepsUsed} 步
                      {result.objectiveCompleted
                        ? result.puzzleStepDelta && result.puzzleStepDelta > 0
                          ? ` · 多了 ${result.puzzleStepDelta} 步`
                          : ' · 已达最优'
                        : ''}
                    </div>
                  )}
                  {puzzleChapterCleared && (
                    <div className="daily-result-banner success">首章完成</div>
                  )}
                  {result.mode === 'daily' && (
                    <div className={`daily-result-banner${result.objectiveCompleted ? ' success' : ''}`}>
                      {result.objectiveCompleted ? '今日挑战达成' : '今日挑战未达成'}
                    </div>
                  )}
                  {result.unlockedStickerLabel && (
                    <div className="daily-result-banner success">已解锁 {result.unlockedStickerLabel}</div>
                  )}
                  {result.mode !== 'puzzle' && result.mode !== 'rush' && (
                    <div className="result-summary">
                      <div className="result-chip">任务 {result.missionStates.filter((item) => item.completed).length}/{result.missionStates.length || 0}</div>
                      <div className="result-chip">强化 {result.selectedUpgrades.length}</div>
                      <div className="result-chip">最高 Combo x{Math.max(1, result.maxCombo)}</div>
                      <div className="result-chip">贴纸 {stickers.length}/{stickerDefinitions.length}</div>
                    </div>
                  )}
                  {result.mode === 'rush' && (
                    <div className="result-summary">
                      <div className="result-chip">清障 {result.rushClearedObstacles ?? 0}</div>
                      <div className="result-chip">技能 {result.rushSkillUses ?? 0}</div>
                      <div className="result-chip">长度 {result.finalLength}</div>
                      <div className="result-chip">最高 Combo x{Math.max(1, result.maxCombo)}</div>
                    </div>
                  )}
                  {result.mode !== 'puzzle' && result.mode !== 'rush' && result.selectedUpgrades.length > 0 && (
                    <div className="result-upgrades">
                      {result.selectedUpgrades.slice(-4).map((upgrade, index) => (
                        <span className={`result-upgrade-chip rarity-${upgrade.rarity}`} key={upgrade.id + index}>{upgrade.title}</span>
                      ))}
                    </div>
                  )}
                  {result.mode === 'puzzle' ? (
                    <div className="result-actions">
                      <button data-nav-button="true" onClick={replayPuzzleLevel} type="button">
                        {puzzleChapterCleared ? '重玩首章' : '重玩本关'}
                      </button>
                      {result.objectiveCompleted && !puzzleChapterCleared && (
                        <button data-nav-button="true" onClick={nextPuzzleLevel} type="button">下一关</button>
                      )}
                    </div>
                  ) : (
                    <button data-nav-button="true" onClick={replay} type="button">再来一局</button>
                  )}
                </div>
              )}
            </div>
          </div>

          {settings.virtualPadEnabled && (
            <aside className="virtual-pad panel" aria-label="移动端方向键">
              <button className="up" data-nav-button="true" onClick={() => issueCommand('up')} type="button">上</button>
              <button className="left" data-nav-button="true" onClick={() => issueCommand('left')} type="button">左</button>
              {selectedMode === 'rush' && (
                <button className="skill" data-nav-button="true" onClick={() => issueCommand('skill')} type="button">
                  {rushSkillReady ? '开路' : rushCooldownText}
                </button>
              )}
              <button className="right" data-nav-button="true" onClick={() => issueCommand('right')} type="button">右</button>
              <button className="down" data-nav-button="true" onClick={() => issueCommand('down')} type="button">下</button>
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

function getCurrentModeSummary(
  mode: GameModeId,
  snapshot: GameSnapshot,
  context: {
    puzzleProgress: ReturnType<typeof parsePuzzleObjective>;
    rushSkillReady: boolean;
    rushCooldownText: string;
    dailyStatus: { completed: boolean; bestScore: number };
  },
): { copy: string; pills: string[] } {
  if (mode === 'puzzle') {
    return {
      copy: '先读图，再转向，路线和吃入方向都要提前想好。',
      pills: [
        context.puzzleProgress?.chapterText ?? '首章关卡',
        context.puzzleProgress ? `${context.puzzleProgress.cleared}/${context.puzzleProgress.total} 目标` : '方向目标',
        `${snapshot.stepsUsed} 步`,
      ],
    };
  }

  if (mode === 'rush') {
    return {
      copy: '45 秒短局开路冲刺，清障时机比硬闯更重要。',
      pills: [
        context.rushSkillReady ? '技能就绪' : `冷却 ${context.rushCooldownText}`,
        `清障 ${snapshot.rushClearedObstacles ?? 0}`,
        `技能 ${snapshot.rushSkillUses ?? 0} 次`,
      ],
    };
  }

  if (mode === 'daily') {
    return {
      copy: '每天一套固定规则和目标，打一把就能知道今天状态。',
      pills: [
        context.dailyStatus.completed ? '今日已达成' : '今日未达成',
        `今日最高 ${context.dailyStatus.bestScore}`,
        `${snapshot.missionStates.filter((item) => item.completed).length}/${snapshot.missionStates.length} 任务`,
      ],
    };
  }

  if (mode === 'sprint') {
    return {
      copy: '主玩法短局冲分，靠三消返时和强化把节奏滚起来。',
      pills: [
        `${snapshot.combo > 1 ? `Combo x${snapshot.combo}` : '等一波连消'}`,
        `${snapshot.missionStates.filter((item) => item.completed).length}/${snapshot.missionStates.length} 任务`,
        `${snapshot.selectedUpgrades.length} 强化`,
      ],
    };
  }

  if (mode === 'endless') {
    return {
      copy: '不设终点，靠走位、补色和尾巴管理撑更久。',
      pills: [`长度 ${snapshot.length}`, `最高 ${snapshot.bestScore}`, `最长 ${snapshot.bestSurvivalSeconds}s`],
    };
  }

  if (mode === 'precision') {
    return {
      copy: '围绕目标长度做精确控制，长短都不能失手。',
      pills: [`当前长度 ${snapshot.length}`, `最高 Combo x${Math.max(1, snapshot.maxCombo)}`, `${snapshot.stepsUsed} 步`],
    };
  }

  if (mode === 'timed') {
    return {
      copy: '快节奏压缩局，分数和消除都要一起追。',
      pills: [`${snapshot.score} 分`, `${snapshot.eliminated} 消除`, `${snapshot.remainingSeconds ?? 0}s`],
    };
  }

  if (mode === 'steps') {
    return {
      copy: '步数有限，更看重规划顺序和每一步价值。',
      pills: [`${snapshot.stepsUsed} 步`, `${snapshot.eliminated} 消除`, `长度 ${snapshot.length}`],
    };
  }

  return {
    copy: '经典模式更平衡，适合熟悉补色、尾消和滚雪球节奏。',
    pills: [`${snapshot.score} 分`, `长度 ${snapshot.length}`, `最高 Combo x${Math.max(1, snapshot.maxCombo)}`],
  };
}

function getTutorialText(snapshot: GameSnapshot, tutorialDone: boolean): string | null {
  if (tutorialDone || snapshot.status === 'gameover') return null;
  if (snapshot.mode === 'puzzle') {
    if (snapshot.status === 'ready') return '按方向键开始，每次都要用正确朝向进入目标格。';
    if (snapshot.eliminated === 0) return '先对准方向，再撞进第一个紫色目标格。';
    return '继续读图前进，撞墙或用错方向都会直接失败。';
  }
  if (snapshot.mode === 'rush') {
    if (snapshot.status === 'ready') return '方向键冲刺，空格或按钮可沿当前方向直线清障。';
    if ((snapshot.rushClearedObstacles ?? 0) === 0) return '前方有障碍时立刻开路，别等贴脸再按技能。';
    return '边开路边吃块，顺手打出尾巴三消能让分数涨得更快。';
  }
  if (snapshot.status === 'upgrade') return '完成两次三消后，可以选一个本局强化。';
  if (snapshot.eaten === 0) return '吃到色块后，蛇尾会长出对应颜色。';
  if (snapshot.eaten < 3) return '观察尾巴颜色，最后 3 节同色才会消除。';
  if (snapshot.eliminated === 0) return '尾巴已有两节同色时，再吃同色就能消掉尾巴。';
  return null;
}

function parsePuzzleObjective(objectiveText: string): {
  level: number;
  levelTotal: number;
  levelName: string;
  cleared: number;
  total: number;
  chapterText: string;
} | null {
  const match = objectiveText.match(/第\s*(\d+)\/(\d+)\s*关\s*·\s*(.*?)\s*·\s*(\d+)\/(\d+)/);
  if (!match) return null;

  return {
    level: Number(match[1]),
    levelTotal: Number(match[2]),
    levelName: match[3],
    cleared: Number(match[4]),
    total: Number(match[5]),
    chapterText: `第 ${match[1]}/${match[2]} 关`,
  };
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
  const frequency = type === 'eat' ? 520 : type === 'eliminate' ? 820 : type === 'powerup' ? 660 : type === 'upgrade' ? 740 : type === 'mission' ? 700 : 180;
  const duration = type === 'eliminate' ? 0.14 : type === 'upgrade' || type === 'mission' ? 0.12 : 0.08;
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
