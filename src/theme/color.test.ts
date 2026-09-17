import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  darkenHex,
  gradeOf,
  hexToRgb,
  lightenHex,
  mixHex,
  normalizeHex,
  relativeLuminance,
  rgbToHex,
} from './color';

describe('颜色解析与变换', () => {
  it('normalizeHex 支持 #rgb 与 #rrggbb，拒绝非法输入', () => {
    expect(normalizeHex('#fff')).toBe('#ffffff');
    expect(normalizeHex('3B82F6')).toBe('#3b82f6');
    expect(normalizeHex('#12')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
  });

  it('hex ↔ rgb 往返一致', () => {
    expect(rgbToHex(hexToRgb('#2563eb'))).toBe('#2563eb');
  });

  it('lighten/darken 按 HSL 明度移动并夹取到边界', () => {
    expect(lightenHex('#000000', 0.5)).toBe('#808080');
    expect(darkenHex('#ffffff', 1)).toBe('#000000');
    expect(lightenHex('#ffffff', 0.2)).toBe('#ffffff');
  });

  it('mix 在两端点之间线性插值', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('WCAG 对比度', () => {
  it('黑白对比度为 21:1，同色为 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('相对亮度：黑为 0，白为 1', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('评级阈值：AA 4.5 / AAA 7，大字放宽到 3 / 4.5', () => {
    expect(gradeOf(7.2, 14).label).toBe('AAA');
    expect(gradeOf(4.6, 14).label).toBe('AA');
    expect(gradeOf(3.5, 14)).toEqual({ label: '仅大字 AA', pass: false });
    expect(gradeOf(3.5, 24)).toEqual({ label: 'AA', pass: true });
    expect(gradeOf(2.0, 14).label).toBe('未通过');
  });
});
