import { useState, useEffect, useRef } from 'react'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { firestore } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { ROLE_LABEL } from '../lib/format'


// Dev-only preview mode has no Firebase session, so chat stays offline there
const previewMode = () => import.meta.env.DEV && !!globalThis.__MEETINGOS_MOCK_PROFILE__

export default function CompanyChat() {
  const { userProfile } = useAuth()
  const { toast } = useToast()
  
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(!previewMode())
  const [unread, setUnread] = useState(0)
  
  const messagesEndRef = useRef(null)
  const prevLenRef = useRef(0)

  const companyId = userProfile?.companyId
  const uid = userProfile?.uid

  // Real-time Firestore listener
  useEffect(() => {
    if (!companyId || previewMode()) return

    const messagesRef = collection(firestore, 'companies', companyId, 'messages')
    const q = query(messagesRef, orderBy('createdAt', 'asc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = []
      snapshot.forEach(doc => {
        fetched.push({ id: doc.id, ...doc.data() })
      })
      
      // Track unread: if chat is closed and new messages arrived
      if (!isOpen && fetched.length > prevLenRef.current && prevLenRef.current > 0) {
        setUnread(prev => prev + (fetched.length - prevLenRef.current))
      }
      prevLenRef.current = fetched.length

      setMessages(fetched)
      setLoading(false)
    }, (error) => {
      console.error("Chat listener error:", error)
      toast('Failed to connect to team chat', 'error')
      setLoading(false)
    })

    return () => unsubscribe()
  }, [companyId])

  // Clear unread when opening
  useEffect(() => {
    if (isOpen) setUnread(0)
  }, [isOpen])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // Don't render if user isn't in a company (AFTER all hooks)
  if (!userProfile || !companyId) return null

  async function handleSend(e) {
    e.preventDefault()
    if (!inputText.trim()) return

    const msg = inputText.trim()
    setInputText('')

    try {
      const messagesRef = collection(firestore, 'companies', companyId, 'messages')
      await addDoc(messagesRef, {
        text: msg,
        senderId: uid,
        senderName: userProfile.name,
        senderRole: userProfile.role,
        createdAt: serverTimestamp()
      })
    } catch (err) {
      console.error("Error sending message:", err)
      toast('Failed to send message', 'error')
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-70 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[min(380px,calc(100vw-2.5rem))] h-[min(520px,calc(100vh-8rem))] bg-white rounded-bento flex flex-col overflow-hidden anim-fade-up"
             style={{ boxShadow: '0 24px 60px -12px rgba(24,24,27,0.28), 0 0 0 1px rgba(0,0,0,0.04)' }}>
          <div className="bg-panel text-white px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-label-lg">Team chat</p>
              <p className="text-[11px] text-ink-3">Everyone in your company</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center" aria-label="Close chat">
              <span className="icon" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-canvas">
            {loading ? <p className="text-body-sm text-ink-3 text-center mt-8">Loading messages…</p>
              : messages.length === 0 ? <p className="text-body-sm text-ink-3 text-center mt-8">No messages yet. Say hello to your team.</p>
              : messages.map(msg => {
                const mine = msg.senderId === uid
                return (
                  <div key={msg.id} className={`flex flex-col max-w-[82%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                    {!mine && (
                      <span className="text-[11px] text-ink-2 mb-1 px-1">
                        <span className="font-semibold text-ink capitalize">{msg.senderName}</span> · {ROLE_LABEL[msg.senderRole] || msg.senderRole}
                      </span>
                    )}
                    <div className={`px-4 py-2.5 text-body-sm leading-relaxed whitespace-pre-wrap break-words ${
                      mine ? 'bg-coral text-white rounded-2xl rounded-br-md' : 'bg-white text-ink rounded-2xl rounded-bl-md shadow-sm'}`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-ink-3 mt-1 px-1">
                      {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'sending…'}
                    </span>
                  </div>
                )
              })}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSend} className="p-3 border-t border-surface-container flex gap-2">
            <input className="field" value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Message your team…" />
            <button type="submit" disabled={!inputText.trim()} className="w-10 h-10 rounded-full bg-coral text-white flex items-center justify-center shrink-0 disabled:opacity-40" aria-label="Send">
              <span className="icon" style={{ fontSize: 18 }}>arrow_upward</span>
            </button>
          </form>
        </div>
      )}
      <button onClick={() => setIsOpen(!isOpen)}
              className="relative h-12 pl-4 pr-5 rounded-full bg-panel text-white flex items-center gap-2 shadow-float hover:-translate-y-0.5 transition-transform">
        <span className="icon" style={{ fontSize: 20 }}>{isOpen ? 'close' : 'chat'}</span>
        <span className="text-label-lg">{isOpen ? 'Close' : 'Team chat'}</span>
        {!isOpen && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-coral text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-canvas">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  )
}
