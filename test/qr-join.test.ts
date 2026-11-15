import { describe, expect, it } from 'vitest';
import { roomCodeFromQr } from '../src/web/lib/qr-join';

describe('table QR invitations', () => {
  it('accepts only valid table links on the current origin', () => {
    expect(roomCodeFromQr('https://example.com/#/r/ABC234', 'https://example.com')).toBe('ABC234');
    expect(roomCodeFromQr('https://example.com/#/r/abc234', 'https://example.com')).toBe('ABC234');
    expect(roomCodeFromQr('https://evil.example/#/r/ABC234', 'https://example.com')).toBeNull();
    expect(roomCodeFromQr('https://example.com/#/r/INVALID', 'https://example.com')).toBeNull();
    expect(roomCodeFromQr('not a link', 'https://example.com')).toBeNull();
  });
});
