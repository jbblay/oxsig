import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Initialize synchronously when possible to avoid a mismatch on first client render
  const getInitial = () => {
    if (typeof window === "undefined") return false
    try {
      return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
    } catch (e) {
      return window.innerWidth < MOBILE_BREAKPOINT
    }
  }

  const [isMobile, setIsMobile] = React.useState<boolean>(getInitial)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = (ev: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(Boolean((ev as any).matches))
    }
    // Some browsers expose addEventListener on MediaQueryList, older ones use addListener
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange)
    } else if (typeof (mql as any).addListener === "function") {
      ;(mql as any).addListener(onChange)
    }
    // ensure initial state is correct
    setIsMobile(mql.matches)
    return () => {
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", onChange)
      } else if (typeof (mql as any).removeListener === "function") {
        ;(mql as any).removeListener(onChange)
      }
    }
  }, [])

  return isMobile
}
