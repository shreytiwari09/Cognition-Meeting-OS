import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, onIdTokenChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, firestore } from '../firebase'

const AuthContext = createContext(null)

// Read cached profile synchronously — zero wait on first render
function getCachedProfile() {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function fetchProfile(uid) {
  const snap = await getDoc(doc(firestore, 'users', uid))
  if (!snap.exists()) return null
  const profile = { uid, ...snap.data() }
  localStorage.setItem('user', JSON.stringify(profile))
  return profile
}

// Dev-only preview mode (src/dev/mock.js) supplies a fake signed-in profile.
// Read at render time: the preview module loads after this file is imported.
const mockProfile = () => (import.meta.env.DEV ? globalThis.__MEETINGOS_MOCK_PROFILE__ || null : null)

export function AuthProvider({ children }) {
  const cached = mockProfile() || getCachedProfile()

  // Start with cached values so the app renders immediately
  const [user,        setUser]        = useState(cached ? { uid: cached.uid } : null)
  const [userProfile, setUserProfile] = useState(cached)
  // loading=false if we already have a cached profile, true otherwise
  const [loading,     setLoading]     = useState(!cached)

  // Re-read the profile from Firestore, e.g. after creating/joining a company or a role change
  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return null
    const profile = await fetchProfile(auth.currentUser.uid)
    setUserProfile(profile)
    return profile
  }, [])

  useEffect(() => {
    if (mockProfile()) return
    // Fires on sign-in, sign-out and every hourly token refresh. api.js uses this cached token
    // for the first requests, before the Firebase SDK has restored the session
    const unsubToken = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) localStorage.setItem('cognition_ext_token', await firebaseUser.getIdToken())
      else localStorage.removeItem('cognition_ext_token')
    })

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        // Always revalidate the cached profile so role/company changes show up
        try {
          setUserProfile(await fetchProfile(firebaseUser.uid))
        } catch {
          // Keep the cached profile if Firestore is unreachable
        }
      } else {
        // Signed out — clear everything
        setUser(null)
        setUserProfile(null)
        localStorage.removeItem('user')
      }
      setLoading(false)
    })

    return () => { unsubToken(); unsubAuth() }
  }, [])

  const logout = async () => {
    if (mockProfile()) { localStorage.removeItem('meetingos_mock'); window.location.href = '/'; return }
    await signOut(auth)
    localStorage.removeItem('user')
    localStorage.removeItem('cognition_ext_token')
    setUser(null)
    setUserProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
