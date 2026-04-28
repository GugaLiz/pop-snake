import * as Phaser from 'phaser';
import {
  BASIC_COLOR_IDS,
  GAME_CONFIG,
  GAME_MODES,
  getColorFill,
  getRandomBasicColor,
  type BasicSnakeColor,
  type FoodType,
  type GameModeConfig,
  type GameModeId,
  type SnakeColor,
} from '../../config/gameConfig';
import { getBestCombo, getBestScore, getBestSurvivalSeconds, saveResult } from '../../storage/localStorage';
import { DIRECTIONS, isOpposite, samePoint, type Direction, type Food, type GameEvent, type GameResult, type GameSnapshot, type Segment } from '../types';

type GameCallbacks = {
  onSnapshot?: (snapshot: GameSnapshot) => void;
  onGameOver?: (result: GameResult) => void;
  onEvent?: (event: GameEvent) => void;
};

type EffectSettings = {
  screenShakeEnabled: boolean;
};

export class MainScene extends Phaser.Scene {
  private callbacks: GameCallbacks = {};
  private effectSettings: EffectSettings = { screenShakeEnabled: true };
  private mode: GameModeConfig = GAME_MODES.standard;
  private snake: Segment[] = [];
  private foods: Food[] = [];
  private direction: Direction = 'right';
  private nextDirection: Direction = 'right';
  private directionQueue: Direction[] = [];
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
  private slowUntil = 0;
  private status: GameSnapshot['status'] = 'ready';
  private accumulator = 0;
  private cellSize = 44;
  private boardOrigin = { x: 0, y: 0 };
  private isSceneReady = false;
  private graphics?: Phaser.GameObjects.Graphics;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private touchStart?: Phaser.Math.Vector2;
  private tailPulseUntil = 0;

  constructor() {
    super('MainScene');
  }

  public setCallbacks(callbacks: GameCallbacks): void {
    this.callbacks = callbacks;
  }

  public setEffectSettings(settings: EffectSettings): void {
    this.effectSettings = settings;
  }

  public setMode(modeId: GameModeId): void {
    this.mode = GAME_MODES[modeId];
    if (!this.isSceneReady) return;
    this.resetGame();
  }

  init(data: GameCallbacks): void {
    if (data && Object.keys(data).length > 0) this.callbacks = data;
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.scale.on('resize', this.handleResize, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.handleResize();
    this.isSceneReady = true;
    this.resetGame();
  }

  update(_: number, delta: number): void {
    this.handleKeyboardInput();
    if (this.status !== 'playing') return;

    this.checkModeEndConditions();
    if (this.status !== 'playing') return;

    this.accumulator += delta;
    if (this.accumulator >= this.getMoveInterval()) {
      this.accumulator = 0;
      this.step();
    }
  }

  public startGame(): void {
    if (this.status !== 'ready') return;
    this.status = 'playing';
    this.startAt = this.time.now;
    this.callbacks.onEvent?.({ type: 'start' });
    this.publishSnapshot();
  }

  public setDirection(direction: Direction): void {
    if (this.status === 'ready') this.startGame();
    const lastQueued = this.directionQueue[this.directionQueue.length - 1] ?? this.nextDirection;
    if (direction === lastQueued || isOpposite(lastQueued, direction)) return;

    this.directionQueue = [...this.directionQueue, direction].slice(-2);
    this.nextDirection = direction;
  }

  public togglePause(): void {
    if (this.status === 'gameover' || this.status === 'ready') return;
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
    this.resetGame();
  }

  private resetGame(): void {
    const mid = Math.floor(GAME_CONFIG.boardSize / 2);
    this.snake = [
      { x: mid + 1, y: mid, color: 'leaf' },
      { x: mid, y: mid, color: 'mint' },
      { x: mid - 1, y: mid, color: 'sun' },
    ];
    this.foods = [];
    this.direction = 'right';
    this.nextDirection = 'right';
    this.directionQueue = [];
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
    this.refillFoods();
    this.draw();
    this.publishSnapshot();
  }

  private step(): void {
    this.applyQueuedDirection();
    this.stepsUsed += 1;

    const vector = DIRECTIONS[this.direction];
    const currentHead = this.snake[0];
    const rawNextHead = {
      x: currentHead.x + vector.x,
      y: currentHead.y + vector.y,
    };
    const nextPoint = this.mode.id === 'endless' ? this.wrapPoint(rawNextHead) : rawNextHead;
    const nextHead: Segment = {
      x: nextPoint.x,
      y: nextPoint.y,
      color: currentHead.color,
    };

    const foodIndex = this.foods.findIndex((food) => samePoint(food, nextHead));
    const eatenFood = foodIndex >= 0 ? this.foods[foodIndex] : undefined;
    const grows = Boolean(eatenFood && (eatenFood.type === 'normal' || eatenFood.type === 'rainbow'));
    const collisionBody = grows ? this.snake : this.snake.slice(0, -1);

    if ((this.mode.id !== 'endless' && this.isWallHit(nextHead)) || collisionBody.some((segment) => samePoint(segment, nextHead))) {
      this.finishGame(false);
      return;
    }

    const previousTail = this.snake[this.snake.length - 1];
    this.moveSnake(nextHead);

    if (eatenFood) {
      this.foods.splice(foodIndex, 1);
      this.eaten += 1;
      this.score += GAME_CONFIG.scorePerFood;
      this.callbacks.onEvent?.({ type: 'eat', color: eatenFood.color, foodType: eatenFood.type });
      this.applyFoodEffect(eatenFood, previousTail);
      this.spawnEatEffect(previousTail, eatenFood.type);
      this.refillFoods();
      this.checkModeEndConditions();
    }

    this.draw();
    this.publishSnapshot();
  }

  private moveSnake(nextHead: Segment): void {
    this.snake = this.snake.map((segment, index) => {
      if (index === 0) return { ...segment, x: nextHead.x, y: nextHead.y };
      const previousSegment = this.snake[index - 1];
      return { ...segment, x: previousSegment.x, y: previousSegment.y };
    });
  }

  private applyQueuedDirection(): void {
    const queued = this.directionQueue.shift();
    if (queued && !isOpposite(this.direction, queued)) {
      this.direction = queued;
    } else {
      this.direction = this.nextDirection;
    }
    this.nextDirection = this.directionQueue[0] ?? this.direction;
  }

  private applyFoodEffect(food: Food, previousTail: Segment): void {
    if (food.type === 'normal' || food.type === 'rainbow') {
      this.snake.push({ ...previousTail, color: food.color });
      this.resolveTailElimination();
      return;
    }

    this.callbacks.onEvent?.({ type: 'powerup', foodType: food.type });
    if (food.type === 'bomb') {
      this.eliminateTail(GAME_CONFIG.bombRemoveCount, '炸弹!');
    }
    if (food.type === 'slow') {
      this.slowUntil = this.time.now + GAME_CONFIG.slowDurationMs;
      this.showFloatingText('减速!', 0x9df7ff);
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

    if (this.time.now - this.lastEliminateAt <= GAME_CONFIG.comboWindowMs) this.combo += 1;
    else this.combo = 1;

    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.lastEliminateAt = this.time.now;
    const baseScore = removableCount * GAME_CONFIG.scorePerSegment;
    const comboBonus = this.combo > 1 ? GAME_CONFIG.comboBonusBase * (GAME_CONFIG.comboBonusGrowth ** (this.combo - 2)) : 0;
    const gainedScore = baseScore + comboBonus;
    this.score += gainedScore;
    if (this.effectSettings.screenShakeEnabled) {
      this.cameras.main.shake(130, 0.006);
    }
    this.spawnEliminateParticles(removedSegments);
    const scoreText = this.combo > 1 ? `+${gainedScore}  Combo x${this.combo}` : `+${gainedScore}`;
    this.showFloatingText(label ? `${label} +${gainedScore}` : scoreText, this.combo > 1 ? 0xfff06a : 0xffffff);
    this.callbacks.onEvent?.({ type: 'eliminate', count: removableCount, combo: this.combo });

    if (this.snake.length <= 1) {
      this.regenerateTail(5);
      this.showFloatingText('新尾巴!', 0xfff06a);
    }
  }

  private regenerateTail(count: number): void {
    const head = this.snake[0] ?? {
      x: Math.floor(GAME_CONFIG.boardSize / 2),
      y: Math.floor(GAME_CONFIG.boardSize / 2),
      color: getRandomBasicColor(),
    };

    this.snake = [head];
    let previous = head;
    const colors = this.createRegeneratedTailColors(count);

    for (let index = 0; index < count; index += 1) {
      const nextPoint = this.findTailSpawnPoint(previous);
      const segment = {
        ...nextPoint,
        color: colors[index],
      };
      this.snake.push(segment);
      previous = segment;
    }
  }

  private findTailSpawnPoint(previous: Segment): { x: number; y: number } {
    const reverse = {
      x: -DIRECTIONS[this.direction].x,
      y: -DIRECTIONS[this.direction].y,
    };
    const preferred = { x: previous.x + reverse.x, y: previous.y + reverse.y };
    if (this.canUseTailSpawnPoint(preferred)) return preferred;

    const candidates = [
      { x: previous.x - 1, y: previous.y },
      { x: previous.x + 1, y: previous.y },
      { x: previous.x, y: previous.y - 1 },
      { x: previous.x, y: previous.y + 1 },
    ];

    return candidates.find((point) => this.canUseTailSpawnPoint(point)) ?? previous;
  }

  private canUseTailSpawnPoint(point: { x: number; y: number }): boolean {
    return !this.isWallHit(point) && !this.snake.some((segment) => samePoint(segment, point));
  }

  private createRegeneratedTailColors(count: number): BasicSnakeColor[] {
    const shuffled = [...BASIC_COLOR_IDS].sort(() => Math.random() - 0.5);
    while (shuffled.length < count) {
      shuffled.push(getRandomBasicColor());
    }
    return shuffled.slice(0, count);
  }

  private refillFoods(): void {
    let guard = 0;
    while (this.foods.length < GAME_CONFIG.targetFoodCount && guard < 300) {
      guard += 1;
      const food = this.createFood();
      if (this.isCellFree(food)) this.foods.push(food);
    }
  }

  private createFood(): Food {
    const type = this.pickFoodType();
    return {
      x: Phaser.Math.Between(0, GAME_CONFIG.boardSize - 1),
      y: Phaser.Math.Between(0, GAME_CONFIG.boardSize - 1),
      type,
      color: type === 'rainbow' ? 'rainbow' : this.pickNextFoodColor(),
    };
  }

  private pickFoodType(): FoodType {
    if (this.foods.some((food) => food.type !== 'normal')) return 'normal';
    if (this.eaten < 4 || Math.random() > GAME_CONFIG.specialSpawnChance) return 'normal';
    const roll = Math.random();
    if (roll < 0.36) return 'bomb';
    if (roll < 0.68) return 'rainbow';
    return 'slow';
  }

  private pickNextFoodColor(): BasicSnakeColor {
    const tailTarget = this.getTailTargetColor();
    if (tailTarget && Math.random() < this.getTailTargetWeight()) return tailTarget;
    return this.pickBalancedColor();
  }

  private getTailTargetColor(): BasicSnakeColor | undefined {
    const tail = this.snake.slice(-(GAME_CONFIG.eliminateThreshold - 1));
    if (tail.length < GAME_CONFIG.eliminateThreshold - 1) return undefined;
    const normalColors = tail.filter((segment) => segment.color !== 'rainbow').map((segment) => segment.color as BasicSnakeColor);
    if (normalColors.length === 0) return getRandomBasicColor();
    return normalColors.every((color) => color === normalColors[0]) ? normalColors[0] : undefined;
  }

  private getTailTargetWeight(): number {
    const secondsSinceEliminate = this.lastEliminateAt ? (this.time.now - this.lastEliminateAt) / 1000 : this.getSurvivalSeconds();
    if (secondsSinceEliminate > 18) return 0.72;
    if (secondsSinceEliminate > 10) return 0.58;
    return 0.42;
  }

  private pickBalancedColor(): BasicSnakeColor {
    const counts = new Map<BasicSnakeColor, number>();
    this.foods.forEach((food) => {
      if (food.type === 'normal' && food.color !== 'rainbow') counts.set(food.color as BasicSnakeColor, (counts.get(food.color as BasicSnakeColor) ?? 0) + 1);
    });
    const min = Math.min(...BASIC_COLOR_IDS.map((color) => counts.get(color) ?? 0));
    const rare = BASIC_COLOR_IDS.filter((color) => (counts.get(color) ?? 0) === min);
    return rare[Math.floor(Math.random() * rare.length)];
  }

  private checkModeEndConditions(): void {
    if (this.status !== 'playing') return;

    if (this.hasReachedGoal()) {
      this.finishGame(true);
      return;
    }

    if (this.mode.timeLimitSeconds && this.getRemainingSeconds() <= 0) {
      this.finishGame(false);
      return;
    }

    if (this.mode.stepLimit && this.getStepsLeft() <= 0) {
      this.finishGame(this.mode.id === 'precision' ? this.snake.length === this.mode.targetLength : this.hasReachedGoal());
    }
  }

  private hasReachedGoal(): boolean {
    if (this.mode.id === 'standard') return Boolean(this.mode.targetScore && this.score >= this.mode.targetScore);
    if (this.mode.id === 'timed') {
      return Boolean((this.mode.targetScore && this.score >= this.mode.targetScore) || (this.mode.targetEliminated && this.eliminated >= this.mode.targetEliminated));
    }
    if (this.mode.id === 'steps') return Boolean(this.mode.targetEliminated && this.eliminated >= this.mode.targetEliminated);
    return false;
  }

  private getObjectiveText(): string {
    if (this.mode.id === 'standard') return `目标：达到 ${this.mode.targetScore} 分过关`;
    if (this.mode.id === 'endless') return '目标：穿墙循环，挑战更高分';
    if (this.mode.id === 'timed') return `目标：${this.mode.timeLimitSeconds}s 内 ${this.mode.targetScore} 分或消除 ${this.mode.targetEliminated} 节`;
    if (this.mode.id === 'steps') return `目标：${this.mode.stepLimit} 步内消除 ${this.mode.targetEliminated} 节`;
    return `目标：${this.mode.stepLimit} 步结束时长度 = ${this.mode.targetLength}`;
  }

  private isCellFree(point: { x: number; y: number }): boolean {
    return !this.snake.some((segment) => samePoint(segment, point)) && !this.foods.some((food) => samePoint(food, point));
  }

  private isWallHit(point: { x: number; y: number }): boolean {
    return point.x < 0 || point.y < 0 || point.x >= GAME_CONFIG.boardSize || point.y >= GAME_CONFIG.boardSize;
  }

  private wrapPoint(point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: (point.x + GAME_CONFIG.boardSize) % GAME_CONFIG.boardSize,
      y: (point.y + GAME_CONFIG.boardSize) % GAME_CONFIG.boardSize,
    };
  }

  private handleKeyboardInput(): void {
    if (this.justDown(this.cursors?.left) || this.justDown(this.keys?.A)) this.setDirection('left');
    if (this.justDown(this.cursors?.right) || this.justDown(this.keys?.D)) this.setDirection('right');
    if (this.justDown(this.cursors?.up) || this.justDown(this.keys?.W)) this.setDirection('up');
    if (this.justDown(this.cursors?.down) || this.justDown(this.keys?.S)) this.setDirection('down');
    if (this.justDown(this.keys?.SPACE)) this.togglePause();
  }

  private justDown(key?: Phaser.Input.Keyboard.Key): boolean {
    return Boolean(key && Phaser.Input.Keyboard.JustDown(key));
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.touchStart = new Phaser.Math.Vector2(pointer.x, pointer.y);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.touchStart) return;
    const end = new Phaser.Math.Vector2(pointer.x, pointer.y);
    const delta = end.subtract(this.touchStart);
    this.touchStart = undefined;
    if (delta.length() < 24) return;
    if (Math.abs(delta.x) > Math.abs(delta.y)) this.setDirection(delta.x > 0 ? 'right' : 'left');
    else this.setDirection(delta.y > 0 ? 'down' : 'up');
  }

  private handleResize(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const available = Math.min(width - 10, height - 10);
    this.cellSize = Math.floor(available / GAME_CONFIG.boardSize);
    const boardPixels = this.cellSize * GAME_CONFIG.boardSize;
    this.boardOrigin = {
      x: Math.floor((width - boardPixels) / 2),
      y: Math.floor((height - boardPixels) / 2),
    };
    this.draw();
  }

  private draw(): void {
    if (!this.graphics) return;
    const g = this.graphics;
    const boardPixels = this.cellSize * GAME_CONFIG.boardSize;
    const radius = Math.max(8, this.cellSize * 0.22);

    g.clear();
    g.fillStyle(0x5b321c, 1);
    g.fillRoundedRect(this.boardOrigin.x - 6, this.boardOrigin.y - 6, boardPixels + 12, boardPixels + 12, 16);
    g.fillStyle(0xffd47b, 1);
    g.fillRoundedRect(this.boardOrigin.x, this.boardOrigin.y, boardPixels, boardPixels, 14);

    if (this.isDangerLength()) {
      g.lineStyle(5, 0xff4d2f, 0.8);
      g.strokeRoundedRect(this.boardOrigin.x - 4, this.boardOrigin.y - 4, boardPixels + 8, boardPixels + 8, 16);
    }

    g.lineStyle(1, 0xe9a84e, 0.38);
    for (let index = 1; index < GAME_CONFIG.boardSize; index += 1) {
      const offset = index * this.cellSize;
      g.lineBetween(this.boardOrigin.x + offset, this.boardOrigin.y, this.boardOrigin.x + offset, this.boardOrigin.y + boardPixels);
      g.lineBetween(this.boardOrigin.x, this.boardOrigin.y + offset, this.boardOrigin.x + boardPixels, this.boardOrigin.y + offset);
    }

    this.foods.forEach((food) => this.drawFood(food, radius));
    this.snake.forEach((segment, index) => this.drawSegment(segment, index, radius));
  }

  private drawFood(food: Food, radius: number): void {
    if (!this.graphics) return;
    const rect = this.cellRect(food.x, food.y, 0.22);
    this.graphics.fillStyle(0x2b1710, 1);
    this.graphics.fillRoundedRect(rect.x - 2, rect.y - 2, rect.size + 4, rect.size + 4, radius);
    if (this.shouldGlowFood(food)) {
      this.graphics.lineStyle(4, 0xffffff, 0.5);
      this.graphics.strokeRoundedRect(rect.x - 5, rect.y - 5, rect.size + 10, rect.size + 10, radius + 4);
    }
    this.graphics.fillStyle(this.getFoodFill(food), 1);
    this.graphics.fillRoundedRect(rect.x, rect.y, rect.size, rect.size, radius);

    if (food.type !== 'normal') {
      this.drawSpecialIcon(food, rect);
    }
  }

  private shouldGlowFood(food: Food): boolean {
    const target = this.getTailTargetColor();
    if (!target) return false;
    return food.type === 'rainbow' || (food.type === 'normal' && food.color === target);
  }

  private getFoodFill(food: Food): number {
    if (food.type === 'bomb') return 0xff4d2f;
    if (food.type === 'slow') return 0x8ee7ff;
    return getColorFill(food.color);
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

  private drawSegment(segment: Segment, index: number, radius: number): void {
    if (!this.graphics) return;
    const rect = this.cellRect(segment.x, segment.y, 0.12);
    this.graphics.fillStyle(0x24110b, 1);
    this.graphics.fillRoundedRect(rect.x - 3, rect.y - 3, rect.size + 6, rect.size + 6, radius);
    this.graphics.fillStyle(index === 0 ? 0xffffff : getColorFill(segment.color), 1);
    this.graphics.fillRoundedRect(rect.x, rect.y, rect.size, rect.size, radius);
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
    }
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
    this.callbacks.onSnapshot?.({
      mode: this.mode.id,
      objectiveText: this.getObjectiveText(),
      score: this.score,
      length: this.snake.length,
      combo: this.combo,
      maxCombo: this.maxCombo,
      eliminated: this.eliminated,
      eaten: this.eaten,
      stepsUsed: this.stepsUsed,
      stepsLeft: this.mode.stepLimit ? this.getStepsLeft() : undefined,
      remainingSeconds: this.mode.timeLimitSeconds ? this.getRemainingSeconds() : undefined,
      survivalSeconds: this.getSurvivalSeconds(),
      bestScore: getBestScore(),
      bestSurvivalSeconds: getBestSurvivalSeconds(),
      bestCombo: getBestCombo(),
      isDanger: this.isDangerLength(),
      isSlowed: this.time.now < this.slowUntil,
      objectiveCompleted: this.objectiveCompleted,
      status: this.status,
    });
  }

  private getSurvivalSeconds(): number {
    const activeUntil = this.status === 'paused' ? this.pausedAt : this.time.now;
    return Math.max(0, Math.floor((activeUntil - this.startAt - this.pausedDuration) / 1000));
  }

  private getRemainingSeconds(): number {
    if (!this.mode.timeLimitSeconds) return 0;
    return Math.max(0, this.mode.timeLimitSeconds - this.getSurvivalSeconds());
  }

  private getStepsLeft(): number {
    if (!this.mode.stepLimit) return 0;
    return Math.max(0, this.mode.stepLimit - this.stepsUsed);
  }

  private getMoveInterval(): number {
    let interval = GAME_CONFIG.moveIntervalMs - this.getModeSpeedBonus();
    if (this.time.now < this.slowUntil) interval *= 1.5;
    return Math.max(135, interval);
  }

  private getModeSpeedBonus(): number {
    if (this.mode.id === 'standard') {
      return Math.min(24, Math.floor(this.score / 500) * 8);
    }

    if (this.mode.id === 'endless') {
      return Math.min(35, Math.floor(this.score / 900) * 7);
    }

    if (this.mode.id === 'timed') {
      const elapsed = this.mode.timeLimitSeconds ? this.getSurvivalSeconds() / this.mode.timeLimitSeconds : 0;
      return elapsed > 0.72 ? 18 : elapsed > 0.45 ? 10 : 0;
    }

    if (this.mode.id === 'steps') {
      const usedRatio = this.mode.stepLimit ? this.stepsUsed / this.mode.stepLimit : 0;
      return usedRatio > 0.75 ? 12 : 0;
    }

    return 0;
  }

  private isDangerLength(): boolean {
    return this.snake.length >= GAME_CONFIG.initialLength * 3;
  }

  private showFloatingText(message: string, color: number): void {
    const x = this.boardOrigin.x + (this.cellSize * GAME_CONFIG.boardSize) / 2;
    const y = this.boardOrigin.y + this.cellSize * 1.2;
    const text = this.add.text(x, y, message, {
      fontFamily: 'Trebuchet MS, Microsoft YaHei, sans-serif',
      fontSize: `${Math.max(18, Math.floor(this.cellSize * 0.6))}px`,
      fontStyle: 'bold',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#2d170d',
      strokeThickness: 5,
    });
    text.setOrigin(0.5);
    this.tweens.add({
      targets: text,
      y: y - this.cellSize * 0.8,
      alpha: 0,
      scale: 1.18,
      duration: 520,
      ease: 'Back.easeOut',
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
    const result: GameResult = {
      mode: this.mode.id,
      objectiveText: this.getObjectiveText(),
      score: this.score,
      length: this.snake.length,
      combo: this.combo,
      maxCombo: this.maxCombo,
      eliminated: this.eliminated,
      eaten: this.eaten,
      stepsUsed: this.stepsUsed,
      stepsLeft: this.mode.stepLimit ? this.getStepsLeft() : undefined,
      remainingSeconds: this.mode.timeLimitSeconds ? this.getRemainingSeconds() : undefined,
      survivalSeconds: this.getSurvivalSeconds(),
      bestScore: 0,
      bestSurvivalSeconds: getBestSurvivalSeconds(),
      bestCombo: getBestCombo(),
      isDanger: this.isDangerLength(),
      isSlowed: this.time.now < this.slowUntil,
      objectiveCompleted,
      status: this.status,
      finalLength: this.snake.length,
    };
    const bestScore = saveResult(result);
    const withBest = { ...result, bestScore };
    this.callbacks.onSnapshot?.(withBest);
    this.callbacks.onGameOver?.(withBest);
    this.callbacks.onEvent?.({ type: 'gameover', objectiveCompleted });
    this.draw();
  }
}
