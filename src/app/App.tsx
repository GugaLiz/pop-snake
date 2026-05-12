import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { GAME_CONFIG, GAME_MODES, type GameModeId } from '../config/gameConfig';
import { GameCanvas } from './GameCanvas';
import type { Direction, GameEvent, GameResult, GameSnapshot } from '../game/types';
import { getDirectionColorGuideText } from '../game/modes/directionColorRules';
import { getModeGuide } from '../game/guides/modeGuides';
import {
  getDailyChallengeStatus,
  getDailyStreakStatus,
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
  mode: 'brawl',
  objectiveText: '目标：连续闯 11 段递进小关，完整展示全部玩法',
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
  'direction-color': { tone: 'legendary', tag: '染色' },
  'timed-color': { tone: 'legendary', tag: '变色' },
  brawl: { tone: 'mythic', tag: '乱斗' },
};

const FEATURED_MODE: GameModeId = 'brawl';
const MODE_GROUPS: Array<{ id: string; title: string; modes: GameModeId[] }> = [
  { id: 'tail', title: '蛇尾与日常', modes: ['sprint', 'daily'] },
  { id: 'route', title: '解谜与破阵', modes: ['puzzle', 'rush'] },
  { id: 'color', title: '颜色规则', modes: ['direction-color', 'timed-color'] },
  { id: 'classic', title: '经典规则', modes: ['standard', 'endless', 'timed', 'steps', 'precision'] },
];

const COLOR_MODES: GameModeId[] = ['direction-color', 'timed-color'];

export function App() {
  const stickerDefinitions = getStickerDefinitions();
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);
  const [selectedMode, setSelectedMode] = useState<GameModeId>(FEATURED_MODE);
  const [result, setResult] = useState<GameResult | null>(null);
  const [settings, setSettings] = useState(getSettings);
  const [tutorialDone, setTutorialDone] = useState(hasTutorialCompleted);
  const [showGuide, setShowGuide] = useState(false);
  const [dailyStatus, setDailyStatus] = useState({ completed: false, bestScore: 0 });
  const [dailyStreak, setDailyStreak] = useState(getDailyStreakStatus);
  const [stickers, setStickers] = useState(getStickerCollection);
  const [selectedUpgradeIndex, setSelectedUpgradeIndex] = useState(0);
  const [expandedModeGroups, setExpandedModeGroups] = useState<Record<string, boolean>>({});
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
    setDailyStreak(getDailyStreakStatus());
    setStickers(getStickerCollection());
  }, [snapshot.dailyChallengeKey, result]);

  useEffect(() => {
    setStickers(getStickerCollection());
  }, [result]);

  useEffect(() => {
    const activeGroup = MODE_GROUPS.find((group) => group.modes.includes(selectedMode));
    if (!activeGroup) return;
    setExpandedModeGroups((current) => current[activeGroup.id] ? current : { ...current, [activeGroup.id]: true });
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
    if (mode === selectedMode) {
      if (result !== null || snapshot.status === 'gameover') restart();
      return;
    }
    setResult(null);
    setSelectedMode(mode);
  };

  const toggleModeGroup = (groupId: string) => {
    setExpandedModeGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
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
  const modeGuide = getModeGuide(selectedMode);
  const resumePercent = Math.max(0, Math.min(100, Math.round((snapshot.resumeCountdownProgress ?? 0) * 100)));
  const puzzleProgress = selectedMode === 'puzzle' ? parsePuzzleObjective(snapshot.objectiveText) : null;
  const rushSkillReady = Boolean(snapshot.rushSkillReady);
  const rushCooldownText = snapshot.rushSkillCooldownSeconds ? `${snapshot.rushSkillCooldownSeconds}s` : '就绪';
  const isSelectedColorMode = COLOR_MODES.includes(selectedMode);
  const isActiveColorMode = isSelectedColorMode || snapshot.directionColorCurrentLabel !== undefined;
  const isActiveRushMode = selectedMode === 'rush' || snapshot.rushSkillReady !== undefined;
  const comboActive = selectedMode !== 'puzzle' && snapshot.combo > 1;
  const currentModeSummary = getCurrentModeSummary(selectedMode, snapshot, {
    puzzleProgress,
    rushSkillReady,
    rushCooldownText,
    dailyStatus,
    dailyStreak,
  });
  const statusMessages = [
    snapshot.isDanger ? '蛇身变长了，尽快凑尾巴三连消除。' : null,
    snapshot.isSlowed ? '减速生效中' : null,
    isActiveRushMode && snapshot.status === 'playing'
      ? rushSkillReady
          ? snapshot.rushShotPreviewText
          ? `射击：${snapshot.rushShotPreviewText}`
          : '射击已就绪，先三消装弹再破墙。'
        : `射击冷却中 · ${rushCooldownText}`
      : null,
    isActiveRushMode && snapshot.status === 'playing' && snapshot.rushBulletInventoryText
      ? `子弹 ${snapshot.rushBulletInventoryText}`
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
        const buttons = getButtons();
        if (active instanceof HTMLButtonElement && buttons.includes(active)) {
          event.preventDefault();
          active.click();
        } else {
          event.preventDefault();
          focusFirst();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => {
      const active = document.activeElement;
      const buttons = getButtons();
      if (!(active instanceof HTMLButtonElement) || !buttons.includes(active)) {
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
              <strong className="side-title">展示入口</strong>
              <div className="mode-select">
                {renderModeButton(FEATURED_MODE, selectedMode, changeMode)}
              </div>
            </div>
            {MODE_GROUPS.map((group) => {
              const expanded = Boolean(expandedModeGroups[group.id]);
              const hasActiveMode = group.modes.includes(selectedMode);
              return (
                <div className="mode-section" key={group.id}>
                  <button className={`more-modes-toggle${expanded ? ' active' : ''}${hasActiveMode ? ' has-active' : ''}`} data-nav-button="true" onClick={() => toggleModeGroup(group.id)} type="button">
                    <span className="more-modes-label">{group.title}</span>
                    <strong className="more-modes-state">{expanded ? '收起' : '展开'}</strong>
                  </button>
                  {expanded && (
                    <div className="mode-select grouped-mode-select">
                      {group.modes.map((modeId) => renderModeButton(modeId, selectedMode, changeMode))}
                    </div>
                  )}
                </div>
              );
            })}
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
              <div className={`metric${comboActive ? ' combo-hot' : ''}`}><span>{selectedMode === 'puzzle' ? '目标' : selectedMode === 'brawl' ? '关卡' : isActiveRushMode ? '核心' : isActiveColorMode ? '当前' : 'Combo'}</span><strong>{selectedMode === 'puzzle' && puzzleProgress ? `${puzzleProgress.cleared}/${puzzleProgress.total}` : selectedMode === 'brawl' ? `${snapshot.brawlStageIndex ?? 1}/${snapshot.brawlStageCount ?? 5}` : isActiveRushMode ? `${snapshot.rushCoresCollected ?? 0}+${snapshot.rushWaveCoresLeft ?? 0}` : isActiveColorMode ? `${snapshot.directionColorCurrentLabel ?? '粉'}` : `x${Math.max(1, snapshot.combo)}`}</strong></div>
              <div className="metric"><span>{selectedMode === 'sprint' || selectedMode === 'daily' ? '强化' : selectedMode === 'puzzle' ? '关卡' : selectedMode === 'brawl' ? '进度' : isActiveRushMode ? '子弹' : isActiveColorMode ? '下次' : '消除'}</span><strong>{selectedMode === 'sprint' || selectedMode === 'daily' ? snapshot.selectedUpgrades.length : selectedMode === 'puzzle' && puzzleProgress ? `${puzzleProgress.level}/${puzzleProgress.levelTotal}` : selectedMode === 'brawl' ? `${snapshot.brawlStageProgress ?? 0}/${snapshot.brawlStageTarget ?? 1}` : isActiveRushMode ? snapshot.rushBulletInventoryText ?? '无弹' : isActiveColorMode ? `${snapshot.directionColorNextLabel ?? '青'}` : snapshot.eliminated}</strong></div>
              <div className={`metric${comboActive ? ' combo-time-hot' : ''}`}><span>{selectedMode === 'puzzle' ? '步数' : snapshot.remainingSeconds !== undefined ? '剩余' : '时间'}</span><strong>{selectedMode === 'puzzle' ? `${snapshot.stepsUsed}步` : snapshot.remainingSeconds !== undefined ? `${snapshot.remainingSeconds}s` : `${snapshot.survivalSeconds}s`}</strong></div>
              {snapshot.stepsLeft !== undefined && <div className="metric"><span>步数</span><strong>{snapshot.stepsLeft}</strong></div>}
              <div className="records inline"><span>最高 {snapshot.bestScore}</span><span>最长 {snapshot.bestSurvivalSeconds}s</span></div>
              <div className={`controls-row inline-controls${isActiveRushMode ? ' rush-controls' : ''}`}>
                {snapshot.status === 'ready' ? <button data-nav-button="true" onClick={() => issueCommand('start')} type="button">开始</button> : <button data-nav-button="true" onClick={() => issueCommand('pause')} type="button">{snapshot.status === 'paused' ? '继续' : '暂停'}</button>}
                {isActiveRushMode && (
                  <button
                    className={snapshot.status === 'ready' || snapshot.status === 'gameover' ? 'reserved-control' : undefined}
                    data-nav-button={snapshot.status === 'ready' || snapshot.status === 'gameover' ? undefined : 'true'}
                    disabled={snapshot.status === 'ready' || snapshot.status === 'gameover'}
                    onClick={() => issueCommand('skill')}
                    type="button"
                  >
                    {rushSkillReady ? '射击' : `冷却 ${rushCooldownText}`}
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
                  <strong>{selectedMode === 'puzzle' && puzzleProgress ? `第 ${puzzleProgress.level} 关` : selectedMode === 'rush' ? '射击' : '开始'}</strong>
                  <span>
                    {selectedMode === 'puzzle' && snapshot.dailyChallengeText
                      ? snapshot.dailyChallengeText
                      : selectedMode === 'rush'
                        ? `45 秒内破墙吃核心续命；三消装颜色子弹，同色一发击穿，异色三发破墙。`
                        : selectedMode === 'brawl'
                          ? '连续闯 11 段递进小关，完整展示标准、冲刺、解谜、染色、破阵、每日、限步、精准、限时和无尽。'
                        : selectedMode === 'direction-color'
                          ? `每次有效转向后按固定色序切换，只能吃同色食物：${getDirectionColorGuideText()}。`
                        : selectedMode === 'timed-color'
                          ? `蛇头每 5 秒自动按固定色序切换，只能吃当前同色食物：${getDirectionColorGuideText()}。`
                        : GAME_MODES[selectedMode].description}
                  </span>
                  <div className="start-guide">
                    {modeGuide.start.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <div className="start-actions">
                    <button data-nav-button="true" onClick={() => setShowGuide(true)} type="button">先看引导</button>
                    <button data-nav-button="true" onClick={() => issueCommand('start')} type="button">
                      {selectedMode === 'puzzle' ? '开始闯关' : selectedMode === 'rush' ? '开始冲刺' : selectedMode === 'brawl' ? '开始乱斗' : '开始游戏'}
                    </button>
                  </div>
                </div>
              )}
              {snapshot.status === 'paused' && <div className="overlay">已暂停</div>}
              {snapshot.brawlStageIntro && (
                <div className="overlay brawl-stage-card">
                  <p>下一关</p>
                  <strong>{snapshot.brawlStageLabel ?? '随机'}</strong>
                  <span>{snapshot.brawlStageIndex ?? 1}/{snapshot.brawlStageCount ?? 5} · 目标 {snapshot.brawlStageProgress ?? 0}/{snapshot.brawlStageTarget ?? 1}</span>
                  <div className="start-guide">
                    <span>{snapshot.brawlStageHint ?? '完成目标后自动进入下一关'}</span>
                    <span>按方向键可立刻开始</span>
                  </div>
                </div>
              )}
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
                  <p>{GAME_MODES[selectedMode].name}</p>
                  <strong>玩法引导</strong>
                  {renderGuideDemo(modeGuide.demo)}
                  <div className="guide-feature">
                    <span>模式特色</span>
                    <strong>{modeGuide.feature}</strong>
                  </div>
                  <span>{modeGuide.goal}</span>
                  <div className="guide-detail">
                    <div>
                      <strong>操作</strong>
                      <span>{modeGuide.controls}</span>
                    </div>
                    <div>
                      <strong>怎么玩</strong>
                      {modeGuide.steps.map((step) => (
                        <span key={step}>{step}</span>
                      ))}
                    </div>
                  </div>
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
                      : result.mode === 'brawl'
                        ? `${result.objectiveCompleted ? '乱斗通关' : '乱斗结束'} · 小关 ${Math.min(result.brawlStageIndex ?? 1, result.brawlStageCount ?? 5)}/${result.brawlStageCount ?? 5} · 当前 ${result.brawlStageLabel ?? '随机'} ${result.brawlStageProgress ?? 0}/${result.brawlStageTarget ?? 1}`
                      : result.mode === 'puzzle'
                        ? `${result.objectiveCompleted ? '本关通过' : '本关失败'} · 已吃掉 ${result.eliminated} 个方向目标 · 共走 ${result.stepsUsed} 步`
                        : result.mode === 'rush'
                          ? `${(result.rushCoresCollected ?? 0) > 0 ? '破阵结束' : '未破阵'} · 核心 ${result.rushCoresCollected ?? 0} · 已清 ${result.rushClearedObstacles ?? 0} 格墙 · 射击 ${result.rushSkillUses ?? 0} 次`
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
                      {result.objectiveCompleted
                        ? `今日挑战达成 · 连续 ${dailyStreak.currentStreak} 天 · 最长 ${dailyStreak.bestStreak} 天`
                        : `今日挑战未达成 · 今日最高 ${dailyStatus.bestScore}`}
                    </div>
                  )}
                  {result.unlockedStickerLabel && (
                    <div className="daily-result-banner success">已解锁 {result.unlockedStickerLabel}</div>
                  )}
                  {result.mode !== 'puzzle' && result.mode !== 'rush' && result.mode !== 'brawl' && (
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
                      <div className="result-chip">核心 {result.rushCoresCollected ?? 0}</div>
                      <div className="result-chip">最大破阵 {result.rushBestLineClear ?? 0}</div>
                      <div className="result-chip">技能 {result.rushSkillUses ?? 0}</div>
                      <div className="result-chip">同色 {result.rushSameColorClears ?? 0}</div>
                      <div className="result-chip">异色 {result.rushOffColorBreaks ?? 0}</div>
                      <div className="result-chip">最高 Combo x{Math.max(1, result.maxCombo)}</div>
                    </div>
                  )}
                  {result.mode === 'brawl' && (
                    <div className="result-summary">
                      <div className="result-chip">小关 {Math.min(result.brawlStageIndex ?? 1, result.brawlStageCount ?? 5)}/{result.brawlStageCount ?? 5}</div>
                      <div className="result-chip">当前 {result.brawlStageLabel ?? '随机'}</div>
                      <div className="result-chip">进度 {result.brawlStageProgress ?? 0}/{result.brawlStageTarget ?? 1}</div>
                      <div className="result-chip">最高 Combo x{Math.max(1, result.maxCombo)}</div>
                    </div>
                  )}
                  {result.mode !== 'puzzle' && result.mode !== 'rush' && result.mode !== 'brawl' && result.selectedUpgrades.length > 0 && (
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
              {isActiveRushMode && (
                <button className="skill" data-nav-button="true" onClick={() => issueCommand('skill')} type="button">
                  {rushSkillReady ? '射击' : rushCooldownText}
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

function renderModeButton(
  modeId: GameModeId,
  selectedMode: GameModeId,
  changeMode: (mode: GameModeId) => void,
) {
  const mode = GAME_MODES[modeId];
  return (
    <button className={`mode-button rarity-${MODE_LABELS[mode.id].tone}${mode.id === selectedMode ? ' active' : ''}`} data-nav-button="true" key={mode.id} onClick={() => changeMode(mode.id)} type="button">
      <span className={`mode-tag rarity-${MODE_LABELS[mode.id].tone}`}>{MODE_LABELS[mode.id].tag}</span>
      <strong>{mode.name}</strong>
    </button>
  );
}

function renderGuideDemo(kind: ReturnType<typeof getModeGuide>['demo']) {
  if (kind === 'rush') {
    return (
      <div className="demo-chain" aria-label="rush guide">
        <span className="demo-dot yellow" />
        <span className="demo-wall" />
        <span className="demo-wall broken" />
        <span className="demo-core" />
        <span className="demo-dot green" />
      </div>
    );
  }

  if (kind === 'color') {
    return (
      <div className="demo-chain" aria-label="color guide">
        <span className="demo-dot red" />
        <span className="demo-dot mint" />
        <span className="demo-dot yellow" />
        <span className="demo-dot green" />
      </div>
    );
  }

  if (kind === 'puzzle') {
    return (
      <div className="demo-chain" aria-label="puzzle guide">
        <span className="demo-arrow">↑</span>
        <span className="demo-dot mint" />
        <span className="demo-arrow">→</span>
        <span className="demo-dot yellow" />
        <span className="demo-arrow">↓</span>
      </div>
    );
  }

  if (kind === 'brawl') {
    return (
      <div className="demo-chain" aria-label="brawl guide">
        <span className="demo-mode-chip">冲刺</span>
        <span className="demo-mode-chip">解谜</span>
        <span className="demo-mode-chip">破阵</span>
        <span className="demo-mode-chip">染色</span>
      </div>
    );
  }

  if (kind === 'precision') {
    return (
      <div className="demo-chain" aria-label="precision guide">
        <span className="demo-target">目标 9</span>
        <span className="demo-dot green" />
        <span className="demo-dot red pop" />
        <span className="demo-target">刚好</span>
      </div>
    );
  }

  if (kind === 'steps') {
    return (
      <div className="demo-chain" aria-label="steps guide">
        <span className="demo-target">80步</span>
        <span className="demo-dot yellow" />
        <span className="demo-dot yellow" />
        <span className="demo-dot yellow pop" />
      </div>
    );
  }

  if (kind === 'timed') {
    return (
      <div className="demo-chain" aria-label="timed guide">
        <span className="demo-target">60s</span>
        <span className="demo-dot red" />
        <span className="demo-dot red pop" />
        <span className="demo-dot mint" />
      </div>
    );
  }

  if (kind === 'endless') {
    return (
      <div className="demo-chain" aria-label="endless guide">
        <span className="demo-target">穿墙</span>
        <span className="demo-dot green" />
        <span className="demo-dot mint" />
        <span className="demo-target">回环</span>
      </div>
    );
  }

  return (
    <div className="demo-chain" aria-label="tail guide">
      <span className="demo-dot red" />
      <span className="demo-dot green" />
      <span className="demo-dot red" />
      <span className="demo-dot red pop" />
      <span className="demo-dot red pop" />
    </div>
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
    dailyStreak: { currentStreak: number; bestStreak: number };
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
      copy: '45 秒内吃核心续命，三消装颜色子弹，同色一发破墙，异色三发硬破。',
      pills: [
        `核心 ${snapshot.rushCoresCollected ?? 0} · 本波 ${snapshot.rushWaveCoresLeft ?? 0}`,
        `第 ${snapshot.rushWave ?? 1} 波`,
        snapshot.rushBulletInventoryText ?? '子弹 粉0 青0 黄0 绿0',
        snapshot.rushShotPreviewText ?? (context.rushSkillReady ? '射击就绪' : `冷却 ${context.rushCooldownText}`),
        `最大破阵 ${snapshot.rushBestLineClear ?? 0}`,
      ],
    };
  }

  if (mode === 'brawl') {
    return {
      copy: '全模式巡回赛，按递进顺序连续展示每种玩法。',
      pills: [
        `${snapshot.brawlStageLabel ?? '随机'} ${snapshot.brawlStageIndex ?? 1}/${snapshot.brawlStageCount ?? 5}`,
        `进度 ${snapshot.brawlStageProgress ?? 0}/${snapshot.brawlStageTarget ?? 1}`,
        `${snapshot.remainingSeconds ?? 180}s`,
      ],
    };
  }

  if (mode === 'direction-color') {
    return {
      copy: '每次有效转向后按固定色序切换，只能吃同色食物。',
      pills: [
        getDirectionColorGuideText(),
        `当前 ${snapshot.directionColorCurrentLabel ?? '粉'} / 下次 ${snapshot.directionColorNextLabel ?? '青'}`,
        `${snapshot.remainingSeconds ?? 75}s`,
      ],
    };
  }

  if (mode === 'timed-color') {
    return {
      copy: '每 5 秒自动变色，提前找好下一种颜色的位置。',
      pills: [
        getDirectionColorGuideText(),
        `当前 ${snapshot.directionColorCurrentLabel ?? '粉'} / 下次 ${snapshot.directionColorNextLabel ?? '青'}`,
        `${snapshot.remainingSeconds ?? 75}s`,
      ],
    };
  }

  if (mode === 'daily') {
    return {
      copy: '每天一套固定规则和目标，打一把就能知道今天状态。',
      pills: [
        context.dailyStatus.completed ? '今日已达成' : '今日未达成',
        `今日最高 ${context.dailyStatus.bestScore}`,
        `连续 ${context.dailyStreak.currentStreak} 天`,
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
    if (snapshot.status === 'ready') return '方向目标要按箭头吃，普通色块可用来补尾巴和凑三消。';
    if (snapshot.eliminated === 0) return '先对准方向目标；路上的普通色块可以吃，但不计入过关。';
    return '清空所有方向目标即可过关，普通色块只是辅助资源。';
  }
  if (snapshot.mode === 'rush') {
    if (snapshot.status === 'ready') return `三消会装入对应颜色子弹，同色一发破墙，异色三发破墙。`;
    if ((snapshot.rushCoresCollected ?? 0) === 0) return '先三消装弹，再对准同色围墙射击，吃到核心会加 30 秒。';
    return '吃核心会续命并刷新下一波，双核心时墙色一定不同。';
  }
  if (snapshot.mode === 'brawl') {
    if (snapshot.status === 'ready') return '大乱斗会连续闯 11 段递进小关，每关保留对应玩法特色。';
    return `${snapshot.brawlStageLabel ?? '随机'}小关：完成 ${snapshot.brawlStageProgress ?? 0}/${snapshot.brawlStageTarget ?? 1} 后进入下一关。`;
  }
  if (snapshot.mode === 'direction-color') {
    if (snapshot.status === 'ready') return `每次有效转向后按固定色序切换：${getDirectionColorGuideText()}。`;
    if (snapshot.eaten === 0) return '先通过转向切到目标颜色，再去吃同色食物。';
    if (snapshot.eaten < 3) return '色序固定可预判，提前规划下一次转向。';
    if (snapshot.eliminated === 0) return '让最后 3 节尾巴同色，就能完成消除。';
  }
  if (snapshot.mode === 'timed-color') {
    if (snapshot.status === 'ready') return `蛇头每 5 秒自动变色：${getDirectionColorGuideText()}。`;
    if (snapshot.eaten === 0) return '先盯住当前颜色，等快变色时提前转向找下一色。';
    if (snapshot.eaten < 3) return '变色节奏固定，看到下次颜色后提前预留路线。';
    if (snapshot.eliminated === 0) return '吃对颜色也会长尾巴，尾巴三连同色可以消除。';
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
