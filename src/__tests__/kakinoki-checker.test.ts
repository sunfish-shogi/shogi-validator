import { describe, it, expect } from 'vitest'
import { checkKIF, checkKI2 } from '../kakinoki-checker'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// A valid KIF with time column, one move, proper formatting → score 100
const VALID_KIF_WITH_TIME = [
  '手合割：平手　　',
  '手数----指手---------消費時間--',
  '   1 ７六歩(77)   ( 0:01/00:00:01)',
  '',
].join('\n')

// A valid KIF without time column → score 100
const VALID_KIF_NO_TIME = [
  '手数----指手--',
  '   1 ７六歩(77)  ',
  '',
].join('\n')

// ---------------------------------------------------------------------------
// checkKIF
// ---------------------------------------------------------------------------
describe('checkKIF', () => {
  describe('セパレータ', () => {
    it('時間列ありのセパレータで score 100', () => {
      const result = checkKIF('手数----指手---------消費時間--\n')
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('時間列なしのセパレータで score 100', () => {
      const result = checkKIF('手数----指手--\n')
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('セパレータなしでスコアが下がり issue が出る', () => {
      const result = checkKIF('手合割：平手　　\n')
      expect(result.score).toBeLessThan(100)
      expect(result.issues.some(i => i.includes('セパレータ'))).toBe(true)
    })
  })

  describe('メタデータ', () => {
    it('半角コロンのメタデータは issue が出る', () => {
      const kif = '手合割: 平手\n手数----指手---------消費時間--\n'
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('半角コロン'))).toBe(true)
    })

    it('全角コロンのメタデータは issue が出ない', () => {
      const kif = '棋戦：テスト\n手数----指手---------消費時間--\n'
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('半角コロン'))).toBe(false)
    })

    it('手合割が正しくパディング済み（全角4文字＝幅8）なら issue なし', () => {
      const kif = '手合割：平手　　\n手数----指手---------消費時間--\n'
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('手合割'))).toBe(false)
    })

    it('手合割のパディング不足は issue が出る', () => {
      const kif = '手合割：平手\n手数----指手---------消費時間--\n'
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('手合割'))).toBe(true)
    })
  })

  describe('末尾の空行', () => {
    it('末尾が空行でないと issue が出る', () => {
      const result = checkKIF('手数----指手---------消費時間--')
      expect(result.issues.some(i => i.includes('末尾'))).toBe(true)
    })

    it('末尾が空行なら issue なし', () => {
      const result = checkKIF('手数----指手---------消費時間--\n')
      expect(result.issues.some(i => i.includes('末尾'))).toBe(false)
    })
  })

  describe('指し手行（時間列あり）', () => {
    it('正常なKIF（時間列あり）はスコア100', () => {
      const result = checkKIF(VALID_KIF_WITH_TIME)
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('手数フィールドが右詰めでないと issue が出る', () => {
      // 手数の後にスペースがない → /^ {0,3}\d{1,4} / にマッチしない
      const kif = [
        '手数----指手---------消費時間--',
        '   1７六歩(77)   ( 0:01/00:00:01)',  // 手数と指し手の間にスペースなし
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('手数フィールド'))).toBe(true)
    })

    it('不正な駒名を含む指し手は issue が出る（王は無効、玉のみ有効）', () => {
      const kif = [
        '手数----指手---------消費時間--',
        '   1 ７六王(77)   ( 0:01/00:00:01)',
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('不正な駒名'))).toBe(true)
    })

    it('すべての駒名が有効なら駒名の issue なし', () => {
      const kif = [
        '手数----指手---------消費時間--',
        '   1 ７六歩(77)   ( 0:01/00:00:01)',
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('不正な駒名'))).toBe(false)
    })

    it('同の後に全角スペースがないと issue が出る', () => {
      const kif = [
        '手数----指手---------消費時間--',
        '   1 ７六歩(77)   ( 0:01/00:00:01)',
        '   2 同歩(87)     ( 0:01/00:00:02)',  // 同の後が全角スペースでない
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('全角スペース'))).toBe(true)
    })

    it('同の後に全角スペースがある指し手は issue なし', () => {
      const kif = [
        '手数----指手---------消費時間--',
        '   1 ７六歩(77)   ( 0:01/00:00:01)',
        '   2 同　歩(87)   ( 0:01/00:00:02)',  // 同　（全角スペース）
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('全角スペース'))).toBe(false)
    })

    it('指し手テキストが13表示幅でないと issue が出る（時間列あり）', () => {
      const kif = [
        '手数----指手---------消費時間--',
        '   1 ７六歩(77)  ( 0:01/00:00:01)',  // スペース2個で12幅 → 13幅NG
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('13表示幅'))).toBe(true)
    })

    it('消費時間の形式が不正（分がゼロパディング）なら issue が出る', () => {
      const kif = [
        '手数----指手---------消費時間--',
        '   1 ７六歩(77)   (01:01/00:00:01)',  // ` 1:` でなく `01:` はNG
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('消費時間'))).toBe(true)
    })

    it('消費時間の形式が正しければ issue なし', () => {
      const result = checkKIF(VALID_KIF_WITH_TIME)
      expect(result.issues.some(i => i.includes('消費時間'))).toBe(false)
    })
  })

  describe('指し手行（時間列なし）', () => {
    it('正常なKIF（時間列なし）はスコア100', () => {
      const result = checkKIF(VALID_KIF_NO_TIME)
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('指し手テキストが12表示幅でないと issue が出る（時間列なし）', () => {
      const kif = [
        '手数----指手--',
        '   1 ７六歩(77) ',  // スペース1個で11幅 → 12幅NG
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('12表示幅'))).toBe(true)
    })
  })

  describe('分岐マーカー', () => {
    it('+ と 変化：N手 が一致していれば issue なし', () => {
      const kif = [
        '手数----指手---------消費時間--',
        '   1 ７六歩(77)   ( 0:01/00:00:01)+',
        '   2 ３四歩(34)   ( 0:01/00:00:02)',
        '変化：1手',
        '   1 ２六歩(27)   ( 0:01/00:00:01)',
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('+'))).toBe(false)
      expect(result.issues.some(i => i.includes('分岐'))).toBe(false)
    })

    it('変化：N手 のない手に + が付いていると issue が出る', () => {
      const kif = [
        '手数----指手---------消費時間--',
        '   1 ７六歩(77)   ( 0:01/00:00:01)+',  // 変化：1手 がない
        '   2 ３四歩(34)   ( 0:01/00:00:02)',
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('+') && i.includes('変化'))).toBe(true)
    })

    it('分岐があるのに + のない手があると issue が出る', () => {
      const kif = [
        '手数----指手---------消費時間--',
        '   1 ７六歩(77)   ( 0:01/00:00:01)',  // + がない
        '変化：1手',
        '   1 ２六歩(27)   ( 0:01/00:00:01)',
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('分岐') && i.includes('+'))).toBe(true)
    })
  })

  describe('認識できない行', () => {
    it('認識できない行があると issue が出る', () => {
      const kif = [
        '手数----指手---------消費時間--',
        'UNRECOGNIZED LINE',
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('認識できない'))).toBe(true)
    })

    it('コメント行・棋譜コメント行は認識できる行として扱われる', () => {
      const kif = [
        '# ヘッダコメント',
        '手数----指手---------消費時間--',
        '* 棋譜コメント',
        '',
      ].join('\n')
      const result = checkKIF(kif)
      expect(result.issues.some(i => i.includes('認識できない'))).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// checkKI2
// ---------------------------------------------------------------------------
describe('checkKI2', () => {
  describe('基本', () => {
    it('正常なKI2はスコア100', () => {
      const ki2 = '▲７六歩 △３四歩 ▲２六歩\n'
      const result = checkKI2(ki2)
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('▽（後手番）の指し手もスコア100', () => {
      const ki2 = '▽３四歩\n'
      const result = checkKI2(ki2)
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('複数行の指し手行はスコア100', () => {
      const ki2 = [
        '▲７六歩 △３四歩 ▲２六歩 △８四歩',
        '▲２五歩 △８五歩 ▲７八金 △３二金',
        '',
      ].join('\n')
      const result = checkKI2(ki2)
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('末尾が空行でないと issue が出る', () => {
      const result = checkKI2('▲７六歩')
      expect(result.issues.some(i => i.includes('末尾'))).toBe(true)
    })
  })

  describe('メタデータ', () => {
    it('半角コロンのメタデータは issue が出る', () => {
      const ki2 = '手合割: 平手\n▲７六歩\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('半角コロン'))).toBe(true)
    })

    it('平手局面で手合割行があると issue が出る', () => {
      const ki2 = '手合割：平手\n▲７六歩\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('平手'))).toBe(true)
    })

    it('平手以外の手合割行は issue が出ない', () => {
      const ki2 = '手合割：香落ち\n▲７六歩\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('平手'))).toBe(false)
    })
  })

  describe('指し手トークン', () => {
    it('▲/△/▽で始まらないトークンがあると issue が出る', () => {
      const ki2 = '▲７六歩 無効トークン △３四歩\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('▲/△/▽'))).toBe(true)
    })

    it('不正な駒名は issue が出る（王は無効）', () => {
      const ki2 = '▲７六王\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('不正な駒名'))).toBe(true)
    })

    it('すべての駒名が有効なら issue なし', () => {
      const ki2 = '▲７六歩 △３四歩 ▲６八銀 △８五歩\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('不正な駒名'))).toBe(false)
    })

    it('成駒の駒名（馬・龍・竜・と・成香・成桂・成銀）は有効', () => {
      const ki2 = '▲２二馬 △３三龍 ▲４四竜 △５五と\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('不正な駒名'))).toBe(false)
    })
  })

  describe('同の後のスペース', () => {
    it('同 + 全角スペース + 1文字の駒は有効', () => {
      const ki2 = '▲７六歩 △同　歩\n'  // 同　歩（全角スペース）
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('同'))).toBe(false)
    })

    it('同 + スペースなし + 2文字の駒は有効（例: 飛成）', () => {
      const ki2 = '▲７六飛 △同飛成\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('同'))).toBe(false)
    })

    it('同 + スペースなし + 1文字の駒は無効', () => {
      const ki2 = '▲７六歩 △同歩\n'  // 同歩（スペースなし・1文字）はNG
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('同'))).toBe(true)
    })
  })

  describe('認識できない行', () => {
    it('認識できない行があると issue が出る', () => {
      const ki2 = 'UNRECOGNIZED\n▲７六歩\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('認識できない'))).toBe(true)
    })

    it('まで行は認識できる行として扱われる', () => {
      const ki2 = '▲７六歩\nまで1手で先手の勝ち\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('認識できない'))).toBe(false)
    })

    it('変化：行は認識できる行として扱われる', () => {
      const ki2 = '▲７六歩\n変化：1手\n▲２六歩\n'
      const result = checkKI2(ki2)
      expect(result.issues.some(i => i.includes('認識できない'))).toBe(false)
    })
  })
})
