import { ROOM_CODE_PATTERN } from '../../shared/protocol';

export function roomCodeFromQr(value: string, origin: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.pathname !== '/') return null;
    const match = /^#\/r\/([a-z0-9]{6})$/i.exec(url.hash);
    const code = match?.[1]?.toUpperCase() ?? '';
    return ROOM_CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
}
