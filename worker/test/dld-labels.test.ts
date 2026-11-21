// The label the Worker (and the weekly sync's precomputed bodies) gives the DLD area Jabal Ali First (owner 2026-11-21):
// Jebel Ali Village, Al Furjan, Discovery Gardens, never Jumeirah Lake Towers (that community is under Al Thanyah Fifth).
import { describe, expect, it } from 'vitest';
import { rankAreas } from '../src/market-core';

describe('DLD area labels', () => {
  it('Jabal Ali First is never labelled Jumeirah Lake Towers', () => {
    const { areas } = rankAreas([{ area_en: 'Jabal Ali First', value: 1e9, count: 10, offplan: 5 }], []);
    expect(areas[0]!.label).toBe('Jebel Ali Village, Al Furjan, Discovery Gardens');
    expect(areas[0]!.label).not.toMatch(/Jumeirah Lake Towers|\bJLT\b/i);
  });
});
