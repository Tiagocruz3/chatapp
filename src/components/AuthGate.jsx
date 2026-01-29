import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import './AuthGate.css'

export function AuthGate({ children, onUser }) {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)

  const features = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      title: 'Natural Conversations',
      description: 'Chat with advanced AI models that understand context and nuance.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      ),
      title: 'Memory & Context',
      description: 'Your AI remembers preferences and past conversations for personalized responses.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      ),
      title: 'Code Assistant',
      description: 'Write, debug, and deploy code with an intelligent coding companion.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      ),
      title: 'Image Generation',
      description: 'Create stunning visuals from text descriptions with DALL-E integration.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      ),
      title: 'Knowledge Base',
      description: 'Upload documents and let AI help you search, analyze, and understand them.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      ),
      title: 'Multiple AI Agents',
      description: 'Switch between specialized agents for different tasks and workflows.'
    }
  ]

  useEffect(() => {
    let isMounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      onUser?.(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      onUser?.(nextSession?.user ?? null)
    })
    return () => {
      isMounted = false
      sub.subscription.unsubscribe()
    }
  }, [onUser])

  // Auto-rotate features
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % features.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [features.length])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-loader">
          <div className="auth-loader-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="7" width="16" height="11" rx="3" />
              <circle cx="9" cy="12.5" r="1.3" />
              <circle cx="15" cy="12.5" r="1.3" />
              <path d="M8 18v3" />
              <path d="M16 18v3" />
              <path d="M12 3v3" />
              <circle cx="12" cy="3" r="1" />
            </svg>
          </div>
          <div className="auth-loader-spinner"></div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="auth-page">
        {/* Left Side - Features */}
        <div className="auth-features">
          <div className="auth-features-content">
            <div className="auth-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="auth-brand-logo">
                <rect x="4" y="7" width="16" height="11" rx="3" />
                <circle cx="9" cy="12.5" r="1.3" />
                <circle cx="15" cy="12.5" r="1.3" />
                <path d="M8 18v3" />
                <path d="M16 18v3" />
                <path d="M12 3v3" />
                <circle cx="12" cy="3" r="1" />
              </svg>
              <span className="auth-brand-name">Agent Me</span>
            </div>
            
            <h1 className="auth-tagline">
              Your AI-powered
              <br />
              <span className="auth-tagline-highlight">productivity companion</span>
            </h1>
            
            <p className="auth-subtitle">
              Experience the power of advanced AI with memory, code assistance, 
              image generation, and more.
            </p>

            {/* Feature Cards */}
            <div className="auth-feature-cards">
              {features.map((feature, index) => (
                <div 
                  key={index}
                  className={`auth-feature-card ${activeFeature === index ? 'active' : ''}`}
                  onClick={() => setActiveFeature(index)}
                >
                  <div className="auth-feature-icon">{feature.icon}</div>
                  <div className="auth-feature-text">
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Feature Indicators */}
            <div className="auth-feature-indicators">
              {features.map((_, index) => (
                <button
                  key={index}
                  className={`auth-feature-dot ${activeFeature === index ? 'active' : ''}`}
                  onClick={() => setActiveFeature(index)}
                />
              ))}
            </div>
          </div>
          
          {/* Gradient Orbs */}
          <div className="auth-orb auth-orb-1"></div>
          <div className="auth-orb auth-orb-2"></div>
          <div className="auth-orb auth-orb-3"></div>
        </div>

        {/* Right Side - Login Form */}
        <div className="auth-form-section">
          <div className="auth-form-container">
            <div className="auth-form-header">
              <h2>Welcome back</h2>
              <p>Sign in to continue to your workspace</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-input-group">
                <label htmlFor="auth-email">Email address</label>
                <input 
                  id="auth-email"
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  type="email" 
                  placeholder="name@company.com"
                  required 
                  autoComplete="email"
                  className="auth-input"
                />
              </div>

              <div className="auth-input-group">
                <label htmlFor="auth-password">Password</label>
                <div className="auth-input-wrapper">
                  <input 
                    id="auth-password"
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    required 
                    autoComplete="current-password"
                    className="auth-input"
                  />
                  <button 
                    type="button" 
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="auth-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button className="auth-submit-btn" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <div className="auth-btn-spinner"></div>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </>
                )}
              </button>
            </form>

            <div className="auth-form-footer">
              <p>By continuing, you agree to our Terms of Service and Privacy Policy</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return children
}
