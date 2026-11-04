import axios from 'axios'
import { auth } from './firebase'

export const API_URL = (import.meta.env.VITE_API_URL || 'https://cognition-meetingos.onrender.com').replace(/\/$/, '')
const api = axios.create({ baseURL: API_URL })

// Attach Firebase Auth Token to every request to secure endpoints
// Falls back to localStorage cache while Firebase SDK initializes
api.interceptors.request.use(async config => {
  let token = null
  if (auth.currentUser) {
    token = await auth.currentUser.getIdToken()
  } else {
    // Firebase SDK not ready yet — use token cached by AuthContext
    token = localStorage.getItem('cognition_ext_token')
  }
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

export default api

export const getMeetings        = ()         => api.get('/meetings/')
export const getMeeting         = (id)       => api.get(`/meetings/${id}`)
export const getMeetingLogs     = (id)       => api.get(`/meetings/${id}/logs`)
export const uploadTranscript   = (data)     => api.post('/meetings/upload-transcript', data)
export const getAllTasks         = ()         => api.get('/tasks/')
export const getMyTasks         = ()         => api.get('/tasks/mine')
export const validateTask       = (id, data) => api.post(`/tasks/${id}/validate`, data)
export const updateTaskStatus   = (id, data) => api.patch(`/tasks/${id}/status`, data)
export const updateTaskProgress = (id, data) => api.patch(`/tasks/${id}/progress`, data)
export const reassignTask       = (id, assignee) => api.patch(`/tasks/${id}/assign`, { assignee })
export const decideTask         = (id, accept, reason = '') => api.patch(`/tasks/${id}/acceptance`, { accept, reason })
export const addMeetingTask     = (meetingId, data) => api.post(`/meetings/${meetingId}/tasks`, data)
export const getNotifications   = ()         => api.get('/notifications')
export const exportAuditLog     = ()         => api.get('/analytics/export', { responseType: 'blob' })
export const checkOverdueTasks  = ()         => api.post('/tasks/check-overdue')
export const regenerateSummary  = (id)       => api.post(`/meetings/${id}/regenerate-summary`)
export const chatMeeting        = (id, data) => api.post(`/meetings/${id}/chat`, data)

// Organization management
export const getCompanyTeam     = ()         => api.get('/companies/team')
export const getCompanyInfo     = ()         => api.get('/companies/info')
export const connectExtension   = ()         => api.post('/extension/token')
export const getExtensionStatus = ()         => api.get('/extension/status')
export const disconnectExtension = ()        => api.delete('/extension/token')
export const getTeamPerformance = (window = 10) => api.get('/analytics/team', { params: { window } })
export const getInvites         = ()         => api.get('/companies/invites')
export const createInvite       = (role, managerId) => api.post('/companies/invites', { role, manager_id: managerId })
export const revokeInvite       = (code)     => api.delete(`/companies/invites/${code}`)
export const assignManager      = (uid, managerId) => api.patch(`/companies/team/${uid}/manager`, { manager_id: managerId })
export const removeTeamMember   = (uid)      => api.delete(`/companies/team/${uid}`)
export const updateMemberRole   = (uid, role) => api.patch(`/companies/team/${uid}/role`, { role })
export const createCompany      = (data)     => api.post('/companies', data)
export const joinCompany        = (data)     => api.post('/companies/join', data)
export const previewInvite      = (code)     => api.get('/companies/invite-preview', { params: { code } })

