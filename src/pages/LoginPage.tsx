import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import logo from '../assets/logo.jpg';
import { useToast } from '../context/ToastContext';
import api from '../lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const expired = sessionStorage.getItem('session_expired');
    if (expired) {
      toast.warning('Session Expired', 'Your session has expired. Please log in again.');
      sessionStorage.removeItem('session_expired');
    }
  }, [toast]);

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
        const res = await api.post('/login', { username, password });
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('token', res.data.token);
        storage.setItem('user', JSON.stringify(res.data.user));
        localStorage.setItem('lastActivity', Date.now().toString());
        const roleNames: Record<string, string> = {
          'vpaa': 'VPAA',
          'dean': 'Dean',
          'secretary': 'Secretary',
          'program_head': 'Program Head',
        };
        const role = roleNames[res.data.user.role] || 'User';
        toast.success('Login Successful', `Welcome back ${role}!`);
        
        // Dynamic redirection based on role
        if (res.data.user.role === 'vpaa') {
          navigate('/dashboard');
        } else if (res.data.user.role === 'dean') {
          navigate('/dean/dashboard');
        } else if (res.data.user.role === 'secretary') {
          navigate('/secretary/dashboard');
        } else if (res.data.user.role === 'program_head') {
          navigate('/program_head/dashboard');
        } else {
          navigate('/dashboard');
        }
    } catch {
        toast.error('Login Failed', 'Invalid username or password.');
    } finally {
        setIsLoading(false);
    }
};

  return (
    <div className="min-h-screen flex w-full">
      {/* Left Panel */}
      <div className="hidden md:flex flex-1 relative bg-[#4e0a10] overflow-hidden items-center justify-center p-12">
        {/* Animated Background Shapes */}
        <div className="absolute inset-0 z-0">
           {/* Shapes */}
           <div className="absolute top-[10%] left-[20%] w-64 h-64 rounded-full border border-accent/20 animate-float opacity-20" />
           <div className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-[2rem] border border-primary-light/10 animate-float-slow rotate-45 opacity-20" />
           <div className="absolute bottom-[10%] left-[30%] w-32 h-32 rounded-full bg-primary-light/5 animate-float blur-3xl" />
        </div>

        {/* Content */}
        <div className="relative z-20 flex flex-col items-center text-center max-w-lg">
          <img src={logo} alt="TCC Logo" className="w-28 h-28 object-contain rounded-full mb-6" />
          <h1 className="font-display text-4xl text-white font-bold mb-2">Tagoloan Community College</h1>
          <p className="text-sidebar-text text-sm tracking-widest uppercase mb-6 opacity-80">
            Academic Scheduling System
          </p>
          <div className="w-16 h-px bg-accent mb-6"></div>
          <p className="text-sidebar-text text-lg italic opacity-90 font-display">
            "Intelligent scheduling. Zero conflicts."
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center bg-parchment p-6">
        <div 
          className="w-full max-w-md bg-surface p-10 sm:p-12 rounded-2xl shadow-2xl border border-border glass"
        >
          <h2 
            className="text-primary font-display text-2xl mb-2" 
            style={{ animationDelay: '0s' }}
          >
            WICARS
          </h2>
          <h3 
            className="text-text font-display text-3xl font-bold mb-2"
            style={{ animationDelay: '0.1s' }}
          >
            Welcome back
          </h3>
          <p 
            className="text-muted text-sm mb-8"
            style={{ animationDelay: '0.2s' }}
          >
            Sign in to your administrator account
          </p>

          <form onSubmit={handleSubmit} className="space-y-5" style={{ animationDelay: '0.3s' }}>
            {/* Username */}
            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm font-medium text-text">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-muted" />
                </div>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full h-12 pl-11 pr-4 bg-transparent border border-border rounded-xl text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-300 outline-none"
                  placeholder="admin"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-text">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-muted" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full h-12 pl-11 pr-11 bg-transparent border border-border rounded-xl text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-300 outline-none"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted hover:text-text transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between mt-5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-text">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-accent/20 focus:ring-offset-0 focus:ring-2 accent-primary transition-all cursor-pointer"
                />
                <span className="text-sm font-medium">Remember Me</span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-all duration-300 active:scale-[0.98] relative overflow-hidden group disabled:opacity-50 disabled:pointer-events-none"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </span>
                {/* Shimmer effect via before pseudo element */}
                <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.1),transparent)] bg-[length:200%_100%] animate-shimmer opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </form>

          <div 
            className="mt-8 flex items-center justify-center gap-2 text-xs text-muted"
            style={{ animationDelay: '0.4s' }}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Authorized personnel only</span>
          </div>
        </div>
      </div>
    </div>
  );
}
