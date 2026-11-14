import type { GameModule } from '../core/game';
import { poker } from './poker';
import { pusoy } from './pusoy';
import { pusoyDos } from './pusoy-dos';
import { tongIts } from './tong-its';

// The registry lists every game's scoring module. Adding a game = add a folder and one line here (plus its engine
// in engines.ts and its screens in src/web/games/index.ts; see CONTRIBUTING.md).
// Games keep their own options and round types; the registry stores them side by side, so the types are erased
// here. Every input is validated by the game itself before it is scored.
export type AnyGame = GameModule<any, any>;

export const games: Readonly<Record<string, AnyGame>> = {
  [pusoyDos.id]: pusoyDos,
  [pusoy.id]: pusoy,
  [tongIts.id]: tongIts,
  [poker.id]: poker,
};

export function getGame(id: string): AnyGame | undefined {
  return Object.prototype.hasOwnProperty.call(games, id) ? games[id] : undefined;
}
