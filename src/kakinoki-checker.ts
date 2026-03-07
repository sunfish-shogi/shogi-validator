export interface KakugyokuCheckResult {
  score: number   // 0-100
  issues: string[]
}

interface CheckItem {
  passed: number  // 0.0-1.0
  weight: number
  issue?: string
}

// East Asian wide character (display width 2)
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||
    (cp >= 0x2329 && cp <= 0x232A) ||
    (cp >= 0x25A0 && cp <= 0x25FF) ||  // Geometric shapes (▲△▽ etc.)
    (cp >= 0x2E80 && cp <= 0x303E) ||
    (cp >= 0x3040 && cp <= 0x33FF) ||
    (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x4E00 && cp <= 0x9FFF) ||
    (cp >= 0xA000 && cp <= 0xA4CF) ||
    (cp >= 0xAC00 && cp <= 0xD7AF) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0xFE10 && cp <= 0xFE6F) ||
    (cp >= 0xFF01 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||
    (cp >= 0x20000 && cp <= 0x3134F)
  )
}

function dispWidth(s: string): number {
  let w = 0
  for (const c of s) {
    w += isWide(c.codePointAt(0)!) ? 2 : 1
  }
  return w
}

function scoreItems(items: CheckItem[]): KakugyokuCheckResult {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0)
  const weightedPassed = items.reduce((s, i) => s + i.passed * i.weight, 0)
  const exact = totalWeight > 0 ? weightedPassed / totalWeight * 100 : 100
  // Use floor so that any imperfection results in < 100%; only a perfect score gives 100%
  const score = exact === 100 ? 100 : Math.min(99, Math.floor(exact))
  const issues = items.filter(i => i.issue !== undefined).map(i => i.issue!)
  return { score, issues }
}

// Check if metadata lines (before separator) use full-width colon as separator
function hasHalfWidthColonSeparator(line: string): boolean {
  const fullIdx = line.indexOf('：')
  const halfIdx = line.indexOf(':')
  if (halfIdx === -1) return false
  if (fullIdx === -1) return true
  return halfIdx < fullIdx
}

const KIF_SEPARATOR_WITH_TIME = '手数----指手---------消費時間--'
const KIF_SEPARATOR_NO_TIME   = '手数----指手--'
const MOVE_SYMBOL = /^[▲△▽]/

// Valid piece names per Kakinoki Shogi specification
const VALID_PIECES = new Set([
  '歩', '香', '桂', '銀', '金', '角', '飛', '玉',  // standard
  'と', '成香', '成桂', '成銀', '馬', '龍', '竜',   // promoted (龍/竜 both valid)
])

// Extract piece name from move text starting at given position.
// Returns the piece string if valid, undefined if unknown, null if not a piece position.
function extractPiece(text: string, pos: number): string | undefined {
  const two = text.slice(pos, pos + 2)
  if (VALID_PIECES.has(two)) return two
  const one = text.slice(pos, pos + 1)
  if (VALID_PIECES.has(one)) return one
  return undefined
}

function isKnownKIFLine(l: string): boolean {
  return (
    l.startsWith('#') ||          // header/comment
    l.startsWith('*') ||          // user comment
    l.startsWith('&') ||          // bookmark
    l.startsWith('変化：') ||     // branch
    l.startsWith('まで') ||       // result summary
    l === KIF_SEPARATOR_WITH_TIME || l === KIF_SEPARATOR_NO_TIME ||  // move separator
    /^ {0,3}\d/.test(l) ||        // move line
    l.includes('：') ||           // metadata or piece holdings (先手の持駒：etc.)
    l.startsWith('+') ||          // board border
    l.startsWith('|') ||          // board row
    /^ +[１-９]/.test(l) ||       // board column header
    /^[後先上下]手番$/.test(l)    // turn indicator for mid-game start
  )
}

function isKnownKI2Line(l: string): boolean {
  return (
    l.startsWith('#') ||
    l.startsWith('*') ||
    l.startsWith('&') ||
    l.startsWith('変化：') ||
    l.startsWith('まで') ||
    MOVE_SYMBOL.test(l) ||        // move line
    l.includes('：') ||
    l.startsWith('+') ||
    l.startsWith('|') ||
    /^ +[１-９]/.test(l) ||
    /^[後先上下]手番$/.test(l)
  )
}

export function checkKIF(text: string): KakugyokuCheckResult {
  const lines = text.split(/\r?\n/)
  const items: CheckItem[] = []

  function add(passed: number, weight: number, issue: string) {
    items.push({ passed, weight, issue: passed < 1 ? issue : undefined })
  }

  // 1. Separator line (two variants depending on whether time is recorded)
  let separatorIdx = lines.indexOf(KIF_SEPARATOR_WITH_TIME)
  const hasTimeColumn = separatorIdx >= 0
  if (!hasTimeColumn) separatorIdx = lines.indexOf(KIF_SEPARATOR_NO_TIME)
  add(
    separatorIdx >= 0 ? 1 : 0,
    2,
    `指し手セパレータ行（「${KIF_SEPARATOR_WITH_TIME}」または「${KIF_SEPARATOR_NO_TIME}」）がありません`,
  )

  // 3. Metadata section (before separator)
  const metaEnd = separatorIdx >= 0 ? separatorIdx : lines.length
  const metaLines = lines.slice(0, metaEnd).filter(
    l => l.length > 0 && !l.startsWith('#') && !l.startsWith('+') &&
         !l.startsWith('|') && !l.startsWith('*') && !l.startsWith('&'),
  )

  const badColonLines = metaLines.filter(hasHalfWidthColonSeparator)
  add(
    badColonLines.length === 0 ? 1 : 0,
    2,
    `メタデータの区切りに半角コロン「:」が使われています（${badColonLines.length}行）`,
  )

  // 4. 手合割 padding (4 full-width chars = display width 8)
  const teaiwariLine = metaLines.find(l => l.startsWith('手合割：'))
  if (teaiwariLine) {
    const value = teaiwariLine.slice('手合割：'.length)
    const w = dispWidth(value)
    add(w === 8 ? 1 : 0, 2, `手合割の値が全角4文字（表示幅8）にパディングされていません（現在: ${w}）`)
  }

  // 5. Move lines
  if (separatorIdx >= 0) {
    const moveLines: string[] = []
    for (let i = separatorIdx + 1; i < lines.length; i++) {
      const l = lines[i]
      if (!l || l.startsWith('*') || l.startsWith('&') || l.startsWith('変化') || l.startsWith('+')) continue
      if (/^ {0,3}\d/.test(l)) moveLines.push(l)
    }

    if (moveLines.length > 0) {
      // Move number: right-aligned in 4 chars
      const badNum = moveLines.filter(l => !/^ {0,3}\d{1,4} /.test(l))
      add(
        1 - badNum.length / moveLines.length,
        3,
        `手数フィールドが4文字右詰めになっていない行があります（${badNum.length}/${moveLines.length}行）`,
      )

      // Piece name validation
      // KIF move text (after 5-char prefix) starts with 2-char destination (full-width digit pair or 同　),
      // then the piece name at position 2. Terminal moves (投了 etc.) start with non-digit/non-同.
      let totalPieceMoves = 0
      let badPieceCount = 0
      const badPieceNames = new Set<string>()
      for (const l of moveLines) {
        const text = l.slice(5)
        const ch = text[0] ?? ''
        if (ch !== '同' && (ch < '１' || ch > '９')) continue
        totalPieceMoves++
        if (extractPiece(text, 2) === undefined) {
          badPieceCount++
          // Extract only full-width chars (stop before half-width chars like '(' or space)
          let name = ''
          for (let i = 2; i < text.length && name.length < 2; i++) {
            if (!isWide(text.codePointAt(i)!)) break
            name += text[i]
          }
          badPieceNames.add(`「${name || '?'}」`)
        }
      }
      if (totalPieceMoves > 0) {
        add(
          1 - badPieceCount / totalPieceMoves,
          3,
          `不正な駒名が含まれる指し手があります: ${[...badPieceNames].join('、')}`,
        )
      }

      // 同 must be followed by full-width space
      const douLines = moveLines.filter(l => /同/.test(l))
      if (douLines.length > 0) {
        const badDou = douLines.filter(l => /同[^　]/.test(l))
        add(
          1 - badDou.length / douLines.length,
          2,
          `「同」の後に全角スペースがない行があります（${badDou.length}/${douLines.length}行）`,
        )
      }

      // Time field and move text width (only for lines that have a time field)
      // Loose pattern to detect any time-like field at end of line.
      // Uses \s*\d+ to match regardless of padding so malformed formats are also captured.
      const TIME_LOOSE = /\(\s*\d+:\s*\d+\/\s*\d+:\s*\d+:\s*\d+\)\+?$/
      // Strict pattern: elapsed minutes are space-padded (not zero-padded) for single digits,
      // elapsed seconds and cumulative time fields are all zero-padded 2 digits.
      // [ 1-9] = space (single digit) or 1-9 (first digit of double-digit minutes); rejects "01", "00" etc.
      const TIME_STRICT = /\([ 1-9]\d:\d{2}\/\d{2}:\d{2}:\d{2}\)$/

      const timedLines = moveLines.filter(l => TIME_LOOSE.test(l))
      const untimedLines = moveLines.filter(l => !TIME_LOOSE.test(l))

      // Move text width for lines WITHOUT time field: 12 display width
      // (only meaningful when separator indicates no-time format)
      if (!hasTimeColumn && untimedLines.length > 0) {
        const badWidth = untimedLines.filter(l => {
          const ch = l[5] ?? ''
          if (ch !== '同' && (ch < '１' || ch > '９')) return false  // terminal, skip
          return dispWidth(l.slice(5)) !== 12
        })
        add(
          1 - badWidth.length / untimedLines.length,
          3,
          `指し手テキストが12表示幅になっていない行があります（${badWidth.length}/${untimedLines.length}行）`,
        )
      }

      if (timedLines.length > 0) {
        // Check time format
        const badTimeFmt = timedLines.filter(l => !TIME_STRICT.test(l.replace(/\+$/, '')))
        add(
          1 - badTimeFmt.length / timedLines.length,
          2,
          `消費時間の形式が正しくない行があります（${badTimeFmt.length}/${timedLines.length}行）`,
        )

        // Check move text: 13 display width between number+space (5 chars) and time field
        const badWidth = timedLines.filter(l => {
          const m = l.match(TIME_LOOSE)
          if (!m || m.index === undefined) return false
          return dispWidth(l.slice(5, m.index)) !== 13
        })
        add(
          1 - badWidth.length / timedLines.length,
          3,
          `指し手テキストが13表示幅になっていない行があります（${badWidth.length}/${timedLines.length}行）`,
        )
      }
    }

    // Branch marker (+) cross-check with 変化：N手
    const branchNumbers = new Set<number>()
    for (const l of lines.slice(separatorIdx + 1)) {
      const m = l.match(/^変化：(\d+)手$/)
      if (m?.[1]) branchNumbers.add(parseInt(m[1], 10))
    }

    const plusNumbers = new Set<number>()
    for (const l of lines.slice(separatorIdx + 1)) {
      if (/^ {0,3}\d/.test(l) && l.trimEnd().endsWith('+')) {
        const m = l.match(/^ *(\d+) /)
        if (m?.[1]) plusNumbers.add(parseInt(m[1], 10))
      }
    }

    if (branchNumbers.size > 0 || plusNumbers.size > 0) {
      const spurious = [...plusNumbers].filter(n => !branchNumbers.has(n))
      add(
        spurious.length === 0 ? 1 : 0,
        2,
        `「変化：N手」のない手に「+」が付いています（手数: ${spurious.join('、')}）`,
      )
      const missing = [...branchNumbers].filter(n => !plusNumbers.has(n))
      add(
        missing.length === 0 ? 1 : 0,
        2,
        `分岐があるのに「+」のない手があります（手数: ${missing.join('、')}）`,
      )
    }
  }

  // Unrecognized lines
  const nonEmptyLines = lines.filter(l => l !== '')
  const unknownKIF = nonEmptyLines.filter(l => !isKnownKIFLine(l))
  if (nonEmptyLines.length > 0) {
    add(
      1 - unknownKIF.length / nonEmptyLines.length,
      2,
      `認識できない行があります（${unknownKIF.length}/${nonEmptyLines.length}行）`,
    )
  }

  // 6. Trailing blank line
  add(lines[lines.length - 1] === '' ? 1 : 0, 1, 'ファイルの末尾が空行ではありません')

  return scoreItems(items)
}

export function checkKI2(text: string): KakugyokuCheckResult {
  const lines = text.split(/\r?\n/)
  const items: CheckItem[] = []

  function add(passed: number, weight: number, issue: string) {
    items.push({ passed, weight, issue: passed < 1 ? issue : undefined })
  }

  // Find where metadata ends (first move line or 変化：)
  const moveStartIdx = lines.findIndex(l => MOVE_SYMBOL.test(l) || l.startsWith('変化：'))
  const metaEnd = moveStartIdx >= 0 ? moveStartIdx : lines.length
  const metaLines = lines.slice(0, metaEnd).filter(l => l.length > 0 && !l.startsWith('#'))

  // 2. Full-width colon in metadata
  const badColonLines = metaLines.filter(hasHalfWidthColonSeparator)
  add(
    badColonLines.length === 0 ? 1 : 0,
    2,
    `メタデータの区切りに半角コロン「:」が使われています（${badColonLines.length}行）`,
  )

  // 3. 手合割：平手 should be omitted in KI2
  const teaiwariLine = metaLines.find(l => l.startsWith('手合割：'))
  if (teaiwariLine) {
    const value = teaiwariLine.slice('手合割：'.length).trimEnd()
    if (/^平手/.test(value)) {
      add(0, 2, '平手局面では「手合割：」行は省略されます（柿木将棋KI2の仕様）')
    }
  }

  // 4. Move lines
  const moveLines: string[] = []
  for (let i = moveStartIdx >= 0 ? moveStartIdx : 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l || l.startsWith('変化：') || l.startsWith('*') || l.startsWith('&') || l.startsWith('まで')) continue
    if (MOVE_SYMBOL.test(l)) moveLines.push(l)
  }

  if (moveLines.length > 0) {
    let totalTokens = 0
    let badTokens = 0
    const douMoveTexts: string[] = []

    for (const line of moveLines) {
      // Split by ASCII spaces only (preserve full-width space 　 inside tokens like 同　歩)
      const tokens = line.split(/ +/).filter(t => t.length > 0)
      for (const token of tokens) {
        totalTokens++
        if (!MOVE_SYMBOL.test(token)) {
          badTokens++
          continue
        }
        const moveText = token.slice(1)  // remove ▲/△/▽
        if (moveText.startsWith('同')) douMoveTexts.push(moveText)
      }
    }

    add(
      totalTokens > 0 ? 1 - badTokens / totalTokens : 1,
      3,
      `▲/△/▽で始まらない指し手があります（${badTokens}/${totalTokens}個）`,
    )

    // 5. 同 spacing: 同　{1char} or 同{char}{char}
    if (douMoveTexts.length > 0) {
      const badDou = douMoveTexts.filter(t => {
        const after = t.slice(1)  // remove 同
        if (!after) return true
        if (after[0] === '　') return false  // full-width space → 1-char piece, OK
        // No space: must be followed by 2 full-width chars (e.g., 飛成, 成銀)
        const cp1 = after[1]?.codePointAt(0)
        return !(after.length >= 2 && isWide(after.codePointAt(0)!) && cp1 !== undefined && isWide(cp1))
      })
      add(
        1 - badDou.length / douMoveTexts.length,
        2,
        `「同」の後のスペースが正しくない指し手があります（${badDou.length}/${douMoveTexts.length}個）`,
      )
    }
  }

  // Piece name validation for KI2 tokens
  // For 同 without space: piece is at pos 1 (同{piece}); with space: pos 2 (同　{piece}).
  // For normal destination (2 full-width chars): piece is at pos 2.
  if (moveLines.length > 0) {
    let totalKI2Pieces = 0
    let badKI2PieceCount = 0
    const badKI2PieceNames = new Set<string>()
    for (const line of moveLines) {
      const tokens = line.split(/ +/).filter(t => t.length > 0)
      for (const token of tokens) {
        if (!MOVE_SYMBOL.test(token)) continue
        const mt = token.slice(1)  // remove ▲/△/▽
        const ch = mt[0] ?? ''
        let pos: number
        if (ch === '同') {
          pos = mt[1] === '　' ? 2 : 1
        } else if (ch >= '１' && ch <= '９') {
          pos = 2
        } else {
          continue  // terminal or unknown, skip
        }
        totalKI2Pieces++
        if (extractPiece(mt, pos) === undefined) {
          badKI2PieceCount++
          let name = ''
          for (let i = pos; i < mt.length && name.length < 2; i++) {
            if (!isWide(mt.codePointAt(i)!)) break
            name += mt[i]
          }
          badKI2PieceNames.add(`「${name || '?'}」`)
        }
      }
    }
    if (totalKI2Pieces > 0) {
      add(
        1 - badKI2PieceCount / totalKI2Pieces,
        3,
        `不正な駒名が含まれる指し手があります: ${[...badKI2PieceNames].join('、')}`,
      )
    }
  }

  // Unrecognized lines
  const nonEmptyLinesKI2 = lines.filter(l => l !== '')
  const unknownKI2 = nonEmptyLinesKI2.filter(l => !isKnownKI2Line(l))
  if (nonEmptyLinesKI2.length > 0) {
    add(
      1 - unknownKI2.length / nonEmptyLinesKI2.length,
      2,
      `認識できない行があります（${unknownKI2.length}/${nonEmptyLinesKI2.length}行）`,
    )
  }

  // 6. Trailing blank line
  add(lines[lines.length - 1] === '' ? 1 : 0, 1, 'ファイルの末尾が空行ではありません')

  return scoreItems(items)
}
