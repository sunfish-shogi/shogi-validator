<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  detectRecordFormat, RecordFormatType,
  importKIF, importKI2, importCSA, importJKFString,
  exportKIF, exportKI2, exportCSA, exportJKFString,
  Record as ShogiRecord, Position as ShogiPosition,
  type ImmutableRecord,
} from 'tsshogi'
import ConversionResult from './components/ConversionResult.vue'
import { checkKIF, checkKI2 } from './kakinoki-checker'
import { checkCSA } from './csa-checker'

type Format = 'KIF' | 'KI2' | 'CSA' | 'JKF' | 'USI' | 'SFEN' | 'USEN'

interface ValidationResult {
  format: Format
  valid: boolean
  error: string | null
}

const ALL_FORMATS: Format[] = ['KIF', 'KI2', 'CSA', 'JKF', 'USI', 'SFEN', 'USEN']

const inputText = ref('')
const detectedEncoding = ref<string | null>(null)
const detectedFileName = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const validationResult = ref<ValidationResult | null>(null)
const parsedRecord = ref<ImmutableRecord | null>(null)

function parseRecord(text: string, type: RecordFormatType): ImmutableRecord | Error {
  switch (type) {
    case RecordFormatType.KIF:  return importKIF(text)
    case RecordFormatType.KI2:  return importKI2(text)
    case RecordFormatType.CSA:  return importCSA(text)
    case RecordFormatType.JKF:  return importJKFString(text)
    case RecordFormatType.USI:  return ShogiRecord.newByUSI(text)
    case RecordFormatType.USEN: return ShogiRecord.newByUSEN(text)
    case RecordFormatType.SFEN: {
      const pos = ShogiPosition.newBySFEN(text)
      return pos ? new ShogiRecord(pos) : new Error('Invalid SFEN')
    }
  }
}

function convertRecord(record: ImmutableRecord, format: Format): string {
  switch (format) {
    case 'KIF':  return exportKIF(record)
    case 'KI2':  return exportKI2(record)
    case 'CSA':  return exportCSA(record)
    case 'JKF':  return exportJKFString(record)
    case 'USI':  return record.getUSI({ allMoves: true })
    case 'SFEN': return record.sfen
    case 'USEN': return record.usen[0]
  }
}

async function readFileWithEncoding(file: File): Promise<{ text: string; encoding: string }> {
  const buffer = await file.arrayBuffer()
  const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    const text = utf8Decoder.decode(buffer)
    return { text, encoding: 'UTF-8' }
  } catch {
    // not valid UTF-8, fall through
  }
  const sjisDecoder = new TextDecoder('shift-jis')
  return { text: sjisDecoder.decode(buffer), encoding: 'Shift-JIS' }
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const { text, encoding } = await readFileWithEncoding(file)
  inputText.value = text
  detectedEncoding.value = encoding
  detectedFileName.value = file.name
  validationResult.value = null
  parsedRecord.value = null
}

function runValidation() {
  const text = inputText.value
  if (!text.trim()) {
    validationResult.value = null
    parsedRecord.value = null
    return
  }
  const type = detectRecordFormat(text)
  const format = RecordFormatType[type] as Format
  const result = parseRecord(text, type)
  if (result instanceof Error) {
    parsedRecord.value = null
    validationResult.value = { format, valid: false, error: result.message }
  } else {
    parsedRecord.value = result
    validationResult.value = { format, valid: true, error: null }
  }
}

function onTextInput() {
  validationResult.value = null
  parsedRecord.value = null
  detectedEncoding.value = null
  detectedFileName.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function clearAll() {
  inputText.value = ''
  detectedEncoding.value = null
  detectedFileName.value = null
  validationResult.value = null
  parsedRecord.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

const encodingWarning = computed(() => {
  const name = detectedFileName.value
  const enc = detectedEncoding.value
  if (!name || !enc) return null
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if ((ext === '.kif' || ext === '.ki2') && enc === 'UTF-8')
    return `「${ext}」ファイルの文字コードは Shift_JIS が想定されますが、UTF-8 として読み込まれました。`
  if ((ext === '.kifu' || ext === '.ki2u') && enc === 'Shift-JIS')
    return `「${ext}」ファイルの文字コードは UTF-8 が想定されますが、Shift-JIS として読み込まれました。`
  return null
})

const kakugyokuResult = computed(() => {
  const vr = validationResult.value
  if (!vr?.valid) return null
  if (vr.format === 'KIF') return checkKIF(inputText.value)
  if (vr.format === 'KI2') return checkKI2(inputText.value)
  return null
})

const kakugyokuScoreClass = computed(() => {
  const score = kakugyokuResult.value?.score ?? 0
  if (score === 100) return 'kk-score--perfect'
  if (score >= 80) return 'kk-score--good'
  return 'kk-score--warn'
})

const csaResult = computed(() => {
  const vr = validationResult.value
  if (!vr?.valid) return null
  if (vr.format === 'CSA') return checkCSA(inputText.value)
  return null
})

const csaScoreClass = computed(() => {
  const score = csaResult.value?.score ?? 0
  if (score === 100) return 'kk-score--perfect'
  if (score >= 80) return 'kk-score--good'
  return 'kk-score--warn'
})

const conversionResults = computed(() => {
  const record = parsedRecord.value
  if (!record) return []
  return ALL_FORMATS.map((fmt) => {
    try {
      return { format: fmt, content: convertRecord(record, fmt) }
    } catch (e) {
      return { format: fmt, content: `（変換エラー: ${e instanceof Error ? e.message : String(e)}）` }
    }
  })
})
</script>

<template>
  <h1>将棋棋譜・局面データ検査ツール</h1>

  <!-- 入力セクション -->
  <div class="section">
    <h2>データ入力</h2>
    <textarea
      v-model="inputText"
      rows="12"
      placeholder="KIF, KI2, CSA, JKF, USI, SFEN 形式の棋譜・局面データを貼り付けてください。"
      @input="onTextInput"
    />
    <div class="controls">
      <div class="file-area">
        <label class="file-label">
          <input
            ref="fileInputRef"
            type="file"
            accept=".kif,.kifu,.ki2,.ki2u,.csa,.jkf,.txt"
            @change="onFileSelected"
          />
          ファイルを選択
        </label>
        <span v-if="detectedEncoding" class="encoding-badge">
          文字コード: {{ detectedEncoding }}
        </span>
        <span v-if="encodingWarning" class="encoding-warning">{{ encodingWarning }}</span>
      </div>
      <div class="action-buttons">
        <button @click="clearAll">クリア</button>
        <button class="primary" @click="runValidation">検査実行</button>
      </div>
    </div>
  </div>

  <!-- 検査結果セクション -->
  <div v-if="validationResult" class="section">
    <h2>検査結果</h2>
    <div v-if="validationResult.valid" class="result result--ok">
      <span class="result-icon">✓</span>
      <div>
        <div class="result-title">正常</div>
        <div class="result-detail">
          フォーマット: <strong>{{ validationResult.format }}</strong>
        </div>
      </div>
    </div>
    <div v-else class="result result--error">
      <span class="result-icon">✗</span>
      <div>
        <div class="result-title">エラー</div>
        <div class="result-detail">{{ validationResult.error }}</div>
      </div>
    </div>
    <p class="validation-note">※ 全ての問題を検出できることを保証するものではありません。</p>
  </div>

  <!-- 柿木将棋スタイル評価セクション -->
  <div v-if="kakugyokuResult" class="section">
    <h2>柿木将棋スタイル評価</h2>
    <div class="kk-score-row">
      <span class="kk-score" :class="kakugyokuScoreClass">{{ kakugyokuResult.score }}%</span>
      <span class="kk-score-label">柿木将棋との一致度（参考）</span>
    </div>
    <ul v-if="kakugyokuResult.issues.length > 0" class="kk-issues">
      <li v-for="(issue, i) in kakugyokuResult.issues" :key="i">{{ issue }}</li>
    </ul>
    <p v-else class="kk-ok">検査項目の範囲では差異は見つかりませんでした。</p>
    <p class="kk-note">※ 限られた検査項目に基づく参考値です。見落としや誤検出が生じる場合があります。</p>
  </div>

  <!-- CSA 仕様検査セクション -->
  <div v-if="csaResult" class="section">
    <h2>CSA 標準形式検査</h2>
    <div class="kk-score-row">
      <span class="kk-score" :class="csaScoreClass">{{ csaResult.score }}%</span>
      <span class="kk-score-label">CSA 仕様への準拠度（参考）</span>
    </div>
    <ul v-if="csaResult.issues.length > 0" class="kk-issues">
      <li v-for="(issue, i) in csaResult.issues" :key="i">{{ issue }}</li>
    </ul>
    <p v-else class="kk-ok">検査項目の範囲では問題は見つかりませんでした。</p>
    <p class="kk-note">※ 限られた検査項目に基づく参考値です。見落としや誤検出が生じる場合があります。</p>
  </div>

  <!-- 変換結果セクション -->
  <div v-if="conversionResults.length > 0" class="section">
    <h2>変換結果</h2>
    <div class="conversion-grid">
      <ConversionResult
        v-for="r in conversionResults"
        :key="r.format"
        :format="r.format"
        :content="r.content"
      />
    </div>
  </div>

  <footer>
    <a href="https://github.com/sunfish-shogi/shogi-validator" target="_blank" rel="noopener">GitHub</a>
    <span class="footer-sep">|</span>
    <a href="third-party-licenses.html">サードパーティライセンス</a>
  </footer>
</template>

<style scoped>
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.file-area {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.file-label {
  display: inline-block;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  padding: 0.5rem 1.1rem;
  background-color: var(--color-surface);
  color: var(--color-text);
  transition: background-color 0.15s;
}

.file-label:hover {
  background-color: var(--color-border);
}

.file-label input[type="file"] {
  display: none;
}

.encoding-warning {
  font-size: 0.8rem;
  color: #b45309;
  background-color: var(--color-warning-bg);
  border: 1px solid #f59e0b;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
}

@media (prefers-color-scheme: dark) {
  .encoding-warning {
    color: #f59e0b;
    border-color: #78450a;
  }
}

.encoding-badge {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.result {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
}

.result--ok {
  background-color: var(--color-success-bg);
  color: var(--color-success);
}

.result--error {
  background-color: var(--color-error-bg);
  color: var(--color-error);
}

.result-icon {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.4;
}

.result-title {
  font-weight: 700;
}

.result-detail {
  margin-top: 0.15rem;
  opacity: 0.85;
}

.conversion-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 0.75rem;
}

.kk-score-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.kk-score {
  font-size: 1.5rem;
  font-weight: 700;
  min-width: 4rem;
  text-align: center;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
}

.kk-score--perfect {
  background-color: var(--color-success-bg);
  color: var(--color-success);
}

.kk-score--good {
  background-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-primary);
}

.kk-score--warn {
  background-color: var(--color-warning-bg);
  color: #b45309;
}

@media (prefers-color-scheme: dark) {
  .kk-score--warn {
    color: #f59e0b;
  }
}

.kk-score-label {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.kk-issues {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  color: var(--color-text);
  line-height: 1.8;
}

.kk-ok {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-success);
}

.validation-note {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.kk-note {
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

footer {
  margin-top: 2rem;
  padding: 1rem 0;
  text-align: center;
  font-size: 0.8rem;
  border-top: 1px solid var(--color-border);
}

.footer-sep {
  margin: 0 0.5rem;
  color: var(--color-border);
}
</style>
