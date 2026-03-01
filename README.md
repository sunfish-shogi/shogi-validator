# 将棋棋譜バリデーター

Webブラウザで動作する将棋の棋譜データ・局面データの検査・変換ツールです。

## 機能

- **フォーマット自動判定** — 入力データのフォーマットを自動検出して表示
- **バリデーション** — [tsshogi](https://github.com/sunfish-shogi/tsshogi) でパースし、エラー内容を表示
- **フォーマット変換** — KIF、KI2、CSA、JKF、USI、SFEN、USEN への変換結果を出力（コピーボタン付き）
- **ファイル読み込み** — ファイル選択から読み込み（文字コード自動判別）
- **KIF/KI2 差分チェック** — 柿木将棋の出力スタイルとの違いをコメント表示（KIF・KI2のみ）

### 対応フォーマット

| フォーマット | 説明 |
|---|---|
| KIF | 柿木将棋形式 |
| KI2 | 柿木将棋形式（棋譜2） |
| CSA | CSA形式 |
| JKF | JSON棋譜フォーマット |
| USI | USIプロトコル形式 |
| SFEN | SFEN形式 |
| USEN | USEN形式 |

## 開発

```bash
npm install       # 依存パッケージのインストール
npm run dev       # 開発サーバー起動（HMR対応）
npm run build     # 型チェック後にプロダクションビルド
npm run preview   # プロダクションビルドのプレビュー
```

## 技術スタック

- [Vue 3](https://vuejs.org/) (`<script setup>` + TypeScript)
- [Vite](https://vitejs.dev/)
- [tsshogi](https://github.com/sunfish-shogi/tsshogi) — 将棋ライブラリ（パース・変換）
