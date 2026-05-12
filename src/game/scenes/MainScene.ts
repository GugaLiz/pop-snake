// @ts-nocheck
import * as Phaser from 'phaser';
import {
  GAME_CONFIG,
  GAME_MODES,
  BASIC_COLOR_IDS,
  getColorFill,
  type BasicSnakeColor,
  type FoodType,
  type GameModeConfig,
  type GameModeId,
  type SnakeColor,
} from '../../config/gameConfig';
import {
  getBestCombo,
  getBestScore,
  getBestSurvivalSeconds,
  saveDailyChallengeStatus,
  saveResult,
  unlockSticker,
} from '../../storage/localStorage';
import {
  DIRECTIONS,
  isOpposite,
  samePoint,
  type Direction,
  type Food,
  type GameEvent,
  type GameResult,
  type GameSnapshot,
  type MissionId,
  type MissionState,
  type Point,
  type Segment,
  type UpgradeChoice,
  type UpgradeId,
} from '../types';
import {
  createMissionStates as createMissionStatesFromSystem,
  getMissionDefinition,
  getMissionProgress as getMissionProgressFromSystem,
  type MissionDefinition,
} from '../systems/missions';
import {
  applyUpgradeEffect,
  createDefaultModifiers as createDefaultUpgradeModifiers,
  pickUpgradeChoices as pickUpgradeChoicesFromSystem,
  type UpgradeModifierState,
} from '../systems/upgrades';
import {
  createDailyChallenge,
  getDateKey,
  type DailyChallengeConfig,
} from '../systems/daily';
import {
  createFoodCandidate,
  refillFoodsToTarget,
  isCellFree as isCellFreeFromSystem,
  getTailTargetColor as getTailTargetColorFromSystem,
  regenerateTail as regenerateTailFromSystem,
  pickFoodType as pickFoodTypeFromSystem,
  pickNextFoodColor as pickNextFoodColorFromSystem,
} from '../systems/food';
import {
  calculateBoardLayout,
  isPointOutOfBounds,
  wrapBoardPoint,
} from '../core/board';
import {
  advanceSnake,
  getNextHeadPoint,
  resolveQueuedDirection,
} from '../core/snake';
import { PUZZLE_LEVELS, type PuzzleLevel } from '../puzzle/puzzleLevels';
import { isPuzzleWall } from '../puzzle/puzzleRules';
import { generateRushObstacleClusters, generateRushWaveObstacles } from '../rush/obstacles';
import {
  getV4ChallengeLevels,
  type V4ChallengeLevel,
} from '../challenges/v4Challenges';
import { V3_BALANCE } from '../../config/balance';
import {
  getComboRewardText,
  getEliminationScore,
  getModeSpeedBonus as getModeSpeedBonusFromRules,
  getSprintTimeAward,
  isSprintLikeMode,
  shouldOfferUpgrade,
} from '../modes/sprintRules';
import {
  getModeObjectiveText,
  hasReachedModeGoal,
} from '../modes/modeObjectives';
import {
  getDirectionCycleLabels,
  getDirectionCycleColorByTurn,
  isDirectionColorMode,
  isDirectionTurnColorMode,
  isTimedColorMode,
} from '../modes/directionColorRules';

type GameCallbacks = {
  onSnapshot?: (snapshot: GameSnapshot) => void;
  onGameOver?: (result: GameResult) => void;
  onEvent?: (event: GameEvent) => void;
};

type EffectSettings = {
  screenShakeEnabled: boolean;
};

type BrawlStageType = 'sprint' | 'puzzle' | 'rush' | 'direction-color' | 'timed-color';
type RushCore = Point & { id: number; color: BasicSnakeColor };
type RushObstacle = Point & { color: BasicSnakeColor; coreId: number };
type RushBulletInventory = Record<BasicSnakeColor, number>;
type RushWallDamage = Record<string, { hits: number; color: BasicSnakeColor }>;

const TIMED_COLOR_INTERVAL_MS = 5000;
const TIMED_COLOR_FLASH_WARNING_MS = 1200;

export class MainScene extends Phaser.Scene {
  private callbacks: GameCallbacks = {};
  private effectSettings: EffectSettings = { screenShakeEnabled: true };
  private mode: GameModeConfig = GAME_MODES.sprint;
  private snake: Segment[] = [];
  private foods: Food[] = [];
  private direction: Direction = 'right';
  private nextDirection: Direction = 'right';
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private eliminated = 0;
  private eaten = 0;
  private stepsUsed = 0;
  private objectiveCompleted = false;
  private lastEliminateAt = 0;
  private startAt = 0;
  private pausedDuration = 0;
  private pausedAt = 0;
  private resumeUntil = 0;
  private slowUntil = 0;
  private status: GameSnapshot['status'] = 'ready';
  private accumulator = 0;
  private cellSize = 44;
  private boardOrigin = { x: 0, y: 0 };
  private isSceneReady = false;
  private inputLocked = false;
  private graphics?: Phaser.GameObjects.Graphics;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private touchStart?: Phaser.Math.Vector2;
  private tailPulseUntil = 0;
  private sprintBonusMs = 0;
  private successfulEliminations = 0;
  private missionStates: MissionState[] = [];
  private selectedUpgrades: UpgradeChoice[] = [];
  private upgradeChoices: UpgradeChoice[] = [];
  private modifiers: UpgradeModifierState = this.createDefaultModifiers();
  private randomState = 1;
  private dailyChallenge?: DailyChallengeConfig;
  private puzzleLevelIndex = 0;
  private puzzleWalls: Point[] = [];
  private puzzleTip?: string;
  private puzzleTargetsCleared = 0;
  private rushObstacles: RushObstacle[] = [];
  private rushCores: RushCore[] = [];
  private rushNextCoreId = 1;
  private rushCoresCollected = 0;
  private rushWave = 1;
  private rushClearedObstacles = 0;
  private rushBestLineClear = 0;
  private rushSkillCooldownUntil = 0;
  private rushSkillUses = 0;
  private rushBullets: RushBulletInventory = this.createEmptyRushBullets();
  private rushWallDamage: RushWallDamage = {};
  private rushSameColorClears = 0;
  private rushOffColorBreaks = 0;
  private comboRewardText?: string;
  private comboRewardUntil = 0;
  private directionColorTurn = 0;
  private timedColorTurn = 0;
  private brawlStages: BrawlStageType[] = [];
  private brawlStageIndex = 0;
  private brawlStageType: BrawlStageType = 'sprint';
  private brawlStageStartScore = 0;
  private brawlStageStartEaten = 0;
  private brawlStageStartSeconds = 0;
  private brawlIntroUntil = 0;
  private brawlStageChallenge?: V4ChallengeLevel;

  constructor() {
    super('MainScene');
  }

  private createEmptyRushBullets(): RushBulletInventory {
    return {
      sun: 0,
      leaf: 0,
      mint: 0,
      berry: 0,
    };
  }

  public setCallbacks(callbacks: GameCallbacks): void {
    this.callbacks = callbacks;
  }

  public setEffectSettings(settings: EffectSettings): void {
    this.effectSettings = settings;
  }

  public setInputLocked(locked: boolean): void {
    this.inputLocked = locked;
  }

  public setMode(modeId: GameModeId): void {
    if (modeId !== this.mode.id && modeId !== 'puzzle') {
      this.puzzleLevelIndex = 0;
    }
    this.mode = GAME_MODES[modeId];
    if (!this.isSceneReady) return;
    this.resetGame();
  }

  public chooseUpgrade(index: number): void {
    if (this.status !== 'upgrade') return;
    const choice = this.upgradeChoices[index];
    if (!choice) return;

    this.selectedUpgrades = [...this.selectedUpgrades, choice];
    this.applyUpgrade(choice.id);
    this.upgradeChoices = [];
    this.status = 'resume';
    this.resumeUntil = this.time.now + 3000;
    this.callbacks.onEvent?.({ type: 'upgrade' });
    this.showFloatingText(choice.title, 0xfff06a);
    this.publishSnapshot();
  }

  init(data: GameCallbacks): void {
    if (data && Object.keys(data).length > 0) this.callbacks = data;
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard?.on('keydown', this.handleKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    });
    this.scale.on('resize', this.handleResize, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.handleResize();
    this.isSceneReady = true;
    this.resetGame();
  }

  update(_: number, delta: number): void {
    if (this.isBrawlMode() && this.status === 'playing' && this.time.now < this.brawlIntroUntil) {
      this.publishSnapshot();
      return;
    }

    if (this.status === 'resume') {
      this.publishSnapshot();
      if (this.time.now >= this.resumeUntil) {
        this.status = 'playing';
        this.pausedDuration += this.time.now - this.pausedAt;
        this.pausedAt = 0;
        this.resumeUntil = 0;
        this.publishSnapshot();
      }
      return;
    }
    if (this.status !== 'playing') return;

    this.updateTimedColorMode();
    if (this.shouldFlashTimedColorHead()) this.draw();

    this.checkModeEndConditions();
    if (this.status !== 'playing') return;

    this.accumulator += delta;
    const interval = this.getMoveInterval();
    while (this.accumulator >= interval && this.status === 'playing') {
      this.accumulator -= interval;
      this.step();
    }
  }

  public startGame(): void {
    if (this.inputLocked) return;
    if (this.status !== 'ready') return;
    this.status = 'playing';
    this.startAt = this.time.now;
    this.callbacks.onEvent?.({ type: 'start' });
    this.publishSnapshot();
  }

  public setDirection(direction: Direction): void {
    if (this.inputLocked) return;
    if (this.status === 'ready') this.startGame();
    if (this.isBrawlMode() && this.status === 'playing' && this.time.now < this.brawlIntroUntil) {
      this.brawlIntroUntil = 0;
      this.publishSnapshot();
    }
    if (this.status === 'upgrade') return;
    if (this.status === 'resume') {
      this.status = 'playing';
      this.pausedDuration += this.time.now - this.pausedAt;
      this.pausedAt = 0;
      this.resumeUntil = 0;
      this.publishSnapshot();
    }
    if (direction === this.nextDirection || isOpposite(this.direction, direction)) return;
    this.nextDirection = direction;
    if (this.isDirectionTurnColorRuleActive()) {
      this.directionColorTurn += 1;
      this.publishSnapshot();
    }
  }

  public activateSkill(): void {
    if (this.inputLocked) return;
    if (!this.isRushRuleActive()) return;
    if (this.status === 'ready') this.startGame();
    if (this.isBrawlMode() && this.status === 'playing' && this.time.now < this.brawlIntroUntil) {
      this.brawlIntroUntil = 0;
      this.publishSnapshot();
    }
    if (this.status !== 'playing') return;

    const remainingMs = this.rushSkillCooldownUntil - this.time.now;
    if (remainingMs > 0) {
      this.showFloatingText(`冷却 ${Math.ceil(remainingMs / 1000)}s`, 0x8ee7ff);
      this.publishSnapshot();
      return;
    }

    const shotColor = this.pickRushShotColor();
    if (!shotColor) {
      this.showFloatingText('需要三消装弹', 0xfff06a);
      this.publishSnapshot();
      return;
    }

    const head = this.snake[0];
    const { cleared, damaged, beamEnd } = this.resolveRushShot({
      origin: head,
      direction: this.direction,
      shotColor,
    });

    this.rushSkillUses += 1;
    this.rushBullets[shotColor] = Math.max(0, this.rushBullets[shotColor] - 1);
    this.rushSkillCooldownUntil = this.time.now + V3_BALANCE.rush.skillCooldownMs;

    if (cleared.length > 0) {
      this.rushObstacles = this.rushObstacles.filter(
        (obstacle) => !cleared.some((point) => samePoint(point, obstacle)),
      );
      cleared.forEach((point) => delete this.rushWallDamage[this.getPointKey(point)]);
      const score = this.getRushClearScore(cleared.length);
      this.rushClearedObstacles += cleared.length;
      this.rushBestLineClear = Math.max(this.rushBestLineClear, cleared.length);
      this.score += score;
      this.spawnRushBeam(head, beamEnd, cleared.length);
      this.showFloatingText(this.getRushClearLabel(cleared.length, score, shotColor, damaged), 0xfff06a);
      if (this.effectSettings.screenShakeEnabled) this.cameras.main.shake(90, 0.003);
      this.refillRushObstacles(V3_BALANCE.rush.waveObstacleCount + V3_BALANCE.rush.waveRandomObstacleCount);
    } else if (damaged.length > 0) {
      this.spawnRushBeam(head, beamEnd, 0);
      this.showFloatingText(`异色命中 ${damaged[0]?.hits ?? 1}/${V3_BALANCE.rush.offColorHitsToBreak}`, 0xffffff);
    } else {
      this.showFloatingText('前方畅通', 0xffffff);
    }

    this.draw();
    this.publishSnapshot();
  }

  private getRushClearScore(count: number): number {
    const base =
      count <= 1
        ? 30
        : count === 2
          ? 80
          : count === 3
            ? 150
            : count === 4
              ? 240
              : 350 + (count - 5) * 90;
    return base;
  }

  private getRushClearLabel(count: number, score: number, shotColor: BasicSnakeColor, damaged: { hits: number }[]): string {
    const prefix = count >= 5 ? '大破阵' : count >= 3 ? '漂亮破阵' : '射击';
    const kind = damaged.length > 0 ? '异色破墙' : `${this.getColorShortLabel(shotColor)}弹`;
    return `${prefix} ${count} +${score} ${kind}`;
  }

  private resolveRushShot(params: {
    origin: Point;
    direction: Direction;
    shotColor: BasicSnakeColor;
  }): { cleared: RushObstacle[]; damaged: Array<RushObstacle & { hits: number }>; beamEnd: Point } {
    const { origin, direction, shotColor } = params;
    const vector = DIRECTIONS[direction];
    const cleared: RushObstacle[] = [];
    const damaged: Array<RushObstacle & { hits: number }> = [];
    let cursor = { x: origin.x + vector.x, y: origin.y + vector.y };

    while (!isPointOutOfBounds(cursor, GAME_CONFIG.boardColumns, GAME_CONFIG.boardRows)) {
      const hit = this.rushObstacles.find((obstacle) => samePoint(obstacle, cursor));
      if (hit) {
        if (hit.color === shotColor) {
          cleared.push(hit);
          this.rushSameColorClears += 1;
        } else {
          const key = this.getPointKey(hit);
          const previous = this.rushWallDamage[key];
          const nextHits = previous?.color === shotColor ? previous.hits + 1 : 1;
          if (nextHits >= V3_BALANCE.rush.offColorHitsToBreak) {
            cleared.push(hit);
            this.rushOffColorBreaks += 1;
          } else {
            this.rushWallDamage[key] = { hits: nextHits, color: shotColor };
            damaged.push({ ...hit, hits: nextHits });
          }
        }
      }
      cursor = { x: cursor.x + vector.x, y: cursor.y + vector.y };
    }

    return { cleared, damaged, beamEnd: cursor };
  }

  private pickRushShotColor(): BasicSnakeColor | undefined {
    const firstWall = this.getFirstRushWallInDirection();
    if (firstWall && this.rushBullets[firstWall.color] > 0) return firstWall.color;

    return [...BASIC_COLOR_IDS]
      .filter((color) => this.rushBullets[color] > 0)
      .sort((a, b) => this.rushBullets[b] - this.rushBullets[a])[0];
  }

  private getFirstRushWallInDirection(): RushObstacle | undefined {
    const vector = DIRECTIONS[this.direction];
    let cursor = { x: this.snake[0].x + vector.x, y: this.snake[0].y + vector.y };
    while (!isPointOutOfBounds(cursor, GAME_CONFIG.boardColumns, GAME_CONFIG.boardRows)) {
      const hit = this.rushObstacles.find((obstacle) => samePoint(obstacle, cursor));
      if (hit) return hit;
      cursor = { x: cursor.x + vector.x, y: cursor.y + vector.y };
    }
    return undefined;
  }

  private getPointKey(point: Point): string {
    return `${point.x},${point.y}`;
  }

  public togglePause(): void {
    if (this.inputLocked) return;
    if (this.status === 'gameover' || this.status === 'ready' || this.status === 'upgrade' || this.status === 'resume') return;
    if (this.status === 'paused') {
      this.status = 'playing';
      this.pausedDuration += this.time.now - this.pausedAt;
    } else {
      this.status = 'paused';
      this.pausedAt = this.time.now;
    }
    this.publishSnapshot();
  }

  public restart(): void {
    if (this.mode.id === 'puzzle' && this.status === 'gameover' && this.objectiveCompleted) {
      this.puzzleLevelIndex =
        this.puzzleLevelIndex >= PUZZLE_LEVELS.length - 1
          ? 0
          : this.puzzleLevelIndex + 1;
    }
    this.resetGame();
  }

  public replayPuzzleLevel(): void {
    if (this.mode.id !== 'puzzle') return;
    this.resetGame();
  }

  public nextPuzzleLevel(): void {
    if (this.mode.id !== 'puzzle') return;
    this.puzzleLevelIndex =
      this.puzzleLevelIndex >= PUZZLE_LEVELS.length - 1
        ? 0
        : this.puzzleLevelIndex + 1;
    this.resetGame();
  }

  private createDefaultModifiers(): UpgradeModifierState {
    return createDefaultUpgradeModifiers();
  }

  private getDateKey(): string {
    return getDateKey();
  }

  private hashSeed(source: string): number {
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0) || 1;
  }

  private setRandomSeed(seed: number): void {
    this.randomState = seed || 1;
  }

  private nextRandom(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(this.nextRandom() * (max - min + 1)) + min;
  }


  private resetGame(): void {
    this.dailyChallenge =
      this.mode.id === 'daily'
        ? createDailyChallenge(this.getDateKey(), (source) => this.hashSeed(source))
        : undefined;
    this.setRandomSeed(this.hashSeed(`${this.mode.id}-${this.dailyChallenge?.key ?? Date.now().toString()}`));
    const midX = Math.floor(GAME_CONFIG.boardColumns / 2);
    const midY = Math.floor(GAME_CONFIG.boardRows / 2);
    this.snake = [
      { x: midX + 1, y: midY, color: 'leaf' },
      { x: midX, y: midY, color: 'mint' },
      { x: midX - 1, y: midY, color: 'sun' },
    ];
    this.foods = [];
    this.direction = 'right';
    this.nextDirection = 'right';
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.eliminated = 0;
    this.eaten = 0;
    this.stepsUsed = 0;
    this.objectiveCompleted = false;
    this.lastEliminateAt = 0;
    this.startAt = this.time.now;
    this.pausedDuration = 0;
    this.pausedAt = 0;
    this.slowUntil = 0;
    this.status = 'ready';
    this.accumulator = 0;
    this.sprintBonusMs = 0;
    this.successfulEliminations = 0;
    this.resumeUntil = 0;
    this.puzzleTargetsCleared = 0;
    this.puzzleWalls = [];
    this.puzzleTip = undefined;
    this.rushObstacles = [];
    this.rushCores = [];
    this.rushNextCoreId = 1;
    this.rushCoresCollected = 0;
    this.rushWave = 1;
    this.rushClearedObstacles = 0;
    this.rushBestLineClear = 0;
    this.rushSkillCooldownUntil = 0;
    this.rushSkillUses = 0;
    this.rushBullets = this.createEmptyRushBullets();
    this.rushWallDamage = {};
    this.rushSameColorClears = 0;
    this.rushOffColorBreaks = 0;
    this.comboRewardText = undefined;
    this.comboRewardUntil = 0;
    this.directionColorTurn = 0;
    this.timedColorTurn = 0;
    this.brawlStages = [];
    this.brawlStageIndex = 0;
    this.brawlStageType = 'sprint';
    this.brawlStageStartScore = 0;
    this.brawlStageStartEaten = 0;
    this.brawlStageStartSeconds = 0;
    this.brawlIntroUntil = 0;
    this.brawlStageChallenge = undefined;
    this.modifiers = this.createDefaultModifiers();
    if (this.dailyChallenge) {
      this.modifiers = { ...this.modifiers, ...this.dailyChallenge.modifiers };
    }
    this.selectedUpgrades = [];
    this.upgradeChoices = [];
    if (this.mode.id === 'puzzle') {
      this.setupPuzzleLevel();
    } else if (this.mode.id === 'rush') {
      this.setupRushMode();
    } else if (this.mode.id === 'brawl') {
      this.setupBrawlMode();
    } else {
      this.missionStates = this.createMissionStates();
      this.refillFoods();
    }
    this.draw();
    this.publishSnapshot();
  }

  private setupPuzzleLevel(): void {
    const level = this.getPuzzleLevel();
    this.direction = level.start.direction;
    this.nextDirection = level.start.direction;
    this.snake = this.createPuzzleSnake(level);
    const targetFoods = level.targets.map((target, index) => ({
      x: target.x,
      y: target.y,
      color: this.getPuzzleTargetColor(index),
      type: 'normal' as const,
      requiredDirection: target.direction,
      isPuzzleTarget: true,
    }));
    this.foods = [
      ...targetFoods,
      ...this.createPuzzleColorFoods(level, this.snake, targetFoods),
    ];
    this.puzzleWalls = level.walls;
    this.puzzleTip = level.tip;
    this.missionStates = [];
  }

  private setupRushMode(): void {
    this.missionStates = [];
    this.selectedUpgrades = [];
    this.upgradeChoices = [];
    this.rushBullets = this.createEmptyRushBullets();
    this.refillFoods();
    this.setupRushWave();
  }

  private setupBrawlMode(): void {
    this.missionStates = [];
    this.selectedUpgrades = [];
    this.upgradeChoices = [];
    const baseStages: BrawlStageType[] = ['sprint', 'puzzle', 'rush', 'direction-color', 'timed-color'];
    this.brawlStages = this.shuffleBrawlStages(baseStages);
    this.brawlStageIndex = 0;
    this.setupBrawlStage();
  }

  private shuffleBrawlStages(stages: BrawlStageType[]): BrawlStageType[] {
    const shuffled = [...stages];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.randomInt(0, index);
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  private setupBrawlStage(): void {
    this.brawlStageType = this.brawlStages[this.brawlStageIndex] ?? 'sprint';
    this.brawlStageChallenge = this.pickBrawlStageChallenge(this.brawlStageType);
    if (this.status === 'playing') {
      this.brawlIntroUntil = this.time.now + (this.brawlStageIndex === 0 ? 1600 : 2200);
    }
    this.brawlStageStartScore = this.score;
    this.brawlStageStartEaten = this.eaten;
    this.brawlStageStartSeconds = this.getSurvivalSeconds();
    this.foods = [];
    this.puzzleTargetsCleared = 0;
    this.puzzleWalls = [];
    this.puzzleTip = this.getBrawlStageTip();
    this.rushObstacles = [];
    this.rushCores = [];
    this.rushNextCoreId = 1;
    this.rushCoresCollected = 0;
    this.rushWave = 1;
    this.rushSkillCooldownUntil = 0;
    this.rushBullets = this.createEmptyRushBullets();
    this.rushWallDamage = {};
    this.rushSameColorClears = 0;
    this.rushOffColorBreaks = 0;
    this.directionColorTurn = 0;
    this.timedColorTurn = 0;
    this.resetSnakeForStage();

    if (this.isBrawlPuzzleStage()) {
      this.setupBrawlPuzzleStage();
      return;
    }
    if (this.isBrawlRushStage()) {
      this.refillFoods();
      this.setupRushWave();
      return;
    }
    this.refillFoods();
  }

  private pickBrawlStageChallenge(stage: BrawlStageType): V4ChallengeLevel | undefined {
    if (stage === 'sprint') {
      const levels = getV4ChallengeLevels('tail');
      return levels[Math.min(levels.length - 1, this.brawlStageIndex)];
    }
    if (stage === 'puzzle') {
      const levels = getV4ChallengeLevels('puzzle');
      return levels[Math.min(levels.length - 1, this.brawlStageIndex)];
    }
    if (stage === 'direction-color') {
      return getV4ChallengeLevels('color').find((level) => level.colorRule === 'direction');
    }
    if (stage === 'timed-color') {
      return getV4ChallengeLevels('color').find((level) => level.colorRule === 'timed');
    }
    return undefined;
  }

  private setupBrawlPuzzleStage(): void {
    const targetCount = this.brawlStageChallenge?.target ?? V3_BALANCE.brawl.puzzleTargetCount;
    const level = PUZZLE_LEVELS[this.brawlStageChallenge?.puzzleLevelIndex ?? ((this.brawlStageIndex * 2) % Math.min(PUZZLE_LEVELS.length, 6))] ?? PUZZLE_LEVELS[0];
    const targets = level.targets.slice(0, targetCount);
    this.foods = [
      ...targets.map((target) => ({
        x: target.x,
        y: target.y,
        color: target.color,
        type: 'normal' as FoodType,
        requiredDirection: target.requiredDirection,
        isPuzzleTarget: true,
      })),
      ...this.createPuzzleColorFoods(level, this.snake, []).slice(0, 4),
    ];
    this.puzzleWalls = level.walls.slice(0, 4);
  }

  private resetSnakeForStage(): void {
    const midX = Math.floor(GAME_CONFIG.boardColumns / 2);
    const midY = Math.floor(GAME_CONFIG.boardRows / 2);
    this.snake = [
      { x: midX + 1, y: midY, color: 'leaf' },
      { x: midX, y: midY, color: 'mint' },
      { x: midX - 1, y: midY, color: 'sun' },
    ];
    this.direction = 'right';
    this.nextDirection = 'right';
    this.accumulator = 0;
  }

  private setupRushWave(): void {
    const coreCount = this.isBrawlMode() ? 1 : this.randomInt(1, 2);
    const colors = this.shuffleRushColors().slice(0, coreCount);
    this.rushCores = [];
    this.rushObstacles = [];
    this.rushWallDamage = {};

    for (let index = 0; index < coreCount; index += 1) {
      const core = this.createRushCore(colors[index]);
      if (!core) continue;
      this.rushCores.push(core);
      const waveObstacles = generateRushWaveObstacles({
        core,
        wave: this.rushWave + index,
        columns: GAME_CONFIG.boardColumns,
        rows: GAME_CONFIG.boardRows,
        snakeHead: this.snake[0],
        snakeBody: this.snake,
        foods: [...this.foods, ...this.rushCores, ...this.rushObstacles],
        avoidDirection: this.direction,
        nextRandom: () => this.nextRandom(),
        randomInt: (min, max) => this.randomInt(min, max),
      }).map((point) => ({ ...point, color: core.color, coreId: core.id }));
      this.rushObstacles.push(...waveObstacles.filter((point) => !this.rushObstacles.some((obstacle) => samePoint(obstacle, point))));
    }

    this.refillRushObstacles(V3_BALANCE.rush.waveObstacleCount + V3_BALANCE.rush.waveRandomObstacleCount);
  }

  private createRushCore(color: BasicSnakeColor): RushCore | undefined {
    let bestCandidate: Point | undefined;
    let bestDistance = -1;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const point = {
        x: this.randomInt(4, GAME_CONFIG.boardColumns - 5),
        y: this.randomInt(4, GAME_CONFIG.boardRows - 5),
      };
      const distance = Math.abs(point.x - this.snake[0].x) + Math.abs(point.y - this.snake[0].y);
      if (distance < 18) continue;
      if (this.snake.some((segment) => samePoint(segment, point))) continue;
      if (this.foods.some((food) => samePoint(food, point))) continue;
      if (this.rushCores.some((core) => Math.abs(core.x - point.x) <= 9 && Math.abs(core.y - point.y) <= 7)) continue;
      if (this.rushObstacles.some((obstacle) => samePoint(obstacle, point))) continue;
      if (distance > bestDistance) {
        bestCandidate = point;
        bestDistance = distance;
      }
    }
    return bestCandidate ? { ...bestCandidate, color, id: this.rushNextCoreId++ } : undefined;
  }

  private shuffleRushColors(): BasicSnakeColor[] {
    const colors = [...BASIC_COLOR_IDS];
    for (let index = colors.length - 1; index > 0; index -= 1) {
      const swapIndex = this.randomInt(0, index);
      [colors[index], colors[swapIndex]] = [colors[swapIndex], colors[index]];
    }
    return colors;
  }

  private spawnRushObstacles(count: number): void {
    const core = this.rushCores.length > 0 ? this.rushCores[this.randomInt(0, this.rushCores.length - 1)] : undefined;
    if (!core) return;
    this.rushObstacles = [
      ...this.rushObstacles,
      ...generateRushObstacleClusters({
        count,
        columns: GAME_CONFIG.boardColumns,
        rows: GAME_CONFIG.boardRows,
        snakeHead: this.snake[0],
        snakeBody: this.snake,
        foods: [...this.foods, ...this.rushCores],
        existing: this.rushObstacles,
        avoidDirection: this.direction,
        nextRandom: () => this.nextRandom(),
        randomInt: (min, max) => this.randomInt(min, max),
      }).map((point) => ({ ...point, color: core.color, coreId: core.id })),
    ];
  }

  private refillRushObstacles(targetCount: number): void {
    if (!this.isRushRuleActive()) return;
    const missing = Math.max(0, targetCount - this.rushObstacles.length);
    if (missing > 0) this.spawnRushObstacles(missing);
  }

  private isBrawlMode(): boolean {
    return this.mode.id === 'brawl';
  }

  private isBrawlPuzzleStage(): boolean {
    return this.isBrawlMode() && this.brawlStageType === 'puzzle';
  }

  private isBrawlRushStage(): boolean {
    return this.isBrawlMode() && this.brawlStageType === 'rush';
  }

  private isBrawlDirectionColorStage(): boolean {
    return this.isBrawlMode() && this.brawlStageType === 'direction-color';
  }

  private isBrawlTimedColorStage(): boolean {
    return this.isBrawlMode() && this.brawlStageType === 'timed-color';
  }

  private isPuzzleRuleActive(): boolean {
    return this.mode.id === 'puzzle' || this.isBrawlPuzzleStage();
  }

  private isRushRuleActive(): boolean {
    return this.mode.id === 'rush' || this.isBrawlRushStage();
  }

  private isDirectionColorRuleActive(): boolean {
    return isDirectionColorMode(this.mode.id) || this.isBrawlDirectionColorStage() || this.isBrawlTimedColorStage();
  }

  private isDirectionTurnColorRuleActive(): boolean {
    return isDirectionTurnColorMode(this.mode.id) || this.isBrawlDirectionColorStage();
  }

  private isTimedColorRuleActive(): boolean {
    return isTimedColorMode(this.mode.id) || this.isBrawlTimedColorStage();
  }

  private spawnRushBeam(from: Point, to: Point, clearedCount: number): void {
    const start = this.cellCenter(from.x, from.y);
    const clampedEnd = {
      x: Phaser.Math.Clamp(to.x, 0, GAME_CONFIG.boardColumns - 1),
      y: Phaser.Math.Clamp(to.y, 0, GAME_CONFIG.boardRows - 1),
    };
    const end = this.cellCenter(clampedEnd.x, clampedEnd.y);
    const beam = this.add.graphics();
    beam.lineStyle(Math.max(8, this.cellSize * 0.28), 0xfff3a6, 0.92);
    beam.lineBetween(start.x, start.y, end.x, end.y);
    beam.lineStyle(Math.max(3, this.cellSize * 0.11), 0xffffff, 1);
    beam.lineBetween(start.x, start.y, end.x, end.y);

    const flash = this.add.text((start.x + end.x) / 2, (start.y + end.y) / 2, `+${clearedCount}`, {
      fontFamily: 'Trebuchet MS, Microsoft YaHei, sans-serif',
      fontSize: `${Math.max(18, Math.floor(this.cellSize * 0.68))}px`,
      fontStyle: 'bold',
      color: '#fff3a6',
      stroke: '#2d170d',
      strokeThickness: 5,
    });
    flash.setOrigin(0.5);

    this.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => beam.destroy(),
    });
    this.tweens.add({
      targets: flash,
      alpha: 0,
      y: flash.y - this.cellSize * 0.55,
      scale: 1.15,
      duration: 280,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  private getPuzzleLevel(): PuzzleLevel {
    return PUZZLE_LEVELS[this.puzzleLevelIndex] ?? PUZZLE_LEVELS[0];
  }

  private createPuzzleSnake(level: PuzzleLevel): Segment[] {
    const directionVector = DIRECTIONS[level.start.direction];
    const snake: Segment[] = [];
    const colors: SnakeColor[] = ['berry', 'sun', 'mint', 'leaf'];

    for (let index = 0; index < 4; index += 1) {
      snake.push({
        x: level.start.x - directionVector.x * index,
        y: level.start.y - directionVector.y * index,
        color: colors[index % colors.length],
      });
    }

    return snake;
  }

  private getPuzzleTargetColor(index: number): BasicSnakeColor {
    const palette: BasicSnakeColor[] = ['sun', 'leaf', 'mint', 'berry'];
    return palette[index % palette.length];
  }

  private createPuzzleColorFoods(level: PuzzleLevel, snake: Segment[], targetFoods: Food[]): Food[] {
    const colors: BasicSnakeColor[] = ['sun', 'leaf', 'mint', 'berry'];
    const count = this.getPuzzleColorFoodTargetCount(level);
    const foods: Food[] = [];
    const occupied = new Set<string>();
    const addOccupied = (point: Point) => occupied.add(`${point.x},${point.y}`);

    snake.forEach(addOccupied);
    targetFoods.forEach(addOccupied);
    level.walls.forEach(addOccupied);

    let state = this.hashSeed(`puzzle-bonus-${level.id}`);
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };

    let attempts = 0;
    while (foods.length < count && attempts < 260) {
      attempts += 1;
      const point = {
        x: Math.floor(next() * level.columns),
        y: Math.floor(next() * level.rows),
      };
      const key = `${point.x},${point.y}`;
      if (occupied.has(key)) continue;
      if (Math.abs(point.x - level.start.x) + Math.abs(point.y - level.start.y) < 4) continue;

      occupied.add(key);
      foods.push({
        ...point,
        color: colors[(foods.length + this.puzzleLevelIndex) % colors.length],
        type: 'normal',
        isPuzzleTarget: false,
      });
    }

    return foods;
  }

  private getPuzzleColorFoodTargetCount(level: PuzzleLevel): number {
    return Math.min(8, 3 + Math.ceil(level.targets.length / 2));
  }

  private refillPuzzleColorFoods(): void {
    if (this.mode.id !== 'puzzle') return;
    const level = this.getPuzzleLevel();
    const targetCount = this.getPuzzleColorFoodTargetCount(level);
    const currentCount = this.foods.filter((food) => !food.isPuzzleTarget).length;
    const missing = Math.max(0, targetCount - currentCount);
    if (missing <= 0) return;

    this.foods = [
      ...this.foods,
      ...this.createPuzzleColorFoods(level, this.snake, this.foods).slice(0, missing),
    ];
  }

  private step(): void {
    this.applyQueuedDirection();
    this.stepsUsed += 1;

    const currentHead = this.snake[0];
    const rawNextHead = getNextHeadPoint(currentHead, this.direction);
    const nextPoint = this.mode.id === 'endless' ? this.wrapPoint(rawNextHead) : rawNextHead;
    const nextHead: Segment = {
      x: nextPoint.x,
      y: nextPoint.y,
      color: currentHead.color,
    };

    const foodIndex = this.foods.findIndex((food) => samePoint(food, nextHead));
    const eatenFood = foodIndex >= 0 ? this.foods[foodIndex] : undefined;
    const ateRushCore = this.isRushRuleActive() ? this.rushCores.find((core) => samePoint(core, nextHead)) : undefined;
    const grows = Boolean(eatenFood && (eatenFood.type === 'normal' || eatenFood.type === 'rainbow'));
    const collisionBody = grows ? this.snake : this.snake.slice(0, -1);

    if ((this.mode.id !== 'endless' && this.isWallHit(nextHead)) || collisionBody.some((segment) => samePoint(segment, nextHead))) {
      if (this.isPuzzleRuleActive()) {
        this.showFloatingText(this.isPuzzleWall(nextHead) ? '撞墙了' : '撞到自己', 0xff6f3c);
      }
      if (this.isRushRuleActive()) {
        this.showFloatingText(
          this.isRushObstacle(nextHead)
            ? '撞上障碍'
            : collisionBody.some((segment) => samePoint(segment, nextHead))
              ? '撞到自己'
              : '撞墙了',
          0xff6f3c,
        );
      }
      this.finishGame(false);
      return;
    }

    if (this.isPuzzleRuleActive() && eatenFood?.requiredDirection && eatenFood.requiredDirection !== this.direction) {
      this.showFloatingText('方向不对', 0xff4d5f);
      this.finishGame(false);
      return;
    }

    if (
      this.isDirectionColorRuleActive()
      && eatenFood
      && eatenFood.type === 'normal'
      && eatenFood.color !== this.getDirectionColorHeadColor()
    ) {
      this.showFloatingText('颜色不对', 0xff4d5f);
      this.finishGame(false);
      return;
    }

    const previousTail = this.snake[this.snake.length - 1];
    this.moveSnake(nextHead);

    if (ateRushCore) {
      this.collectRushCore(ateRushCore);
      this.draw();
      this.publishSnapshot();
      return;
    }

    if (eatenFood) {
      this.foods.splice(foodIndex, 1);
      this.eaten += 1;
      if (this.isPuzzleRuleActive() && eatenFood.isPuzzleTarget) {
        this.puzzleTargetsCleared += 1;
      }
      this.score += GAME_CONFIG.scorePerFood + this.modifiers.foodScoreBonus;
      this.callbacks.onEvent?.({ type: 'eat', color: eatenFood.color, foodType: eatenFood.type });
      this.applyFoodEffect(eatenFood, previousTail);
      if (!this.isPuzzleRuleActive()) {
        this.updateMissionProgress({ foodType: eatenFood.type });
      }
      this.spawnEatEffect(previousTail, eatenFood.type);
      if (this.isPuzzleRuleActive()) {
        this.showFloatingText(
          eatenFood.isPuzzleTarget
            ? `方向正确 ${this.puzzleTargetsCleared}/${this.getPuzzleLevel().targets.length}`
            : '补色 +10',
          eatenFood.isPuzzleTarget ? 0x8ddf5a : getColorFill(eatenFood.color),
        );
        if (!eatenFood.isPuzzleTarget) this.refillPuzzleColorFoods();
      } else {
        this.refillFoods();
        if (this.isRushRuleActive()) this.refillRushObstacles(V3_BALANCE.rush.waveObstacleCount + V3_BALANCE.rush.waveRandomObstacleCount);
      }
      this.checkModeEndConditions();
    }

    if (this.isBrawlMode()) this.checkBrawlStageProgress();

    this.draw();
    this.publishSnapshot();
  }

  private moveSnake(nextHead: Segment): void {
    this.snake = advanceSnake(this.snake, nextHead);
  }

  private collectRushCore(core: RushCore): void {
    this.rushCoresCollected += 1;
    this.rushCores = this.rushCores.filter((item) => item.id !== core.id);
    this.rushObstacles = this.rushObstacles.filter((obstacle) => obstacle.coreId !== core.id);
    this.score += V3_BALANCE.rush.coreScore;
    this.addSprintTime(V3_BALANCE.rush.coreBonusSeconds, `核心 +${V3_BALANCE.rush.coreBonusSeconds}s`);
    this.showFloatingText(`核心 +${V3_BALANCE.rush.coreScore}`, 0xfff06a);
    if (this.effectSettings.screenShakeEnabled) this.cameras.main.shake(120, 0.004);
    if (this.isBrawlMode()) {
      this.checkBrawlStageProgress();
      return;
    }
    if (this.rushCores.length === 0) {
      this.rushWave += 1;
      this.setupRushWave();
    }
  }

  private applyQueuedDirection(): void {
    const resolved = resolveQueuedDirection(this.direction, this.nextDirection);
    this.direction = resolved.direction;
    this.nextDirection = resolved.nextDirection;
  }

  private applyFoodEffect(food: Food, previousTail: Segment): void {
    if (food.type === 'normal' || food.type === 'rainbow') {
      const nextColor = this.isDirectionColorRuleActive() && food.type === 'normal'
        ? this.getDirectionColorHeadColor()
        : food.color;
      this.snake.push({ ...previousTail, color: nextColor });
      this.resolveTailElimination();
      return;
    }

    this.callbacks.onEvent?.({ type: 'powerup', foodType: food.type });
    if (food.type === 'bomb') {
      this.eliminateTail(GAME_CONFIG.bombRemoveCount + this.modifiers.bombExtraRemove, '炸弹!');
    }
    if (food.type === 'slow') {
      this.slowUntil = this.time.now + GAME_CONFIG.slowDurationMs;
      this.showFloatingText('减速', 0x9df7ff);
    }
  }

  private resolveTailElimination(): void {
    const tail = this.snake.slice(-GAME_CONFIG.eliminateThreshold);
    if (tail.length < GAME_CONFIG.eliminateThreshold) return;
    if (this.isTailMatch(tail)) this.eliminateTail(GAME_CONFIG.eliminateThreshold);
  }

  private isTailMatch(tail: Segment[]): boolean {
    const normalColors = tail.filter((segment) => segment.color !== 'rainbow').map((segment) => segment.color);
    if (normalColors.length === 0) return true;
    return normalColors.every((color) => color === normalColors[0]);
  }

  private eliminateTail(count: number, label?: string): void {
    const removableCount = Math.min(count, Math.max(0, this.snake.length - 1));
    if (removableCount <= 0) return;

    const removedSegments = this.snake.slice(this.snake.length - removableCount);
    this.snake.splice(this.snake.length - removableCount, removableCount);
    this.eliminated += removableCount;
    if (this.isRushRuleActive()) {
      const bulletColor = removedSegments.find((segment) => segment.color !== 'rainbow')?.color;
      if (bulletColor && bulletColor !== 'rainbow') {
        this.rushBullets[bulletColor as BasicSnakeColor] += 1;
        this.showFloatingText(`${this.getColorShortLabel(bulletColor as BasicSnakeColor)}弹 +1`, getColorFill(bulletColor));
      }
    }

    const comboWindow = GAME_CONFIG.comboWindowMs + this.modifiers.comboWindowBonusMs;
    if (this.time.now - this.lastEliminateAt <= comboWindow) this.combo += 1;
    else this.combo = 1;

    this.successfulEliminations += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.lastEliminateAt = this.time.now;

    const { comboBonus, gainedScore } = getEliminationScore({
      removedCount: removableCount,
      combo: this.combo,
      eliminateScoreMultiplier: this.modifiers.eliminateScoreMultiplier,
    });
    this.score += gainedScore;
    let comboTimeBonus = 0;

    if (isSprintLikeMode(this.mode.id)) {
      const { seconds, comboTimeBonus: nextComboTimeBonus } = getSprintTimeAward({
        successfulEliminations: this.successfulEliminations,
        combo: this.combo,
        extraSecondsPerEliminate: this.modifiers.extraSecondsPerEliminate,
      });
      comboTimeBonus = nextComboTimeBonus;
      this.addSprintTime(seconds, this.combo > 1 ? `Combo +${seconds}s` : `+${seconds}s`);
    }

    if (this.combo > 1) {
      this.comboRewardText = getComboRewardText({
        combo: this.combo,
        comboBonus,
        comboTimeBonus,
        modeId: this.mode.id,
      });
      this.comboRewardUntil = this.time.now + V3_BALANCE.combo.bannerDurationMs;
    }

    if (this.effectSettings.screenShakeEnabled) this.cameras.main.shake(110, 0.004);
    this.spawnEliminateParticles(removedSegments);
    const comboBonusText = this.combo > 1 ? ` BONUS+${Math.round(comboBonus)}` : '';
    const scoreText = this.combo > 1 ? `Combo x${this.combo} +${gainedScore}${comboBonusText}` : `+${gainedScore}`;
    this.showFloatingText(label ? `${label} +${gainedScore}${comboBonusText}` : scoreText, this.combo > 1 ? 0xfff06a : 0xffffff);
    this.callbacks.onEvent?.({ type: 'eliminate', count: removableCount, combo: this.combo });

    this.updateMissionProgress({ elimination: true });

    if (shouldOfferUpgrade({
      modeId: this.mode.id,
      successfulEliminations: this.successfulEliminations,
    })) {
      this.prepareUpgradeChoices();
    }

    if (this.snake.length <= 1) {
      this.regenerateTail(5);
      this.showFloatingText('新尾巴', 0xfff06a);
    }
  }

  private regenerateTail(count: number): void {
    this.snake = regenerateTailFromSystem({
      snake: this.snake,
      direction: this.direction,
      count,
      columns: GAME_CONFIG.boardColumns,
      rows: GAME_CONFIG.boardRows,
      nextRandom: () => this.nextRandom(),
    });
  }

  private refillFoods(): void {
    if (this.isPuzzleRuleActive()) return;
    this.foods = refillFoodsToTarget({
      foods: this.foods,
      targetCount: this.isRushRuleActive() ? V3_BALANCE.rush.foodCount : GAME_CONFIG.targetFoodCount,
      maxAttempts: 300,
      createCandidate: () =>
        createFoodCandidate({
          columns: GAME_CONFIG.boardColumns,
          rows: GAME_CONFIG.boardRows,
          nextRandom: () => this.nextRandom(),
          pickType: () => this.pickFoodType(),
          pickColor: () => this.pickNextFoodColor(),
        }),
      isCellFree: (point, foods) =>
        isCellFreeFromSystem(point, this.snake, foods)
        && !this.isRushObstacle(point)
        && !this.rushCores.some((core) => samePoint(core, point)),
    });
  }

  private pickFoodType(): FoodType {
    if (this.isRushRuleActive() || this.isDirectionColorRuleActive()) return 'normal';
    return pickFoodTypeFromSystem({
      foods: this.foods,
      eaten: this.eaten,
      nextRandom: () => this.nextRandom(),
      specialSpawnBonus: this.dailyChallenge?.specialSpawnBonus,
      rainbowLuckBonus: this.modifiers.rainbowLuckBonus,
    });
  }

  private pickNextFoodColor(): BasicSnakeColor {
    const directionBiasColor = this.getDirectionBiasColor();
    if (directionBiasColor && this.nextRandom() < 0.12) return directionBiasColor;

    return pickNextFoodColorFromSystem({
      snake: this.snake,
      foods: this.foods,
      nextRandom: () => this.nextRandom(),
      lastEliminateAt: this.lastEliminateAt,
      timeNow: this.time.now,
      survivalSeconds: this.getSurvivalSeconds(),
      targetWeightBonus: this.modifiers.targetWeightBonus,
      isSprintLike: this.mode.id === 'sprint' || this.mode.id === 'daily',
    });
  }

  private createMissionStates(): MissionState[] {
    if (!isSprintLikeMode(this.mode.id)) return [];
    return createMissionStatesFromSystem(() => this.nextRandom(), this.dailyChallenge?.missionOffset);
  }

  private updateMissionProgress(event: { foodType?: FoodType; elimination?: boolean }): void {
    if (this.missionStates.length === 0) return;

    let changed = false;
    this.missionStates = this.missionStates.map((mission) => {
      if (mission.completed) return mission;
      const nextProgress = this.getMissionProgress(mission.id, mission.progress, event);
      const completed = nextProgress >= mission.target;
      if (!completed) {
        if (nextProgress !== mission.progress) changed = true;
        return { ...mission, progress: nextProgress };
      }

      changed = true;
      const definition = getMissionDefinition(mission.id);
      if (definition) this.applyMissionReward(definition);
      this.callbacks.onEvent?.({ type: 'mission' });
      this.showFloatingText(`任务完成 ${mission.rewardText}`, 0x88d94f);
      return { ...mission, progress: mission.target, completed: true };
    });

    if (changed) this.publishSnapshot();
  }

  private getMissionProgress(id: MissionId, previous: number, event: { foodType?: FoodType; elimination?: boolean }): number {
    return getMissionProgressFromSystem(
      id,
      previous,
      { score: this.score, maxCombo: this.maxCombo, eliminated: this.eliminated },
      event,
    );
  }

  private applyMissionReward(definition: MissionDefinition): void {
    if (definition.reward.score) this.score += definition.reward.score;
    if (definition.reward.seconds && isSprintLikeMode(this.mode.id)) {
      this.addSprintTime(definition.reward.seconds, `任务 +${definition.reward.seconds}s`);
    }
  }

  private prepareUpgradeChoices(): void {
    if (this.status !== 'playing') return;
    this.upgradeChoices = pickUpgradeChoicesFromSystem(3, () => this.nextRandom());
    this.status = 'upgrade';
    this.pausedAt = this.time.now;
    this.publishSnapshot();
  }

  private applyUpgrade(id: UpgradeId): void {
    applyUpgradeEffect(id, this.modifiers, (seconds, label) => this.addSprintTime(seconds, label));
  }

  private addSprintTime(seconds: number, label: string): void {
    if (!isSprintLikeMode(this.mode.id) && !this.isRushRuleActive() && !this.isBrawlMode()) return;
    this.sprintBonusMs += seconds * 1000;
    this.showFloatingText(label, 0x8ee7ff);
  }

  private checkModeEndConditions(): void {
    if (this.status !== 'playing') return;

    if (this.isBrawlMode() && this.hasCompletedBrawl()) {
      this.finishGame(true);
      return;
    }

    if (this.hasReachedGoal()) {
      this.finishGame(true);
      return;
    }

    if (this.getBaseTimeLimitSeconds() && this.getRemainingSeconds() <= 0) {
      this.finishGame(this.mode.id === 'rush' ? this.rushCoresCollected > 0 : false);
      return;
    }

    if (this.mode.stepLimit && this.getStepsLeft() <= 0) {
      this.finishGame(this.mode.id === 'precision' ? this.snake.length === this.mode.targetLength : this.hasReachedGoal());
    }
  }

  private hasReachedGoal(): boolean {
    if (this.isBrawlMode()) return this.hasCompletedBrawl();
    if (this.mode.id === 'rush') return false;
    return hasReachedModeGoal({
      mode: this.mode,
      score: this.score,
      eliminated: this.eliminated,
      foodsLeft: this.foods.length,
      puzzleTargetsLeft: this.countPuzzleTargetsLeft(),
      dailyTargetScore: this.dailyChallenge?.targetScore,
    });
  }

  private countPuzzleTargetsLeft(): number {
    if (!this.isPuzzleRuleActive()) return 0;
    return this.foods.filter((food) => food.isPuzzleTarget).length;
  }

  private checkBrawlStageProgress(): void {
    if (!this.isBrawlMode() || this.status !== 'playing') return;
    if (!this.hasCompletedBrawlStage()) return;
    this.brawlStageIndex += 1;
    if (this.hasCompletedBrawl()) {
      this.finishGame(true);
      return;
    }
    this.setupBrawlStage();
    this.draw();
    this.publishSnapshot();
  }

  private hasCompletedBrawl(): boolean {
    return this.brawlStageIndex >= V3_BALANCE.brawl.stageCount;
  }

  private hasCompletedBrawlStage(): boolean {
    if (!this.isBrawlMode()) return false;
    if (this.brawlStageType === 'sprint') {
      return this.eaten - this.brawlStageStartEaten >= this.getBrawlStageTarget()
        || this.score - this.brawlStageStartScore >= V3_BALANCE.brawl.stageScore;
    }
    if (this.brawlStageType === 'puzzle') return this.countPuzzleTargetsLeft() === 0;
    if (this.brawlStageType === 'rush') return this.rushCoresCollected >= V3_BALANCE.brawl.rushRequiredCores;
    return this.eaten - this.brawlStageStartEaten >= this.getBrawlStageTarget();
  }

  private getBrawlStageProgress(): number {
    if (!this.isBrawlMode()) return 0;
    if (this.brawlStageType === 'sprint') return Math.min(this.getBrawlStageTarget(), this.eaten - this.brawlStageStartEaten);
    if (this.brawlStageType === 'puzzle') return this.getBrawlStageTarget() - this.countPuzzleTargetsLeft();
    if (this.brawlStageType === 'rush') return this.rushCoresCollected;
    return Math.min(this.getBrawlStageTarget(), this.eaten - this.brawlStageStartEaten);
  }

  private getBrawlStageTarget(): number {
    if (this.brawlStageType === 'sprint') return this.brawlStageChallenge?.target ?? V3_BALANCE.brawl.sprintEatTarget;
    if (this.brawlStageType === 'puzzle') return this.brawlStageChallenge?.target ?? V3_BALANCE.brawl.puzzleTargetCount;
    if (this.brawlStageType === 'rush') return V3_BALANCE.brawl.rushRequiredCores;
    return this.brawlStageChallenge?.target ?? V3_BALANCE.brawl.colorEatTarget;
  }

  private getBrawlStageLabel(stage: BrawlStageType = this.brawlStageType): string {
    if (stage === 'sprint') return '蛇尾消消乐';
    if (stage === 'puzzle') return '解谜';
    if (stage === 'rush') return '破阵';
    if (stage === 'direction-color') return '方向染色';
    return '5秒变色';
  }

  private getBrawlStageTip(): string {
    if (this.brawlStageType === 'sprint') return `大乱斗 ${this.brawlStageIndex + 1}/${V3_BALANCE.brawl.stageCount} · ${this.brawlStageChallenge?.tip ?? `吃 ${this.getBrawlStageTarget()} 个色块`}`;
    if (this.brawlStageType === 'puzzle') return `大乱斗 ${this.brawlStageIndex + 1}/${V3_BALANCE.brawl.stageCount} · ${this.brawlStageChallenge?.tip ?? '按方向吃掉目标'}`;
    if (this.brawlStageType === 'rush') return `大乱斗 ${this.brawlStageIndex + 1}/${V3_BALANCE.brawl.stageCount} · 射穿围墙吃核心`;
    if (this.brawlStageType === 'direction-color') return `大乱斗 ${this.brawlStageIndex + 1}/${V3_BALANCE.brawl.stageCount} · 转向换色吃同色`;
    return `大乱斗 ${this.brawlStageIndex + 1}/${V3_BALANCE.brawl.stageCount} · 5 秒变色吃同色`;
  }

  private getBrawlStageHint(stage: BrawlStageType = this.brawlStageType): string {
    if (stage === 'sprint') return this.brawlStageChallenge?.tip ?? `吃 ${this.getBrawlStageTarget()} 个色块，尾巴三连可以加分返时`;
    if (stage === 'puzzle') return this.brawlStageChallenge?.tip ?? `按箭头方向吃掉 ${this.getBrawlStageTarget()} 个目标，方向错会失败`;
    if (stage === 'rush') return '射击击穿核心围墙，然后冲进去吃核心';
    if (stage === 'direction-color') return '每次有效转向都会换色，只能吃当前同色';
    return '蛇头每 5 秒自动换色，提前找下一种颜色';
  }

  private getDirectionBiasColor(): BasicSnakeColor | undefined {
    if (!isSprintLikeMode(this.mode.id)) return undefined;
    if (this.stepsUsed < 8) return undefined;
    if (this.direction === 'up') return 'mint';
    if (this.direction === 'right') return 'sun';
    if (this.direction === 'down') return 'berry';
    return 'leaf';
  }

  private getDirectionColorHeadColor(): BasicSnakeColor {
    return getDirectionCycleColorByTurn(this.getDirectionColorTurnIndex());
  }

  private getDirectionColorTurnIndex(): number {
    return this.isTimedColorRuleActive() ? this.timedColorTurn : this.directionColorTurn;
  }

  private updateTimedColorMode(): void {
    if (!this.isTimedColorRuleActive()) return;
    const nextTurn = Math.floor(this.getTimedColorElapsedMs() / TIMED_COLOR_INTERVAL_MS);
    if (nextTurn === this.timedColorTurn) return;
    this.timedColorTurn = nextTurn;
    this.showFloatingText(`变色：${getDirectionCycleLabels(this.timedColorTurn).current}`, 0xfff06a);
    this.draw();
    this.publishSnapshot();
  }

  private getTimedColorElapsedMs(): number {
    const elapsedMs = this.getActiveElapsedMs();
    if (!this.isBrawlMode()) return elapsedMs;
    return Math.max(0, elapsedMs - this.brawlStageStartSeconds * 1000);
  }

  private getTimedColorMsUntilChange(): number {
    const progress = this.getTimedColorElapsedMs() % TIMED_COLOR_INTERVAL_MS;
    return TIMED_COLOR_INTERVAL_MS - progress;
  }

  private shouldFlashTimedColorHead(): boolean {
    if (!this.isTimedColorRuleActive() || this.status !== 'playing') return false;
    return this.getTimedColorMsUntilChange() <= TIMED_COLOR_FLASH_WARNING_MS;
  }

  private getObjectiveText(): string {
    if (this.isBrawlMode()) {
      return `大乱斗 ${this.brawlStageIndex + 1}/${V3_BALANCE.brawl.stageCount} · ${this.getBrawlStageLabel()} · ${this.getBrawlStageProgress()}/${this.getBrawlStageTarget()}`;
    }
    return getModeObjectiveText({
      mode: this.mode,
      puzzleLevel: this.mode.id === 'puzzle' ? this.getPuzzleLevel() : undefined,
      puzzleLevelIndex: this.puzzleLevelIndex,
      puzzleLevelTotal: PUZZLE_LEVELS.length,
      puzzleTargetsCleared: this.puzzleTargetsCleared,
      dailyTitle: this.dailyChallenge?.title,
      dailyTargetScore: this.dailyChallenge?.targetScore,
    });
  }

  private isWallHit(point: { x: number; y: number }): boolean {
    if (this.isPuzzleWall(point)) return true;
    if (this.isRushObstacle(point)) return true;
    return isPointOutOfBounds(point, GAME_CONFIG.boardColumns, GAME_CONFIG.boardRows);
  }

  private isPuzzleWall(point: Point): boolean {
    if (!this.isPuzzleRuleActive()) return false;
    return this.puzzleWalls.some((wall) => samePoint(wall, point)) || (this.mode.id === 'puzzle' && isPuzzleWall(this.getPuzzleLevel(), point));
  }

  private isRushObstacle(point: Point): boolean {
    if (!this.isRushRuleActive()) return false;
    return this.rushObstacles.some((obstacle) => samePoint(obstacle, point));
  }

  private wrapPoint(point: { x: number; y: number }): { x: number; y: number } {
    return wrapBoardPoint(point, GAME_CONFIG.boardColumns, GAME_CONFIG.boardRows);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.inputLocked) return;
    if (event.repeat && event.code === 'Space') return;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault();
      this.setDirection('left');
      return;
    }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault();
      this.setDirection('right');
      return;
    }
    if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      this.setDirection('up');
      return;
    }
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault();
      this.setDirection('down');
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (this.isRushRuleActive()) this.activateSkill();
      else this.togglePause();
    }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      event.preventDefault();
      this.togglePause();
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.inputLocked) return;
    this.touchStart = new Phaser.Math.Vector2(pointer.x, pointer.y);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.inputLocked) return;
    if (!this.touchStart || this.status === 'upgrade') return;
    const end = new Phaser.Math.Vector2(pointer.x, pointer.y);
    const delta = end.subtract(this.touchStart);
    this.touchStart = undefined;
    if (delta.length() < 16) return;
    if (Math.abs(delta.x) > Math.abs(delta.y)) this.setDirection(delta.x > 0 ? 'right' : 'left');
    else this.setDirection(delta.y > 0 ? 'down' : 'up');
  }

  private handleResize(): void {
    const layout = calculateBoardLayout(
      this.scale.width,
      this.scale.height,
      GAME_CONFIG.boardColumns,
      GAME_CONFIG.boardRows,
    );
    this.cellSize = layout.cellSize;
    this.boardOrigin = layout.origin;
    this.draw();
  }

  private draw(): void {
    if (!this.graphics) return;
    const g = this.graphics;
    const boardPixelsWidth = this.cellSize * GAME_CONFIG.boardColumns;
    const boardPixelsHeight = this.cellSize * GAME_CONFIG.boardRows;
    const radius = Math.max(8, this.cellSize * 0.22);

    g.clear();
    g.fillStyle(0x5b321c, 1);
    g.fillRoundedRect(this.boardOrigin.x - 6, this.boardOrigin.y - 6, boardPixelsWidth + 12, boardPixelsHeight + 12, 16);
    g.fillStyle(0xffd47b, 1);
    g.fillRoundedRect(this.boardOrigin.x, this.boardOrigin.y, boardPixelsWidth, boardPixelsHeight, 14);

    if (this.isDangerLength()) {
      g.lineStyle(5, 0xff4d2f, 0.8);
      g.strokeRoundedRect(this.boardOrigin.x - 4, this.boardOrigin.y - 4, boardPixelsWidth + 8, boardPixelsHeight + 8, 16);
    }

    g.lineStyle(1, 0xe9a84e, 0.38);
    for (let index = 1; index < GAME_CONFIG.boardColumns; index += 1) {
      const offset = index * this.cellSize;
      g.lineBetween(this.boardOrigin.x + offset, this.boardOrigin.y, this.boardOrigin.x + offset, this.boardOrigin.y + boardPixelsHeight);
    }
    for (let index = 1; index < GAME_CONFIG.boardRows; index += 1) {
      const offset = index * this.cellSize;
      g.lineBetween(this.boardOrigin.x, this.boardOrigin.y + offset, this.boardOrigin.x + boardPixelsWidth, this.boardOrigin.y + offset);
    }

    if (this.isPuzzleRuleActive()) {
      this.puzzleWalls.forEach((wall) => this.drawPuzzleWall(wall, radius));
    } else if (this.isRushRuleActive()) {
      this.rushObstacles.forEach((wall) => this.drawRushObstacle(wall, radius));
      this.rushCores.forEach((core) => this.drawRushCore(core, radius));
    }
    this.foods.forEach((food) => this.drawFood(food, radius));
    this.snake.forEach((segment, index) => this.drawSegment(segment, index, radius));
    this.drawGuideHighlights(radius);
  }

  private drawGuideHighlights(radius: number): void {
    if (!this.graphics || this.status === 'gameover') return;
    if (this.isPuzzleRuleActive()) this.drawPuzzleTargetHighlights(radius);
  }

  private drawPuzzleTargetHighlights(radius: number): void {
    if (!this.graphics) return;
    this.foods.filter((food) => food.isPuzzleTarget).forEach((food) => {
      const rect = this.cellRect(food.x, food.y, 0.04);
      this.graphics.lineStyle(4, 0x8ee7ff, 0.68);
      this.graphics.strokeRoundedRect(rect.x, rect.y, rect.size, rect.size, radius + 5);
    });
  }

  private drawFood(food: Food, radius: number): void {
    if (!this.graphics) return;
    const rect = this.cellRect(food.x, food.y, food.requiredDirection ? 0.14 : 0.22);

    this.graphics.fillStyle(0x2b1710, 1);
    this.graphics.fillRoundedRect(rect.x - 2, rect.y - 2, rect.size + 4, rect.size + 4, radius);
    if (this.shouldGlowFood(food)) {
      this.graphics.lineStyle(4, 0xffffff, 0.5);
      this.graphics.strokeRoundedRect(rect.x - 5, rect.y - 5, rect.size + 10, rect.size + 10, radius + 4);
    }
    this.graphics.fillStyle(this.getFoodFill(food), this.getFoodAlpha(food));
    this.graphics.fillRoundedRect(rect.x, rect.y, rect.size, rect.size, radius);

    if (food.requiredDirection) {
      this.drawDirectionMark(food.requiredDirection, rect, 0x24110b);
      return;
    }

    if (food.type !== 'normal') this.drawSpecialIcon(food, rect);
  }

  private shouldGlowFood(food: Food): boolean {
    if (food.requiredDirection) return false;
    if (this.isDirectionColorRuleActive()) {
      return food.type === 'normal' && food.color === this.getDirectionColorHeadColor();
    }
    const target = getTailTargetColorFromSystem(this.snake, () => this.nextRandom());
    if (!target) return false;
    return food.type === 'rainbow' || (food.type === 'normal' && food.color === target);
  }

  private getFoodFill(food: Food): number {
    if (food.requiredDirection) return 0xffffff;
    if (food.type === 'bomb') return 0xff4d2f;
    if (food.type === 'slow') return 0x8ee7ff;
    return getColorFill(food.color);
  }

  private getFoodAlpha(food: Food): number {
    if (!this.isDirectionColorRuleActive() || food.type !== 'normal') return 1;
    return food.color === this.getDirectionColorHeadColor() ? 1 : 0.42;
  }

  private drawPuzzleWall(point: Point, radius: number): void {
    if (!this.graphics) return;
    const rect = this.cellRect(point.x, point.y, 0.12);
    this.graphics.fillStyle(0x6f4a2f, 1);
    this.graphics.fillRoundedRect(rect.x, rect.y, rect.size, rect.size, radius);
  }

  private drawRushObstacle(point: RushObstacle, radius: number): void {
    if (!this.graphics) return;
    const rect = this.cellRect(point.x, point.y, 0.14);
    this.graphics.fillStyle(getColorFill(point.color), 0.92);
    this.graphics.fillRoundedRect(rect.x, rect.y, rect.size, rect.size, radius);
    this.graphics.lineStyle(3, 0x2d170d, 0.72);
    this.graphics.lineBetween(rect.x + rect.size * 0.22, rect.y + rect.size * 0.22, rect.x + rect.size * 0.78, rect.y + rect.size * 0.78);
    this.graphics.lineBetween(rect.x + rect.size * 0.78, rect.y + rect.size * 0.22, rect.x + rect.size * 0.22, rect.y + rect.size * 0.78);
    const damage = this.rushWallDamage[this.getPointKey(point)];
    if (damage) {
      this.graphics.fillStyle(0xffffff, 0.88);
      this.graphics.fillCircle(rect.x + rect.size * 0.78, rect.y + rect.size * 0.22, Math.max(3, rect.size * 0.13));
      this.graphics.fillStyle(0x2d170d, 1);
      this.graphics.fillCircle(rect.x + rect.size * 0.78, rect.y + rect.size * 0.22, Math.max(1.5, rect.size * 0.055 * damage.hits));
    }
  }

  private drawSpecialIcon(food: Food, rect: { x: number; y: number; size: number }): void {
    if (!this.graphics) return;
    const cx = rect.x + rect.size * 0.5;
    const cy = rect.y + rect.size * 0.5;
    const r = Math.max(7, rect.size * 0.28);

    this.graphics.lineStyle(3, 0x2d170d, 1);
    if (food.type === 'bomb') {
      this.graphics.fillStyle(0xfff06a, 1);
      this.graphics.fillCircle(cx, cy, r);
      this.graphics.lineBetween(cx + r * 0.5, cy - r * 0.6, cx + r * 1.1, cy - r * 1.15);
      this.graphics.fillStyle(0xffffff, 1);
      this.graphics.fillCircle(cx - r * 0.35, cy - r * 0.35, Math.max(2, r * 0.22));
      return;
    }

    if (food.type === 'rainbow') {
      this.graphics.strokeCircle(cx, cy, r);
      this.graphics.lineStyle(3, 0xff6f91, 1);
      this.graphics.beginPath();
      this.graphics.arc(cx, cy, r * 0.85, Math.PI, Math.PI * 2);
      this.graphics.strokePath();
      this.graphics.lineStyle(3, 0x35d1b2, 1);
      this.graphics.beginPath();
      this.graphics.arc(cx, cy + r * 0.12, r * 0.55, Math.PI, Math.PI * 2);
      this.graphics.strokePath();
      return;
    }

    this.graphics.strokeCircle(cx, cy, r);
    this.graphics.lineBetween(cx, cy, cx, cy - r * 0.58);
    this.graphics.lineBetween(cx, cy, cx + r * 0.5, cy + r * 0.25);
  }

  private drawDirectionMark(direction: Direction, rect: { x: number; y: number; size: number }, color: number): void {
    if (!this.graphics) return;
    const centerX = rect.x + rect.size / 2;
    const centerY = rect.y + rect.size / 2;
    const length = rect.size * 0.7;
    const shaft = Math.max(4, rect.size * 0.16);
    const head = rect.size * 0.26;
    const halfShaft = shaft / 2;

    let points: Phaser.Math.Vector2[] = [];
    if (direction === 'up') {
      points = [
        new Phaser.Math.Vector2(centerX, centerY - length / 2),
        new Phaser.Math.Vector2(centerX - head, centerY - length / 2 + head),
        new Phaser.Math.Vector2(centerX - halfShaft, centerY - length / 2 + head),
        new Phaser.Math.Vector2(centerX - halfShaft, centerY + length / 2),
        new Phaser.Math.Vector2(centerX + halfShaft, centerY + length / 2),
        new Phaser.Math.Vector2(centerX + halfShaft, centerY - length / 2 + head),
        new Phaser.Math.Vector2(centerX + head, centerY - length / 2 + head),
      ];
    } else if (direction === 'down') {
      points = [
        new Phaser.Math.Vector2(centerX, centerY + length / 2),
        new Phaser.Math.Vector2(centerX - head, centerY + length / 2 - head),
        new Phaser.Math.Vector2(centerX - halfShaft, centerY + length / 2 - head),
        new Phaser.Math.Vector2(centerX - halfShaft, centerY - length / 2),
        new Phaser.Math.Vector2(centerX + halfShaft, centerY - length / 2),
        new Phaser.Math.Vector2(centerX + halfShaft, centerY + length / 2 - head),
        new Phaser.Math.Vector2(centerX + head, centerY + length / 2 - head),
      ];
    } else if (direction === 'left') {
      points = [
        new Phaser.Math.Vector2(centerX - length / 2, centerY),
        new Phaser.Math.Vector2(centerX - length / 2 + head, centerY - head),
        new Phaser.Math.Vector2(centerX - length / 2 + head, centerY - halfShaft),
        new Phaser.Math.Vector2(centerX + length / 2, centerY - halfShaft),
        new Phaser.Math.Vector2(centerX + length / 2, centerY + halfShaft),
        new Phaser.Math.Vector2(centerX - length / 2 + head, centerY + halfShaft),
        new Phaser.Math.Vector2(centerX - length / 2 + head, centerY + head),
      ];
    } else {
      points = [
        new Phaser.Math.Vector2(centerX + length / 2, centerY),
        new Phaser.Math.Vector2(centerX + length / 2 - head, centerY - head),
        new Phaser.Math.Vector2(centerX + length / 2 - head, centerY - halfShaft),
        new Phaser.Math.Vector2(centerX - length / 2, centerY - halfShaft),
        new Phaser.Math.Vector2(centerX - length / 2, centerY + halfShaft),
        new Phaser.Math.Vector2(centerX + length / 2 - head, centerY + halfShaft),
        new Phaser.Math.Vector2(centerX + length / 2 - head, centerY + head),
      ];
    }

    this.graphics.fillStyle(color, 1);
    this.graphics.lineStyle(Math.max(2, rect.size * 0.06), 0x2a1810, 0.9);
    this.graphics.beginPath();
    this.graphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      this.graphics.lineTo(points[index].x, points[index].y);
    }
    this.graphics.closePath();
    this.graphics.fillPath();
    this.graphics.strokePath();
  }

  private drawSegment(segment: Segment, index: number, radius: number): void {
    if (!this.graphics) return;
    const rect = this.cellRect(segment.x, segment.y, 0.12);
    this.graphics.fillStyle(0x24110b, 1);
    this.graphics.fillRoundedRect(rect.x - 3, rect.y - 3, rect.size + 6, rect.size + 6, radius);
    const headFill = this.isDirectionColorRuleActive()
      ? getColorFill(this.getDirectionColorHeadColor())
      : 0xffffff;
    this.graphics.fillStyle(index === 0 ? headFill : getColorFill(segment.color), 1);
    this.graphics.fillRoundedRect(rect.x, rect.y, rect.size, rect.size, radius);
    if (index === 0) this.drawTimedColorHeadFlash(rect, radius);
    if (index === this.snake.length - 1 && this.time.now < this.tailPulseUntil) {
      const progress = (this.tailPulseUntil - this.time.now) / 260;
      this.graphics.lineStyle(5, 0xfff06a, progress);
      this.graphics.strokeRoundedRect(rect.x - 4, rect.y - 4, rect.size + 8, rect.size + 8, radius);
    }
    if (segment.color === 'rainbow' && index !== 0) {
      this.graphics.lineStyle(3, 0xff6f91, 0.9);
      this.graphics.strokeRoundedRect(rect.x + 3, rect.y + 3, rect.size - 6, rect.size - 6, radius);
      this.graphics.lineStyle(3, 0x35d1b2, 0.9);
      this.graphics.strokeRoundedRect(rect.x + 8, rect.y + 8, rect.size - 16, rect.size - 16, radius);
    }
    if (this.shouldHighlightTail(index)) {
      const pulse = 0.55 + Math.sin(this.time.now / 140) * 0.25;
      this.graphics.lineStyle(4, 0xffffff, pulse);
      this.graphics.strokeRoundedRect(rect.x - 3, rect.y - 3, rect.size + 6, rect.size + 6, radius);
    }
    if (index === 0) {
      this.graphics.fillStyle(0x24110b, 1);
      this.graphics.fillCircle(rect.x + rect.size * 0.34, rect.y + rect.size * 0.38, Math.max(2, rect.size * 0.08));
      this.graphics.fillCircle(rect.x + rect.size * 0.66, rect.y + rect.size * 0.38, Math.max(2, rect.size * 0.08));
      if (this.isPuzzleRuleActive()) {
        this.drawDirectionMark(this.direction, rect, 0x24110b);
      }
    }
  }

  private drawTimedColorHeadFlash(rect: { x: number; y: number; size: number }, radius: number): void {
    if (!this.graphics || !this.shouldFlashTimedColorHead()) return;
    const msUntilChange = this.getTimedColorMsUntilChange();
    const urgency = 1 - Phaser.Math.Clamp(msUntilChange / TIMED_COLOR_FLASH_WARNING_MS, 0, 1);
    const pulse = 0.5 + Math.sin(this.time.now / 70) * 0.5;
    const nextColor = getColorFill(getDirectionCycleColorByTurn(this.getDirectionColorTurnIndex() + 1));
    const flashColor = pulse > 0.52 ? nextColor : 0xffffff;
    const alpha = 0.18 + urgency * 0.32 + pulse * 0.18;
    const inset = Math.max(2, rect.size * 0.13);

    this.graphics.fillStyle(flashColor, alpha);
    this.graphics.fillRoundedRect(
      rect.x + inset,
      rect.y + inset,
      rect.size - inset * 2,
      rect.size - inset * 2,
      Math.max(4, radius - inset),
    );
    this.graphics.lineStyle(Math.max(3, rect.size * 0.08), nextColor, 0.5 + pulse * 0.45);
    this.graphics.strokeRoundedRect(rect.x - 2, rect.y - 2, rect.size + 4, rect.size + 4, radius + 4);
  }

  private shouldHighlightTail(index: number): boolean {
    const tail = this.snake.slice(-(GAME_CONFIG.eliminateThreshold - 1));
    if (tail.length < GAME_CONFIG.eliminateThreshold - 1) return false;
    const shouldHint = this.isTailMatch(tail);
    return shouldHint && index >= this.snake.length - tail.length;
  }

  private cellRect(x: number, y: number, insetRatio: number): { x: number; y: number; size: number } {
    const inset = this.cellSize * insetRatio;
    return {
      x: this.boardOrigin.x + x * this.cellSize + inset,
      y: this.boardOrigin.y + y * this.cellSize + inset,
      size: this.cellSize - inset * 2,
    };
  }

  private publishSnapshot(): void {
    const puzzleLevel = this.mode.id === 'puzzle' ? this.getPuzzleLevel() : undefined;
    const objectiveText = this.getObjectiveText();
    this.callbacks.onSnapshot?.({
      mode: this.mode.id,
      objectiveText,
      dailyChallengeText: this.isPuzzleRuleActive() || this.isBrawlMode() ? this.puzzleTip : this.dailyChallenge?.description,
      dailyChallengeKey: this.dailyChallenge?.key,
      dailyStickerName: this.dailyChallenge?.stickerName,
      puzzleOptimalSteps: puzzleLevel?.optimalSteps,
      puzzleStepDelta: puzzleLevel?.optimalSteps !== undefined
        ? this.stepsUsed - puzzleLevel.optimalSteps
        : undefined,
      comboRewardText: this.time.now < this.comboRewardUntil ? this.comboRewardText : undefined,
      directionColorCurrentLabel: this.isDirectionColorRuleActive()
        ? getDirectionCycleLabels(this.getDirectionColorTurnIndex()).current
        : undefined,
      directionColorNextLabel: this.isDirectionColorRuleActive()
        ? getDirectionCycleLabels(this.getDirectionColorTurnIndex()).next
        : undefined,
      rushSkillReady: this.isRushRuleActive() ? this.time.now >= this.rushSkillCooldownUntil : undefined,
      rushSkillCooldownSeconds: this.isRushRuleActive() && this.time.now < this.rushSkillCooldownUntil
        ? Math.ceil((this.rushSkillCooldownUntil - this.time.now) / 1000)
        : undefined,
      rushClearedObstacles: this.isRushRuleActive() ? this.rushClearedObstacles : undefined,
      rushSkillUses: this.isRushRuleActive() ? this.rushSkillUses : undefined,
      rushCoresCollected: this.isRushRuleActive() ? this.rushCoresCollected : undefined,
      rushRequiredCores: this.isRushRuleActive() ? (this.isBrawlMode() ? V3_BALANCE.brawl.rushRequiredCores : undefined) : undefined,
      rushWaveCoresLeft: this.isRushRuleActive() ? this.rushCores.length : undefined,
      rushBulletInventoryText: this.isRushRuleActive() ? this.getRushBulletInventoryText() : undefined,
      rushShotPreviewText: this.isRushRuleActive() ? this.getRushShotPreviewText() : undefined,
      rushSameColorClears: this.isRushRuleActive() ? this.rushSameColorClears : undefined,
      rushOffColorBreaks: this.isRushRuleActive() ? this.rushOffColorBreaks : undefined,
      rushWave: this.isRushRuleActive() ? this.rushWave : undefined,
      rushBestLineClear: this.isRushRuleActive() ? this.rushBestLineClear : undefined,
      rushImbueLabel: this.isRushRuleActive() ? this.getRushShotPreviewText() : undefined,
      brawlStageLabel: this.isBrawlMode() ? this.getBrawlStageLabel() : undefined,
      brawlStageIndex: this.isBrawlMode() ? this.brawlStageIndex + 1 : undefined,
      brawlStageCount: this.isBrawlMode() ? V3_BALANCE.brawl.stageCount : undefined,
      brawlStageProgress: this.isBrawlMode() ? this.getBrawlStageProgress() : undefined,
      brawlStageTarget: this.isBrawlMode() ? this.getBrawlStageTarget() : undefined,
      brawlStageIntro: this.isBrawlMode() && this.status === 'playing' && this.time.now < this.brawlIntroUntil,
      brawlStageHint: this.isBrawlMode() ? this.getBrawlStageHint() : undefined,
      resumeCountdownSeconds: this.status === 'resume' ? Math.max(1, Math.ceil((this.resumeUntil - this.time.now) / 1000)) : undefined,
      resumeCountdownProgress: this.status === 'resume' ? Phaser.Math.Clamp((this.resumeUntil - this.time.now) / 3000, 0, 1) : undefined,
      upgradeCharge: isSprintLikeMode(this.mode.id)
        ? this.status === 'upgrade'
          ? GAME_CONFIG.upgradeTriggerEvery
          : this.successfulEliminations % GAME_CONFIG.upgradeTriggerEvery
        : undefined,
      upgradeChargeTarget: isSprintLikeMode(this.mode.id) ? GAME_CONFIG.upgradeTriggerEvery : undefined,
      score: this.score,
      length: this.snake.length,
      combo: this.combo,
      maxCombo: this.maxCombo,
      eliminated: this.isPuzzleRuleActive() ? this.puzzleTargetsCleared : this.eliminated,
      eaten: this.eaten,
      stepsUsed: this.stepsUsed,
      stepsLeft: this.mode.stepLimit ? this.getStepsLeft() : undefined,
      remainingSeconds: this.getBaseTimeLimitSeconds() ? this.getRemainingSeconds() : undefined,
      survivalSeconds: this.getSurvivalSeconds(),
      bestScore: getBestScore(),
      bestSurvivalSeconds: getBestSurvivalSeconds(),
      bestCombo: getBestCombo(),
      isDanger: this.isDangerLength(),
      isSlowed: this.time.now < this.slowUntil,
      objectiveCompleted: this.objectiveCompleted,
      missionStates: this.missionStates,
      selectedUpgrades: this.selectedUpgrades,
      upgradeChoices: this.upgradeChoices,
      status: this.status,
    });
  }

  private getSurvivalSeconds(): number {
    return Math.max(0, Math.floor(this.getActiveElapsedMs() / 1000));
  }

  private getActiveElapsedMs(): number {
    const activeUntil = this.status === 'paused' || this.status === 'upgrade' || this.status === 'resume' ? this.pausedAt : this.time.now;
    return Math.max(0, activeUntil - this.startAt - this.pausedDuration);
  }

  private getAvailableSeconds(): number {
    return this.getBaseTimeLimitSeconds() + Math.floor(this.sprintBonusMs / 1000);
  }

  private getRemainingSeconds(): number {
    if (!this.getBaseTimeLimitSeconds()) return 0;
    return Math.max(0, this.getAvailableSeconds() - this.getSurvivalSeconds());
  }

  private getBaseTimeLimitSeconds(): number {
    return this.mode.timeLimitSeconds ?? 0;
  }

  private getStepsLeft(): number {
    if (!this.mode.stepLimit) return 0;
    return Math.max(0, this.mode.stepLimit - this.stepsUsed);
  }

  private getMoveInterval(): number {
    let interval = GAME_CONFIG.moveIntervalMs - this.getModeSpeedBonus();
    if (this.time.now < this.slowUntil) interval *= 1.5;
    return Math.max(
      this.isRushRuleActive() ? V3_BALANCE.rush.minimumMoveIntervalMs : V3_BALANCE.movement.minimumMoveIntervalMs,
      interval,
    );
  }

  private getRushBulletInventoryText(): string {
    return BASIC_COLOR_IDS
      .map((color) => `${this.getColorShortLabel(color)}${this.rushBullets[color]}`)
      .join(' ');
  }

  private getRushShotPreviewText(): string | undefined {
    const shotColor = this.pickRushShotColor();
    if (!shotColor) return '无弹';
    const firstWall = this.getFirstRushWallInDirection();
    if (!firstWall) return `${this.getColorShortLabel(shotColor)}弹`;
    return firstWall.color === shotColor
      ? `${this.getColorShortLabel(shotColor)}弹同色`
      : `${this.getColorShortLabel(shotColor)}弹异色`;
  }

  private getColorShortLabel(color: BasicSnakeColor): string {
    if (color === 'sun') return '黄';
    if (color === 'leaf') return '绿';
    if (color === 'mint') return '青';
    return '粉';
  }

  private drawRushCore(point: RushCore, radius: number): void {
    if (!this.graphics) return;
    const rect = this.cellRect(point.x, point.y, 0.08);
    const cx = rect.x + rect.size / 2;
    const cy = rect.y + rect.size / 2;
    this.graphics.fillStyle(0x2b1710, 1);
    this.graphics.fillCircle(cx, cy, rect.size * 0.52);
    this.graphics.fillStyle(getColorFill(point.color), 1);
    this.graphics.fillCircle(cx, cy, rect.size * 0.42);
    this.graphics.lineStyle(Math.max(3, rect.size * 0.08), 0xffffff, 0.9);
    this.graphics.strokeCircle(cx, cy, rect.size * 0.28);
    this.graphics.fillStyle(0xff6f91, 0.95);
    this.graphics.fillCircle(cx, cy, Math.max(3, rect.size * 0.12));
  }

  private getModeSpeedBonus(): number {
    return getModeSpeedBonusFromRules({
      modeId: this.mode.id,
      score: this.score,
      stepsUsed: this.stepsUsed,
      stepLimit: this.mode.stepLimit,
      timeLimitSeconds: this.mode.timeLimitSeconds,
      survivalSeconds: this.getSurvivalSeconds(),
      availableSeconds: this.getAvailableSeconds(),
    });
  }

  private isDangerLength(): boolean {
    return this.snake.length >= GAME_CONFIG.initialLength * 3;
  }

  private showFloatingText(message: string, color: number): void {
    const x = this.boardOrigin.x + (this.cellSize * GAME_CONFIG.boardColumns) / 2;
    const y = this.boardOrigin.y + this.cellSize * 1.2;
    const isPuzzleMessage = this.mode.id === 'puzzle';
    const text = this.add.text(x, y, message, {
      fontFamily: 'Trebuchet MS, Microsoft YaHei, sans-serif',
      fontSize: `${Math.max(isPuzzleMessage ? 22 : 18, Math.floor(this.cellSize * (isPuzzleMessage ? 0.72 : 0.6)))}px`,
      fontStyle: 'bold',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#2d170d',
      strokeThickness: isPuzzleMessage ? 6 : 5,
    });
    text.setOrigin(0.5);
    this.tweens.add({
      targets: text,
      y: y - this.cellSize * (isPuzzleMessage ? 0.55 : 0.8),
      alpha: 0,
      scale: isPuzzleMessage ? 1.08 : 1.18,
      duration: isPuzzleMessage ? 1100 : 520,
      ease: isPuzzleMessage ? 'Sine.easeOut' : 'Back.easeOut',
      hold: isPuzzleMessage ? 380 : 0,
      onComplete: () => text.destroy(),
    });
  }

  private spawnEatEffect(previousTail: Segment, foodType: FoodType): void {
    const center = this.cellCenter(previousTail.x, previousTail.y);
    this.tailPulseUntil = this.time.now + 260;
    const effect = this.add.graphics({ x: center.x, y: center.y });
    effect.lineStyle(3, foodType === 'rainbow' ? 0xffffff : 0xfff06a, 0.85);
    effect.strokeCircle(0, 0, Math.max(8, this.cellSize * 0.22));
    this.tweens.add({
      targets: effect,
      scale: 1.5,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => effect.destroy(),
    });
  }

  private spawnEliminateParticles(segments: Segment[]): void {
    segments.forEach((segment) => {
      const center = this.cellCenter(segment.x, segment.y);
      for (let index = 0; index < 5; index += 1) {
        const particle = this.add.graphics({ x: center.x, y: center.y });
        particle.fillStyle(segment.color === 'rainbow' ? 0xffffff : getColorFill(segment.color), 1);
        particle.fillCircle(0, 0, Math.max(2, this.cellSize * 0.06));
        const angle = Math.random() * Math.PI * 2;
        const distance = this.cellSize * (0.25 + Math.random() * 0.45);
        this.tweens.add({
          targets: particle,
          x: center.x + Math.cos(angle) * distance,
          y: center.y + Math.sin(angle) * distance,
          alpha: 0,
          scale: 0.2,
          duration: 230,
          ease: 'Quad.easeOut',
          onComplete: () => particle.destroy(),
        });
      }
    });
  }

  private cellCenter(x: number, y: number): { x: number; y: number } {
    return {
      x: this.boardOrigin.x + x * this.cellSize + this.cellSize / 2,
      y: this.boardOrigin.y + y * this.cellSize + this.cellSize / 2,
    };
  }

  private finishGame(objectiveCompleted: boolean): void {
    this.objectiveCompleted = objectiveCompleted;
    this.status = 'gameover';
    const puzzleLevel = this.mode.id === 'puzzle' ? this.getPuzzleLevel() : undefined;
    const objectiveText = this.getObjectiveText();
    const result: GameResult = {
      mode: this.mode.id,
      objectiveText,
      dailyChallengeText: this.isPuzzleRuleActive() || this.isBrawlMode() ? this.puzzleTip : this.dailyChallenge?.description,
      dailyChallengeKey: this.dailyChallenge?.key,
      dailyStickerName: this.dailyChallenge?.stickerName,
      puzzleOptimalSteps: puzzleLevel?.optimalSteps,
      puzzleStepDelta: puzzleLevel?.optimalSteps !== undefined
        ? this.stepsUsed - puzzleLevel.optimalSteps
        : undefined,
      comboRewardText: this.time.now < this.comboRewardUntil ? this.comboRewardText : undefined,
      directionColorCurrentLabel: this.isDirectionColorRuleActive()
        ? getDirectionCycleLabels(this.getDirectionColorTurnIndex()).current
        : undefined,
      directionColorNextLabel: this.isDirectionColorRuleActive()
        ? getDirectionCycleLabels(this.getDirectionColorTurnIndex()).next
        : undefined,
      rushSkillReady: this.isRushRuleActive() ? this.time.now >= this.rushSkillCooldownUntil : undefined,
      rushSkillCooldownSeconds: this.isRushRuleActive() && this.time.now < this.rushSkillCooldownUntil
        ? Math.ceil((this.rushSkillCooldownUntil - this.time.now) / 1000)
        : undefined,
      rushClearedObstacles: this.isRushRuleActive() ? this.rushClearedObstacles : undefined,
      rushSkillUses: this.isRushRuleActive() ? this.rushSkillUses : undefined,
      rushCoresCollected: this.isRushRuleActive() ? this.rushCoresCollected : undefined,
      rushRequiredCores: this.isRushRuleActive() ? (this.isBrawlMode() ? V3_BALANCE.brawl.rushRequiredCores : undefined) : undefined,
      rushWaveCoresLeft: this.isRushRuleActive() ? this.rushCores.length : undefined,
      rushBulletInventoryText: this.isRushRuleActive() ? this.getRushBulletInventoryText() : undefined,
      rushShotPreviewText: this.isRushRuleActive() ? this.getRushShotPreviewText() : undefined,
      rushSameColorClears: this.isRushRuleActive() ? this.rushSameColorClears : undefined,
      rushOffColorBreaks: this.isRushRuleActive() ? this.rushOffColorBreaks : undefined,
      rushWave: this.isRushRuleActive() ? this.rushWave : undefined,
      rushBestLineClear: this.isRushRuleActive() ? this.rushBestLineClear : undefined,
      rushImbueLabel: this.isRushRuleActive() ? this.getRushShotPreviewText() : undefined,
      brawlStageLabel: this.isBrawlMode() ? this.getBrawlStageLabel() : undefined,
      brawlStageIndex: this.isBrawlMode() ? this.brawlStageIndex + 1 : undefined,
      brawlStageCount: this.isBrawlMode() ? V3_BALANCE.brawl.stageCount : undefined,
      brawlStageProgress: this.isBrawlMode() ? this.getBrawlStageProgress() : undefined,
      brawlStageTarget: this.isBrawlMode() ? this.getBrawlStageTarget() : undefined,
      brawlStageIntro: false,
      brawlStageHint: this.isBrawlMode() ? this.getBrawlStageHint() : undefined,
      resumeCountdownSeconds: undefined,
      resumeCountdownProgress: undefined,
      upgradeCharge: isSprintLikeMode(this.mode.id) ? this.successfulEliminations % GAME_CONFIG.upgradeTriggerEvery : undefined,
      upgradeChargeTarget: isSprintLikeMode(this.mode.id) ? GAME_CONFIG.upgradeTriggerEvery : undefined,
      score: this.score,
      length: this.snake.length,
      combo: this.combo,
      maxCombo: this.maxCombo,
      eliminated: this.isPuzzleRuleActive() ? this.puzzleTargetsCleared : this.eliminated,
      eaten: this.eaten,
      stepsUsed: this.stepsUsed,
      stepsLeft: this.mode.stepLimit ? this.getStepsLeft() : undefined,
      remainingSeconds: this.getBaseTimeLimitSeconds() ? this.getRemainingSeconds() : undefined,
      survivalSeconds: this.getSurvivalSeconds(),
      bestScore: 0,
      bestSurvivalSeconds: getBestSurvivalSeconds(),
      bestCombo: getBestCombo(),
      isDanger: this.isDangerLength(),
      isSlowed: this.time.now < this.slowUntil,
      objectiveCompleted,
      missionStates: this.missionStates,
      selectedUpgrades: this.selectedUpgrades,
      upgradeChoices: [],
      status: this.status,
      finalLength: this.snake.length,
    };
    if (this.mode.id === 'daily' && this.dailyChallenge?.key) {
      saveDailyChallengeStatus(this.dailyChallenge.key, result.score, objectiveCompleted);
      if (objectiveCompleted) {
        const unlockResult = unlockSticker(this.dailyChallenge.stickerId);
        if (unlockResult.newlyUnlocked) {
          result.unlockedStickerLabel = this.dailyChallenge.stickerName;
        }
      }
    }
    const bestScore = saveResult(result);
    const withBest = { ...result, bestScore };
    this.callbacks.onSnapshot?.(withBest);
    this.callbacks.onGameOver?.(withBest);
    this.callbacks.onEvent?.({ type: 'gameover', objectiveCompleted });
    this.draw();
  }
}
