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

const KIF_SEPARATOR = '手数----指手---------消費時間--'
const MOVE_SYMBOL = /^[▲△▽]/

export function checkKIF(text: string): KakugyokuCheckResult {
  const lines = text.split(/\r?\n/)
  const items: CheckItem[] = []

  function add(passed: number, weight: number, issue: string) {
    items.push({ passed, weight, issue: passed < 1 ? issue : undefined })
  }

  // 1. Separator line
  const separatorIdx = lines.indexOf(KIF_SEPARATOR)
  add(separatorIdx >= 0 ? 1 : 0, 2, `指し手セパレータ行「${KIF_SEPARATOR}」がありません`)

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

  // 6. Trailing blank line
  add(lines[lines.length - 1] === '' ? 1 : 0, 1, 'ファイルの末尾が空行ではありません')

  return scoreItems(items)
}
