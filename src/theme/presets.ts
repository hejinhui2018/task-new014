/**
 * 内置示例场景。
 *
 * - 默认主题：健康的品牌主题，浅色 / 深色全部通过对比度检查。
 *   深色主题只覆盖少量令牌，其余靠引用与变换自动适配，
 *   用来演示「改一个基础令牌，两个主题一起更新」。
 * - 高对比度 · 问题示例：故意包含对比度不足、循环依赖与缺失引用，
 *   模拟一次「糟糕的导入」，用于演示右侧诊断面板。
 */

import type { Scenario, ThemeDocument, TokenValue } from './types';

const ref = (token: string): TokenValue => ({ kind: 'ref', token });
const darken = (token: string, amount: number): TokenValue => ({
  kind: 'transform',
  op: 'darken',
  token,
  amount,
});
const lighten = (token: string, amount: number): TokenValue => ({
  kind: 'transform',
  op: 'lighten',
  token,
  amount,
});
const mix = (token: string, other: string, amount: number): TokenValue => ({
  kind: 'transform',
  op: 'mix',
  token,
  other,
  amount,
});

const BASE: Record<string, string> = {
  white: '#ffffff',
  'gray.50': '#f8fafc',
  'gray.100': '#f1f5f9',
  'gray.200': '#e2e8f0',
  'gray.300': '#cbd5e1',
  'gray.500': '#64748b',
  'gray.600': '#475569',
  'gray.700': '#334155',
  'gray.800': '#1e293b',
  'gray.900': '#0f172a',
  'blue.400': '#60a5fa',
  'blue.500': '#3b82f6',
  'blue.600': '#2563eb',
  'blue.700': '#1d4ed8',
  'red.600': '#dc2626',
  'amber.100': '#fef3c7',
  'amber.400': '#fbbf24',
  'amber.500': '#f59e0b',
  'amber.900': '#78350f',
};

const SEMANTIC_LIGHT: Record<string, TokenValue> = {
  // 表面与边框
  'surface.page': ref('gray.50'),
  'surface.card': ref('white'),
  'surface.muted': ref('gray.100'),
  'border.default': ref('gray.200'),
  // 文本
  'text.primary': ref('gray.900'),
  'text.secondary': ref('gray.600'),
  'text.inverse': ref('white'),
  'text.link': ref('blue.600'),
  'text.link.hover': darken('text.link', 0.1),
  // 主按钮：hover / disabled 全部由基础色推导
  'action.primary.bg': ref('blue.600'),
  'action.primary.bg.hover': darken('action.primary.bg', 0.08),
  'action.primary.bg.disabled': mix('action.primary.bg', 'surface.page', 0.75),
  'action.primary.text': ref('white'),
  'action.primary.text.disabled': mix('action.primary.text', 'action.primary.bg.disabled', 0.45),
  // 次按钮
  'action.secondary.bg': ref('surface.card'),
  'action.secondary.bg.hover': mix('action.secondary.text', 'action.secondary.bg', 0.94),
  'action.secondary.bg.disabled': ref('surface.muted'),
  'action.secondary.text': ref('blue.600'),
  'action.secondary.text.disabled': ref('text.secondary'),
  'action.secondary.border': ref('gray.300'),
  'action.secondary.border.disabled': ref('border.default'),
  // 危险按钮
  'action.danger.bg': ref('red.600'),
  'action.danger.bg.hover': darken('action.danger.bg', 0.08),
  'action.danger.bg.disabled': mix('action.danger.bg', 'surface.page', 0.75),
  'action.danger.text': ref('white'),
  'action.danger.text.disabled': mix('action.danger.text', 'action.danger.bg.disabled', 0.45),
  // 表单
  'field.bg': ref('white'),
  'field.bg.disabled': ref('surface.muted'),
  'field.border': ref('gray.300'),
  'field.text': ref('text.primary'),
  'field.text.disabled': ref('text.secondary'),
  'field.placeholder': ref('text.secondary'),
  // 反馈
  'badge.bg': mix('blue.600', 'surface.card', 0.88),
  'badge.text': ref('blue.700'),
  'alert.warning.bg': ref('amber.100'),
  'alert.warning.text': ref('amber.900'),
  'alert.warning.border': ref('amber.500'),
  'info.bg': mix('blue.500', 'surface.card', 0.9),
  'info.text': ref('blue.700'),
  // 焦点
  'focus.ring': ref('blue.500'),
};

/** 深色只覆盖需要变化的令牌，其余（含 hover/disabled 变换）自动继承 */
const SEMANTIC_DARK: Record<string, TokenValue> = {
  'surface.page': ref('gray.900'),
  'surface.card': ref('gray.800'),
  'surface.muted': lighten('surface.page', 0.04),
  'border.default': ref('gray.700'),
  'text.primary': ref('gray.50'),
  'text.secondary': ref('gray.300'),
  'text.inverse': ref('gray.900'),
  'text.link': ref('blue.400'),
  'action.secondary.text': ref('blue.400'),
  'action.secondary.border': ref('gray.700'),
  'field.bg': ref('gray.800'),
  'field.border': ref('gray.700'),
  'badge.text': ref('blue.400'),
  'alert.warning.bg': mix('amber.500', 'surface.card', 0.84),
  'alert.warning.text': ref('amber.400'),
  'info.text': ref('blue.400'),
};

export const defaultScenario: Scenario = {
  id: 'default',
  name: '默认主题',
  description: '健康的品牌主题：浅色 / 深色均通过对比度检查',
  doc: {
    base: { ...BASE },
    semantic: { ...SEMANTIC_LIGHT },
    dark: {
      base: {},
      semantic: { ...SEMANTIC_DARK },
    },
  },
};

/**
 * 问题场景：故意制造三类问题——
 *  1) 对比度不足：次要文字 / 链接 / 主按钮 / 徽标 / 警示等；
 *  2) 循环依赖：info.bg ↔ info.text 互相引用（一次糟糕的复制粘贴）；
 *  3) 缺失引用：field.border 指向不存在的 gray.250。
 */
export const brokenScenario: Scenario = {
  id: 'high-contrast-broken',
  name: '高对比度 · 问题示例',
  description: '故意包含对比度不足、循环依赖与缺失引用，用于演示诊断能力',
  doc: {
    base: { ...BASE },
    semantic: {
      ...SEMANTIC_LIGHT,
      'surface.page': ref('white'),
      // 太浅的文字
      'text.secondary': ref('gray.300'),
      'text.link': ref('amber.500'),
      // 白字放在浅灰按钮上
      'action.primary.bg': ref('gray.300'),
      'action.primary.bg.hover': darken('action.primary.bg', 0.08),
      'action.primary.bg.disabled': mix('action.primary.bg', 'surface.page', 0.6),
      // 浅琥珀色互相叠放
      'badge.bg': ref('amber.100'),
      'badge.text': ref('amber.500'),
      'alert.warning.text': ref('amber.500'),
      // 循环依赖：两个令牌互相引用
      'info.bg': ref('info.text'),
      'info.text': ref('info.bg'),
      // 缺失引用：gray.250 不存在
      'field.border': ref('gray.250'),
    },
    dark: {
      base: {},
      semantic: {
        ...SEMANTIC_DARK,
        // 深灰文字放在深色背景上
        'text.primary': ref('gray.700'),
        // 深色主题下主按钮同样过浅
        'action.primary.bg': ref('gray.300'),
      },
    },
  },
};

export const SCENARIOS: Scenario[] = [defaultScenario, brokenScenario];

export function cloneDocument(doc: ThemeDocument): ThemeDocument {
  return {
    base: { ...doc.base },
    semantic: { ...doc.semantic },
    dark: {
      base: { ...doc.dark.base },
      semantic: { ...doc.dark.semantic },
    },
  };
}
