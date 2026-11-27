// The AeroSentry mark: a shield with a drone in it.
export default function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 3 57 16v25L32 61 7 41V16z" fill="#101a35" stroke="#2e4a8f" strokeWidth="2.5" />
      <g stroke="#9aa7c7" strokeWidth="2.5" strokeLinecap="round"><path d="M21 21l22 22M43 21 21 43" /></g>
      <g fill="none" stroke="#4dc6ff" strokeWidth="2.2">
        <circle cx="21" cy="21" r="5" /><circle cx="43" cy="21" r="5" /><circle cx="21" cy="43" r="5" /><circle cx="43" cy="43" r="5" />
      </g>
      <circle cx="32" cy="32" r="4" fill="#fff" /><circle cx="32" cy="32" r="1.8" fill="#4dc6ff" />
    </svg>
  )
}
