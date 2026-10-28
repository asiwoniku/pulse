import { useEffect, useId, useRef, useState } from 'react'
import { geo } from '../lib/api'

export interface AddressCandidate {
  label: string
  lat: number
  lng: number
  kind?: string
  provider?: string
}

/**
 * Type-ahead address field.
 *
 * The field stays a normal text input and stays editable: picking a suggestion
 * only *fills in* what the provider already matched, it never locks the value.
 * That matters more than it looks — in the markets this runs in, plenty of real
 * addresses are missing from any geocoder, and a field that refuses to accept what
 * was typed would make those deliveries unbookable. Free text always wins.
 *
 * Debounced at 350ms because the provider's own rate limit is one request per
 * second for the keyless geocoder, and firing per keystroke would guarantee
 * failures. Candidates are shown in provider order and never auto-selected: the
 * dispatcher decides which district the load actually goes to.
 */
export function AddressInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const listId = `${fieldId}-suggestions`

  const [candidates, setCandidates] = useState<AddressCandidate[]>([])
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const query = value.trim()
    if (query.length < 3) {
      setCandidates([])
      setStatus('')
      return
    }
    const mine = ++seq.current
    setBusy(true)
    const timer = window.setTimeout(() => {
      geo
        .suggest(query)
        .then((result) => {
          // A slower earlier request must not overwrite a newer one.
          if (mine !== seq.current) return
          setCandidates(result.candidates)
          setStatus(result.note ?? '')
          setOpen(true)
        })
        .catch((error: unknown) => {
          if (mine !== seq.current) return
          setCandidates([])
          setStatus(error instanceof Error ? error.message : 'Address lookup failed.')
          setOpen(true)
        })
        .finally(() => {
          if (mine === seq.current) setBusy(false)
        })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [value])

  // Clicking anywhere else closes the list; the value that was typed is untouched.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="field address-field" ref={boxRef}>
      <label htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => candidates.length && setOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && candidates.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {busy ? <span className="muted small">Looking up…</span> : null}

      {open ? (
        <div className="address-suggestions">
          {candidates.length === 0 ? (
            <p className="address-suggestions__empty">
              {status || 'No matches yet. Keep typing — you can always enter the address as text.'}
            </p>
          ) : (
            <ul className="address-suggestions__list" id={listId} role="listbox">
              {candidates.map((candidate) => (
                <li key={`${candidate.lat},${candidate.lng},${candidate.label}`} role="option">
                  <button
                    type="button"
                    className="address-suggestions__item"
                    onClick={() => {
                      onChange(candidate.label)
                      setOpen(false)
                    }}
                  >
                    <span>{candidate.label}</span>
                    {candidate.kind ? <span className="muted small">{candidate.kind}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="address-suggestions__note">
            Suggestions come from {candidates[0]?.provider ?? 'the configured provider'}. Pick
            one to fill the field, or carry on typing — the address is stored exactly as
            you leave it.
          </p>
        </div>
      ) : null}
    </div>
  )
}