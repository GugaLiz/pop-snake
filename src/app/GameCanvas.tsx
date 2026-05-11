import * as Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { GameModeId } from '../config/gameConfig';
import { MainScene } from '../game/scenes/MainScene';
import type { Direction, GameEvent, GameResult, GameSnapshot } from '../game/types';

type GameCanvasProps = {
  onSnapshot: (snapshot: GameSnapshot) => void;
  onGameOver: (result: GameResult) => void;
  onEvent: (event: GameEvent) => void;
  screenShakeEnabled: boolean;
  inputLocked: boolean;
  mode: GameModeId;
  command: { type: Direction | 'pause' | 'restart' | 'restart-play' | 'start' | 'skill' | 'upgrade-0' | 'upgrade-1' | 'upgrade-2' | 'puzzle-replay' | 'puzzle-next'; id: number } | null;
};

export function GameCanvas({ onSnapshot, onGameOver, onEvent, screenShakeEnabled, inputLocked, mode, command }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<MainScene | null>(null);
  const lastModeRef = useRef<GameModeId>(mode);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    gameRef.current?.destroy(true);
    gameRef.current = null;
    sceneRef.current = null;

    const scene = new MainScene();
    scene.setCallbacks({ onSnapshot, onGameOver, onEvent });
    scene.setEffectSettings({ screenShakeEnabled });
    sceneRef.current = scene;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: '#f7a72f',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: hostRef.current.clientWidth,
        height: hostRef.current.clientHeight,
      },
      input: {
        activePointers: 3,
      },
      scene,
    });

    resizeObserverRef.current = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        gameRef.current?.scale.resize(Math.floor(width), Math.floor(height));
      }
    });
    resizeObserverRef.current.observe(hostRef.current);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [onEvent, onGameOver, onSnapshot, screenShakeEnabled]);

  useEffect(() => {
    if (lastModeRef.current === mode) return;
    lastModeRef.current = mode;
    sceneRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    sceneRef.current?.setInputLocked(inputLocked);
  }, [inputLocked]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !command) return;

    if (command.type === 'pause') {
      scene.togglePause();
      return;
    }

    if (command.type === 'restart') {
      scene.restart();
      return;
    }

    if (command.type === 'restart-play') {
      scene.restart();
      scene.startGame();
      return;
    }

    if (command.type === 'puzzle-replay') {
      scene.replayPuzzleLevel();
      scene.startGame();
      return;
    }

    if (command.type === 'puzzle-next') {
      scene.nextPuzzleLevel();
      scene.startGame();
      return;
    }

    if (command.type === 'start') {
      scene.startGame();
      return;
    }

    if (command.type === 'skill') {
      scene.activateSkill();
      return;
    }

    if (command.type.startsWith('upgrade-')) {
      scene.chooseUpgrade(Number(command.type.slice(-1)));
      return;
    }

    if (command.type === 'up' || command.type === 'down' || command.type === 'left' || command.type === 'right') {
      scene.setDirection(command.type);
    }
  }, [command]);

  return <div className="game-canvas" ref={hostRef} aria-label="消消蛇游戏区域" />;
}
