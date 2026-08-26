'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react'
import { useAuth, DEMO_EMAIL, DEMO_PASSWORD } from '@/hooks/use-auth'

export default function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/')
    }
  }, [isAuthenticated, isLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in all fields.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await login(email.trim(), password)
      router.replace('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const fillDemo = () => {
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setError(null)
  }

  if (isLoading) return null

  return (
    <div className="login-page">
      <div className="login-blob login-blob-1" />
      <div className="login-blob login-blob-2" />

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <span className="login-logo-icon">
            <ShieldCheck size={26} />
          </span>
          <span className="login-logo-text">HeatShield</span>
        </div>

        <div className="login-header">
          <h1 className="login-title">Welcome back</h1>
          <p className="login-subtitle">Sign in to access US heat risk intelligence</p>
        </div>

        {/* Demo credentials hint */}
        <button
          type="button"
          className="demo-hint"
          onClick={fillDemo}
          tabIndex={0}
          aria-label="Use demo credentials"
        >
          <span className="demo-hint-label">🔑 Demo credentials</span>
          <span className="demo-hint-creds">
            {DEMO_EMAIL} · {DEMO_PASSWORD}
          </span>
          <span className="demo-hint-action">Click to fill →</span>
        </button>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          {error && (
            <div className="login-error" role="alert">
              <span>⚠️</span>
              {error}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="email" className="form-label">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              placeholder="you@example.com"
              className="form-input"
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <div className="form-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                placeholder="••••••••"
                className="form-input form-input-pw"
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="login-spinner" aria-hidden="true" />
            ) : (
              <LogIn size={18} />
            )}
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-bold text-primary hover:underline">
            Register now
          </Link>
        </div>
      </div>
    </div>
  )
}
