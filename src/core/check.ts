/**
 * Small guards for untrusted JSON (room options, round inputs and moves arrive from phones). Shared by every game
 * module and the wire protocol so each check means the same thing everywhere.
 */

/** A whole number JavaScript can represent exactly. */
export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/** A plain object (not null, not an array). */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The object's own property, never one inherited from Object.prototype (so "__proto__" or "toString" cannot sneak in). */
export const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
