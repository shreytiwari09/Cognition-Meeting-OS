import { useState } from 'react'

// Browsers don't let web pages open chrome:// addresses, so a normal link would do nothing.
// This looks like a link and copies the address instead, for pasting into the address bar.
export default function ChromeExtensionsLink() {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText('chrome://extensions')
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copy this address and paste it into Chrome’s address bar:', 'chrome://extensions')
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        title="Click to copy, then paste it into the address bar"
        className="font-mono text-[13px] text-coral-deep underline decoration-dotted underline-offset-2 hover:text-coral bg-coral-wash px-2 py-0.5 rounded-md"
      >
        chrome://extensions
      </button>
      <span className={`text-[12px] ${copied ? 'text-forest font-semibold' : 'text-ink-3'}`}>
        {copied ? '✓ Copied! Paste it into the address bar' : '(click to copy)'}
      </span>
    </span>
  )
}
