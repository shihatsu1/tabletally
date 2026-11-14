import type { PlayEngine } from '../core/play';
import { pokerEngine } from './poker/engine';
import { pusoyEngine } from './pusoy/engine';
import { pusoyDosEngine } from './pusoy-dos/engine';
import { tongItsEngine } from './tong-its/engine';

// Games that can be played in the app (digital play). Adding an engine = one line here.
export const engines: Readonly<Record<string, PlayEngine>> = {
  'pusoy-dos': pusoyDosEngine,
  poker: pokerEngine,
  pusoy: pusoyEngine,
  'tong-its': tongItsEngine,
};

export const getEngine = (gameId: string): PlayEngine | undefined =>
  Object.prototype.hasOwnProperty.call(engines, gameId) ? engines[gameId] : undefined;

export const canPlayInApp = (gameId: string): boolean => getEngine(gameId) !== undefined;
