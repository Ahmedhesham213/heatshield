'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import {
  loginApi,
  registerApi,
  getMeApi,
  logoutApi,
  type AuthUser,
} from '@/services/api'

export type { AuthUser }

export const DEMO_EMAIL = 'mirey17981@bejum.com'
export const DEMO_PASSWORD = 'admin'

const AUTH_KEY = 'hs_auth_token'

type AuthContextType = {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (detail) {
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
      return JSON.stringify(detail)
    }
  }
  if (err instanceof Error && err.message && !err.message.includes('status code')) {
    return err.message
  }
  return fallback
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem(AUTH_KEY)
    if (!savedToken) {
      setUser(null)
      setToken(null)
      setIsLoading(false)
      return
    }

    getMeApi(savedToken)
      .then((userData) => {
        setToken(savedToken)
        setUser(userData)
      })
      .catch(() => {
        localStorage.removeItem(AUTH_KEY)
        setToken(null)
        setUser(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])


  const login = useCallback(async (email: string, password: string) => {
    try {
      const resp = await loginApi(email, password)
      localStorage.setItem(AUTH_KEY, resp.token)
      setToken(resp.token)
      setUser(resp.user)
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err, 'Invalid email or password.'))
    }
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    try {
      const resp = await registerApi(name, email, password)
      localStorage.setItem(AUTH_KEY, resp.token)
      setToken(resp.token)
      setUser(resp.user)
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err, 'Registration failed.'))
    }
  }, [])

  const logout = useCallback(() => {
    const currentToken = localStorage.getItem(AUTH_KEY)
    if (currentToken) {
      logoutApi(currentToken).catch(() => {})
    }
    localStorage.removeItem(AUTH_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
