import { createContext, createElement, useContext, useEffect, useState } from 'react'

// Lets a page give the shell a better breadcrumb (e.g. a meeting's title) and sets the browser tab title
const PageMetaContext = createContext({ crumb: null, setCrumb: () => {} })

export function PageMetaProvider({ children }) {
  const [crumb, setCrumb] = useState(null)
  return createElement(PageMetaContext.Provider, { value: { crumb, setCrumb } }, children)
}

export function usePageMeta() {
  return useContext(PageMetaContext)
}

export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} · MeetingOS`
    return () => { document.title = previous }
  }, [title])
}
