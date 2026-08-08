import { useEffect, useRef } from "react"

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
    ),
  )
}

export default function useBarcodeScanner({
  enabled = true,
  minLength = 6,
  maxGapMs = 100,
  onScan,
}) {
  const onScanRef = useRef(onScan)
  const bufferRef = useRef("")
  const lastKeyAtRef = useRef(0)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    function reset() {
      bufferRef.current = ""
      lastKeyAtRef.current = 0
    }

    function onKeyDown(event) {
      if (!enabled || event.defaultPrevented || isEditableTarget(event.target)) {
        reset()
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
        reset()
        return
      }

      if (event.key === "Enter") {
        const code = bufferRef.current.trim()
        reset()
        if (code.length < minLength) return
        event.preventDefault()
        onScanRef.current?.(code)
        return
      }

      if (event.key.length !== 1) {
        if (event.key === "Escape") reset()
        return
      }

      const now = performance.now()
      if (lastKeyAtRef.current && now - lastKeyAtRef.current > maxGapMs) {
        bufferRef.current = ""
      }
      bufferRef.current += event.key
      lastKeyAtRef.current = now

      if (bufferRef.current.length > 128) reset()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled, maxGapMs, minLength])
}
