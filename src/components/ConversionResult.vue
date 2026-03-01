<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  format: string
  content: string
}>()

const copied = ref(false)

async function copyToClipboard() {
  await navigator.clipboard.writeText(props.content)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}
</script>

<template>
  <div class="conversion-result">
    <div class="header">
      <span class="format-label">{{ format }}</span>
      <button @click="copyToClipboard" class="copy-btn">
        {{ copied ? 'コピーしました' : 'コピー' }}
      </button>
    </div>
    <pre class="content">{{ content }}</pre>
  </div>
</template>

<style scoped>
.conversion-result {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  background-color: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.format-label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.copy-btn {
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
}

.content {
  margin: 0;
  padding: 0.75rem;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.8rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--color-text-muted);
  background-color: var(--color-surface);
  max-height: 200px;
  overflow-y: auto;
}
</style>
