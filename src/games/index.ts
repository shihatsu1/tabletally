import type { GameModule } from '../core/game';
import { poker } from './poker';
import { pusoy } from './pusoy';
import { pusoyDos } from './pusoy-dos';
import { tongIts } from './tong-its';

// The registry is the only place that lists games. Adding a game = add a folder and one line here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
