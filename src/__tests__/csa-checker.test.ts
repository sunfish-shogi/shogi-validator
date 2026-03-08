import { describe, it, expect } from 'vitest'
import { checkCSA } from '../csa-checker'

// ---------------------------------------------------------------------------
// checkCSA
// ---------------------------------------------------------------------------
describe('checkCSA', () => {
  describe('基本', () => {
    it('空のCSAはスコア100', () => {
      const result = checkCSA('')
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('コメントのみはスコア100', () => {
      const result = checkCSA("'対局コメント\n'備考\n")
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('バージョン・プレイヤー・セパレータ行は認識される', () => {
      const csa = 'V3.0\nN+先手\nN-後手\n/\n'
      const result = checkCSA(csa)
      expect(result.issues.some(i => i.includes('認識できない'))).toBe(false)
    })

    it('+/- ターン行は認識される', () => {
      const result = checkCSA('+\n-\n')
      expect(result.issues.some(i => i.includes('認識できない'))).toBe(false)
    })
  })

  describe('認識できない行', () => {
    it('認識できない行があると issue が出る', () => {
      const result = checkCSA('UNKNOWN_LINE\n')
      expect(result.issues.some(i => i.includes('認識できない'))).toBe(true)
    })

    it('認識できない行の割合に応じてスコアが下がる', () => {
      // 有効な指し手1行 + 無効1行 → 部分スコア
      const result = checkCSA('+7776FU\nBAD\n')
      expect(result.score).toBeGreaterThan(0)
      expect(result.score).toBeLessThan(100)
    })
  })

  describe('指し手形式', () => {
    it('正常な指し手はスコア100', () => {
      const result = checkCSA('+7776FU\n-3334FU\n')
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('不正な指し手形式（短すぎる）は issue が出る', () => {
      const result = checkCSA('+77FU\n')
      expect(result.issues.some(i => i.includes('指し手の形式'))).toBe(true)
    })

    it('不正な駒名は issue が出る', () => {
      const result = checkCSA('+7776XX\n')
      expect(result.issues.some(i => i.includes('駒名が不正'))).toBe(true)
    })

    it('すべての有効駒名がエラーにならない（FU/KY/KE/GI/KI/KA/HI/OU）', () => {
      const moves = [
        '+7776FU', '+7776KY', '+7776KE', '+7776GI',
        '+7776KI', '+7776KA', '+7776HI', '+7776OU',
      ].join('\n') + '\n'
      const result = checkCSA(moves)
      expect(result.issues.some(i => i.includes('駒名が不正'))).toBe(false)
    })

    it('すべての成駒名がエラーにならない（TO/NY/NK/NG/UM/RY）', () => {
      const moves = [
        '+7776TO', '+7776NY', '+7776NK', '+7776NG', '+7776UM', '+7776RY',
      ].join('\n') + '\n'
      const result = checkCSA(moves)
      expect(result.issues.some(i => i.includes('駒名が不正'))).toBe(false)
    })

    it('打ち駒に使えない駒（OU・成駒）は issue が出る', () => {
      const result = checkCSA('+0076OU\n')
      expect(result.issues.some(i => i.includes('打ち駒'))).toBe(true)
    })

    it('打てる駒（FU/KY/KE/GI/KI/KA/HI）は打ち駒で issue が出ない', () => {
      const result = checkCSA('+0076FU\n')
      expect(result.issues.some(i => i.includes('打ち駒'))).toBe(false)
    })

    it('移動先が00の指し手は issue が出る', () => {
      const result = checkCSA('+7600FU\n')
      expect(result.issues.some(i => i.includes('移動先'))).toBe(true)
    })

    it('カンマ区切りの複合行も正しく解析される', () => {
      const result = checkCSA('+7776FU,T10\n')
      expect(result.score).toBe(100)
    })
  })

  describe('終局・特殊手', () => {
    it('有効な終局キーワード（TORYO）は issue が出ない', () => {
      const result = checkCSA('%TORYO\n')
      expect(result.issues).toHaveLength(0)
    })

    it('すべての有効な終局キーワードは issue が出ない', () => {
      const specials = [
        'TORYO', 'CHUDAN', 'SENNICHITE', 'TIME_UP', 'ILLEGAL_MOVE',
        '+ILLEGAL_ACTION', '-ILLEGAL_ACTION', 'JISHOGI', 'KACHI',
        'HIKIWAKE', 'MAX_MOVES', 'TSUMI', 'FUZUMI', 'ERROR',
      ]
      for (const s of specials) {
        const result = checkCSA(`%${s}\n`)
        expect(result.issues, `%${s} should have no issues`).toHaveLength(0)
      }
    })

    it('%MATTA は V3.0 で廃止されたため issue が出る', () => {
      const result = checkCSA('%MATTA\n')
      expect(result.issues.some(i => i.includes('%MATTA'))).toBe(true)
    })

    it('不正な終局キーワードは issue が出る', () => {
      const result = checkCSA('%UNKNOWN_END\n')
      expect(result.issues.some(i => i.includes('不正な終局'))).toBe(true)
    })
  })

  describe('消費時間', () => {
    it('正常な整数秒の消費時間はスコアを下げない', () => {
      const result = checkCSA('+7776FU\nT10\n')
      expect(result.score).toBe(100)
    })

    it('小数点付き消費時間（最大3桁）はスコアを下げない', () => {
      const result = checkCSA('+7776FU\nT10.123\n')
      expect(result.score).toBe(100)
    })

    it('不正な消費時間形式は issue が出る', () => {
      const result = checkCSA('TABC\n')
      expect(result.issues.some(i => i.includes('消費時間'))).toBe(true)
    })

    it('小数点以下4桁以上の消費時間は issue が出る', () => {
      const result = checkCSA('T10.1234\n')
      expect(result.issues.some(i => i.includes('消費時間'))).toBe(true)
    })
  })

  describe('局面行（P行）', () => {
    it('正常なP1〜P9行（平手初期局面の1段目）はスコアを下げない', () => {
      const result = checkCSA('P1-KY-KE-GI-KI-OU-KI-GI-KE-KY\n')
      expect(result.score).toBe(100)
    })

    it('空マスを含むP行はスコアを下げない', () => {
      // 29文字: "P5" + 9セル×3文字（列9→1の順、空マスは " * "）
      const result = checkCSA('P5 *  *  *  *  *  *  *  *  * \n')
      expect(result.score).toBe(100)
    })

    it('不正なP行（長さ不足）は issue が出る', () => {
      const result = checkCSA('P1BADFORMAT\n')
      expect(result.issues.some(i => i.includes('局面行'))).toBe(true)
    })

    it('不正な駒名を含むP行は issue が出る', () => {
      const result = checkCSA('P1-KY-KE-GI-KI-OU-KI-GI-KE-XX\n')
      expect(result.issues.some(i => i.includes('局面行'))).toBe(true)
    })

    it('P+/P-（持ち駒）行は認識される', () => {
      const result = checkCSA('P+00FU00FU\nP-00KY\n')
      expect(result.issues.some(i => i.includes('認識できない'))).toBe(false)
    })
  })

  describe('PI行（平手・駒落ち）', () => {
    it('PI（平手）はスコアを下げない', () => {
      const result = checkCSA('PI\n')
      expect(result.score).toBe(100)
    })

    it('PI with removed pieces（駒落ち：22KA = 角落ち）はスコアを下げない', () => {
      const result = checkCSA('PI22KA\n')
      expect(result.score).toBe(100)
    })

    it('PI with multiple removed pieces はスコアを下げない', () => {
      const result = checkCSA('PI22KA82HI\n')  // 二枚落ち
      expect(result.score).toBe(100)
    })

    it('PI行の形式不正は issue が出る', () => {
      const result = checkCSA('PI1\n')  // 長さが4の倍数でない
      expect(result.issues.some(i => i.includes('PI行'))).toBe(true)
    })

    it('PI行の不正な駒名は issue が出る', () => {
      const result = checkCSA('PI22XX\n')
      expect(result.issues.some(i => i.includes('PI行'))).toBe(true)
    })
  })

  describe('棋譜情報行（$行）', () => {
    it('コロンのない$行は issue が出る', () => {
      const result = checkCSA('$EVENT\n')
      expect(result.issues.some(i => i.includes('「:」がありません'))).toBe(true)
    })

    it('コロンのある$行は issue が出ない', () => {
      const result = checkCSA('$EVENT:大会名\n')
      expect(result.issues.some(i => i.includes('「:」がありません'))).toBe(false)
    })

    it('$START_TIME に有効な日時形式は issue が出ない', () => {
      const result = checkCSA('$START_TIME:2024/01/15 10:30:00\n')
      expect(result.issues.some(i => i.includes('日時'))).toBe(false)
    })

    it('$START_TIME に日付のみ（時刻なし）は issue が出ない', () => {
      const result = checkCSA('$START_TIME:2024/01/15\n')
      expect(result.issues.some(i => i.includes('日時'))).toBe(false)
    })

    it('$START_TIME に不正な日時形式（ハイフン区切り）は issue が出る', () => {
      const result = checkCSA('$START_TIME:2024-01-15\n')
      expect(result.issues.some(i => i.includes('日時'))).toBe(true)
    })

    it('$END_TIME にも日時バリデーションが適用される', () => {
      const result = checkCSA('$END_TIME:invalid-date\n')
      expect(result.issues.some(i => i.includes('日時'))).toBe(true)
    })
  })

  describe('文字コード宣言', () => {
    it("'CSA encoding=UTF-8 は issue が出ない", () => {
      const result = checkCSA("'CSA encoding=UTF-8\n")
      expect(result.issues.some(i => i.includes('文字コード宣言'))).toBe(false)
    })

    it("'CSA encoding=SHIFT_JIS は issue が出ない", () => {
      const result = checkCSA("'CSA encoding=SHIFT_JIS\n")
      expect(result.issues.some(i => i.includes('文字コード宣言'))).toBe(false)
    })

    it('不正なエンコーディング宣言は issue が出る', () => {
      const result = checkCSA("'CSA encoding=EUC-JP\n")
      expect(result.issues.some(i => i.includes('文字コード宣言'))).toBe(true)
    })
  })

  describe('スコア計算', () => {
    it('すべて正常ならスコア100', () => {
      const csa = [
        'V3.0',
        'N+先手',
        'N-後手',
        "$START_TIME:2024/01/15 10:00:00",
        'PI',
        '+',
        '+7776FU',
        'T10',
        '-3334FU',
        'T10',
        '%TORYO',
        '',
      ].join('\n')
      const result = checkCSA(csa)
      expect(result.score).toBe(100)
      expect(result.issues).toHaveLength(0)
    })

    it('部分的にエラーがある場合はスコアが0より大きく100未満', () => {
      // 有効な指し手と無効な行が混在
      const result = checkCSA('+7776FU\n-3334FU\nBAD1\nBAD2\n')
      expect(result.score).toBeGreaterThan(0)
      expect(result.score).toBeLessThan(100)
    })

    it('スコアは100以外の場合 99 を超えない', () => {
      const result = checkCSA('BAD\n')
      expect(result.score).toBeLessThanOrEqual(99)
    })
  })
})
