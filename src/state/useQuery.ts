import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'

/**
 * One hook for every data-backed page.
 *
 * The brief is explicit that an empty page must never be filled with fabricated
 * records, so the three states are kept strictly separate: `loading`, `error`
 * and `data`. A failed request resolves to `error` with the service's own
 * message — it never degrades into `data: []`, because those two look identical
 * on screen and mean opposite things.
 */

export interface QueryState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  /** True only for the first load, so refreshes do not flash a skeleton. */
  initial: boolean
  reload: () => void
}

export function useQuery<T = any>(
  /** Null disables the request, e.g. before a workspace is chosen. */
  fetcher: (() => Promise<T>) | null,
  deps: unknown[] = [],
): QueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(fetcher !== null)
  const [initial, setInitial] = useState(true)
  const [nonce, setNonce] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    const run = fetcherRef.current
    if (!run) {
      setData(null)
      setError(null)
      setLoading(false)
      setInitial(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    run()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setData(null)
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, 'Something went wrong loading this page.', 'client', null),
        )
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setInitial(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  return { data, error, loading, initial, reload }
}

/**
 * Wraps a one-shot action (create, invite, record event) with pending and error
 * state so a button can be disabled while in flight and a failure is reported
 * rather than swallowed.
 */
export function useAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
): {
  run: (...args: Args) => Promise<Result | null>
  pending: boolean
  error: ApiError | null
  clear: () => void
} {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const run = useCallback(
    async (...args: Args): Promise<Result | null> => {
      setPending(true)
      setError(null)
      try {
        return await action(...args)
      } catch (err: unknown) {
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, 'The action could not be completed.', 'client', null),
        )
        return null
      } finally {
        setPending(false)
      }
    },
    [action],
  )

  return { run, pending, error, clear: () => setError(null) }
}