export interface CsaCheckResult {
  score: number   // 0-100
  issues: string[]
}

interface CheckItem {
  passed: number  // 0.0-1.0
  weight: number
  issue?: string
}

function scoreItems(items: CheckItem[]): CsaCheckResult {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0)
  const weightedPassed = items.reduce((s, i) => s + i.passed * i.weight, 0)
  const exact = totalWeight > 0 ? weightedPassed / totalWeight * 100 : 100
  const score = exact === 100 ? 100 : Math.min(99, Math.floor(exact))
  const issues = items.filter(i => i.issue !== undefined).map(i => i.issue!)
  return { score, issues }
}

// Valid CSA piece codes (unpromoted + promoted)
const VALID_PIECES = new Set([
  'FU', 'KY', 'KE', 'GI', 'KI', 'KA', 'HI', 'OU',  // unpromoted
  'TO', 'NY', 'NK', 'NG', 'UM', 'RY',                // promoted
])

// Pieces that can be held in hand (dropped from 00)
const DROPPABLE_PIECES = new Set(['FU', 'KY', 'KE', 'GI', 'KI', 'KA', 'HI'])

// Valid % special-move keywords (V3.0)
const VALID_SPECIALS = new Set([
  'TORYO', 'CHUDAN', 'SENNICHITE', 'TIME_UP', 'ILLEGAL_MOVE',
  '+ILLEGAL_ACTION', '-ILLEGAL_ACTION', 'JISHOGI', 'KACHI', 'HIKIWAKE',
  'MAX_MOVES', 'TSUMI', 'FUZUMI', 'ERROR',
])

function isValidBoardPos(s: string): boolean {
  const col = s.charCodeAt(0) - 48
  const row = s.charCodeAt(1) - 48
  return col >= 1 && col <= 9 && row >= 1 && row <= 9
}

// Expand multi-statement lines (comma-separated) into individual statements.
// Comment lines starting with "'" are never split.
function expandStatements(text: string): string[] {
  const result: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line === '' || line.startsWith("'")) {
      result.push(line)
    } else {
      for (const part of line.split(',')) {
        if (part !== '') result.push(part)
      }
    }
  }
  return result
}

type Category =
  | 'encoding' | 'comment' | 'version' | 'player' | 'dollar'
  | 'pos_hirate' | 'pos_row' | 'pos_piece' | 'turn' | 'move'
  | 'special' | 'time' | 'separator' | 'unknown'

function categorize(s: string): Category {
  if (s === '/') return 'separator'
  if (s === '+' || s === '-') return 'turn'
  if (s.startsWith("'CSA encoding=")) return 'encoding'
  if (s.startsWith("'")) return 'comment'
  if (s.startsWith('V')) return 'version'
  if (s.startsWith('N+') || s.startsWith('N-')) return 'player'
  if (s.startsWith('$')) return 'dollar'
  if (s.startsWith('PI')) return 'pos_hirate'
  if (/^P[1-9]/.test(s)) return 'pos_row'
  if (s.startsWith('P+') || s.startsWith('P-')) return 'pos_piece'
  if (s.startsWith('%')) return 'special'
  if (s.startsWith('T')) return 'time'
  if (/^[+-]/.test(s)) return 'move'  // includes malformed moves
  return 'unknown'
}

export function checkCSA(text: string): CsaCheckResult {
  const items: CheckItem[] = []

  function add(passed: number, weight: number, issue: string) {
    items.push({ passed, weight, issue: passed < 1 ? issue : undefined })
  }

  const statements = expandStatements(text)
  const nonEmpty = statements.filter(s => s !== '')
  const cats = nonEmpty.map(s => ({ s, cat: categorize(s) }))

  // 1. Unrecognized lines (weight 3)
  const unknownCount = cats.filter(({ cat }) => cat === 'unknown').length
  if (nonEmpty.length > 0) {
    add(
      1 - unknownCount / nonEmpty.length,
      3,
      `認識できない行があります（${unknownCount}/${nonEmpty.length}行）`,
    )
  }

  // 2. Move format: [+-]XXYYZZ exactly 7 chars where XX=from, YY=to, ZZ=piece (weight 3)
  const moveCandidates = cats.filter(({ cat }) => cat === 'move').map(({ s }) => s)
  if (moveCandidates.length > 0) {
    const MOVE_RE = /^[+-]\d{4}[A-Z]{2}$/
    const badFmt = moveCandidates.filter(s => !MOVE_RE.test(s))
    add(
      1 - badFmt.length / moveCandidates.length,
      3,
      `指し手の形式が正しくない行があります（${badFmt.length}/${moveCandidates.length}行）`,
    )

    const validMoves = moveCandidates.filter(s => MOVE_RE.test(s))

    // 3. Piece name validity (weight 3)
    if (validMoves.length > 0) {
      const badPiece = validMoves.filter(s => !VALID_PIECES.has(s.slice(5, 7)))
      add(
        1 - badPiece.length / validMoves.length,
        3,
        `指し手の駒名が不正です（${[...new Set(badPiece.map(s => s.slice(5, 7)))].join(', ')}）`,
      )

      // Drop moves: from==00, piece must be droppable (not OU or promoted)
      const drops = validMoves.filter(s => s.slice(1, 3) === '00')
      if (drops.length > 0) {
        const badDrop = drops.filter(s => !DROPPABLE_PIECES.has(s.slice(5, 7)))
        add(
          1 - badDrop.length / drops.length,
          2,
          `打ち駒に使えない駒があります（${[...new Set(badDrop.map(s => s.slice(5, 7)))].join(', ')}）`,
        )
      }

      // Move destination must not be 00
      const badTo = validMoves.filter(s => s.slice(3, 5) === '00')
      if (badTo.length > 0) {
        add(0, 2, `移動先が「00」（駒台）の指し手があります（${badTo.length}行）`)
      }
    }
  }

  // 4. Special-move keywords (weight 2)
  const specials = cats.filter(({ cat }) => cat === 'special').map(({ s }) => s)
  if (specials.length > 0) {
    // %MATTA was removed in V3.0
    const mattaCount = specials.filter(s => s === '%MATTA').length
    if (mattaCount > 0) {
      add(0, 2, `%MATTA は V3.0 で廃止されました（${mattaCount}行）`)
    }

    const realBad = specials.filter(s => s !== '%MATTA' && !VALID_SPECIALS.has(s.slice(1)))
    if (realBad.length > 0) {
      add(
        1 - realBad.length / specials.length,
        2,
        `不正な終局・特殊指し手があります（${[...new Set(realBad)].join('、')}）`,
      )
    }
  }

  // 5. Time format: T followed by non-negative number, optional decimal up to 3 digits (weight 2)
  const times = cats.filter(({ cat }) => cat === 'time').map(({ s }) => s)
  if (times.length > 0) {
    const badTime = times.filter(s => !/^T\d+(\.\d{1,3})?$/.test(s))
    add(
      1 - badTime.length / times.length,
      2,
      `消費時間の形式が正しくない行があります（${badTime.length}/${times.length}行）`,
    )
  }

  // 6. Position row format P1-P9: exactly 29 chars, 9 cells of 3 chars each (weight 2)
  const posRows = cats.filter(({ cat }) => cat === 'pos_row').map(({ s }) => s)
  if (posRows.length > 0) {
    const badPosRow = posRows.filter(s => {
      if (s.length !== 29) return true
      for (let i = 2; i < 29; i += 3) {
        const cell = s.slice(i, i + 3)
        if (cell === ' * ') continue
        if ((cell[0] === '+' || cell[0] === '-') && VALID_PIECES.has(cell.slice(1))) continue
        return true
      }
      return false
    })
    add(
      1 - badPosRow.length / posRows.length,
      2,
      `局面行（P1〜P9）の形式が正しくない行があります（${badPosRow.length}/${posRows.length}行）`,
    )
  }

  // 7. Dollar info: must contain ':' (weight 1)
  const dollars = cats.filter(({ cat }) => cat === 'dollar').map(({ s }) => s)
  if (dollars.length > 0) {
    const noColon = dollars.filter(s => !s.includes(':'))
    add(
      1 - noColon.length / dollars.length,
      1,
      `棋譜情報行に「:」がありません（${noColon.length}行）`,
    )

    // Date format for $START_TIME / $END_TIME
    const dateLines = dollars.filter(s => s.startsWith('$START_TIME:') || s.startsWith('$END_TIME:'))
    if (dateLines.length > 0) {
      const badDate = dateLines.filter(s => {
        const val = s.slice(s.indexOf(':') + 1)
        return !/^\d{4}\/\d{2}\/\d{2}( \d{2}:\d{2}:\d{2})?$/.test(val)
      })
      if (badDate.length > 0) {
        add(
          1 - badDate.length / dateLines.length,
          1,
          `日時の形式が正しくない行があります（${badDate.length}行）`,
        )
      }
    }
  }

  // 8. Encoding declaration value (weight 1)
  const encodingLines = cats.filter(({ cat }) => cat === 'encoding').map(({ s }) => s)
  if (encodingLines.length > 0) {
    const badEnc = encodingLines.filter(
      s => s !== "'CSA encoding=UTF-8" && s !== "'CSA encoding=SHIFT_JIS",
    )
    if (badEnc.length > 0) {
      add(0, 1, `文字コード宣言の値が不正です（UTF-8 または SHIFT_JIS が有効）`)
    }
  }

  // 9. PI line format (weight 1)
  const piLines = cats.filter(({ cat }) => cat === 'pos_hirate').map(({ s }) => s)
  if (piLines.length > 0) {
    const badPI = piLines.filter(s => {
      const rest = s.slice(2)
      if (rest === '') return false   // plain hirate, OK
      if (rest.length % 4 !== 0) return true
      for (let i = 0; i < rest.length; i += 4) {
        const pos = rest.slice(i, i + 2)
        const piece = rest.slice(i + 2, i + 4)
        if (!isValidBoardPos(pos)) return true
        if (!VALID_PIECES.has(piece)) return true
      }
      return false
    })
    if (badPI.length > 0) {
      add(1 - badPI.length / piLines.length, 1, `PI行の形式が正しくない行があります（${badPI.length}行）`)
    }
  }

  return scoreItems(items)
}
