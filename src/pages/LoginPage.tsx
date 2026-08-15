import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import logo from '../assets/logo.jpg';
import campusBg from '../assets/campus-bg.jpg';
import loginPattern from '../assets/login-pattern.jpg';
import { useToast } from '../context/ToastContext';
import api from '../lib/api';
import { clearDataCache } from '../lib/dataCache';
import { AxiosError } from 'axios';

interface LoginResponse {
  token: string;
  user: {
    role: string;
  };
}

interface ApiErrorResponse {
  message?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
      const res = await api.post<LoginResponse>('/login', { username: username.trim(), password });
      clearDataCache();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem('token', res.data.token);
      storage.setItem('user', JSON.stringify(res.data.user));
      const roleNames: Record<string, string> = {
        'vpaa': 'VPAA',
        'dean': 'Dean',
        'secretary': 'Secretary',
        'program_head': 'Program Head',
      };
      const role = roleNames[res.data.user.role] || 'User';
      toast.success('Login Successful', `Welcome back ${role}!`);

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
    } catch (error) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const message = axiosError.response?.data?.message
        || (axiosError.request ? 'Unable to reach the server. Please check that the backend is running.' : 'Unable to sign in.');
      toast.error('Login Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full relative font-sans">
      {/* Left Panel */}
      <div className="hidden md:flex flex-1 relative bg-[#4e0a10] overflow-hidden items-center justify-center p-12">
        {/* Campus Background Image with Maroon Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src={campusBg}
            alt="Tagoloan Community College Campus"
            className="w-full h-full object-cover opacity-45 filter contrast-105 saturate-110 object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#36060b] via-[#4e0a10]/75 to-[#5A1220]/65 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/55" />
        </div>

        {/* Content */}
        <div className="relative z-20 flex flex-col items-center text-center max-w-lg">
          <img src={logo} alt="TCC Logo" className="w-28 h-28 object-contain rounded-full mb-6 shadow-2xl ring-4 ring-[#C9952A]/40 bg-white/10 p-1 backdrop-blur-xs" />
          <h1 className="font-display text-4xl text-white font-bold mb-2 drop-shadow-md">Tagoloan Community College</h1>
          <p className="text-[#E8D5C4] text-xs font-bold tracking-widest uppercase opacity-95 drop-shadow-sm bg-[#5A1220]/60 px-4 py-1.5 rounded-full border border-[#C9952A]/30 backdrop-blur-xs">
            Academic Scheduling System
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-white">
        {/* Perspective Grid Background Overlay */}
        <img
          src={loginPattern}
          alt="Grid Background"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-90"
        />

        <div 
          className="w-full max-w-md bg-white/75 backdrop-blur-xl p-10 sm:p-12 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.22)] border-2 border-gray-300/90 transition-all relative z-10"
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
            {/* Username Floating Label Input */}
            <div className="relative pt-1">
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder=" "
                className="peer block w-full h-12 pl-11 pr-4 bg-white/60 border border-gray-300 rounded-xl text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 outline-none"
              />
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted peer-focus:text-primary transition-colors">
                <Mail className="h-5 w-5" />
              </div>
              <label
                htmlFor="username"
                className="absolute left-9 -top-1.5 bg-white px-1.5 text-xs text-primary font-semibold transition-all duration-200 pointer-events-none rounded
                  peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:text-muted peer-placeholder-shown:font-normal peer-placeholder-shown:bg-transparent
                  peer-focus:-top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-primary peer-focus:font-semibold peer-focus:bg-white"
              >
                Username
              </label>
            </div>

            {/* Password Floating Label Input */}
            <div className="relative pt-1">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                className="peer block w-full h-12 pl-11 pr-11 bg-white/60 border border-gray-300 rounded-xl text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 outline-none"
              />
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted peer-focus:text-primary transition-colors">
                <Lock className="h-5 w-5" />
              </div>
              <label
                htmlFor="password"
                className="absolute left-9 -top-1.5 bg-white px-1.5 text-xs text-primary font-semibold transition-all duration-200 pointer-events-none rounded
                  peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:text-muted peer-placeholder-shown:font-normal peer-placeholder-shown:bg-transparent
                  peer-focus:-top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-primary peer-focus:font-semibold peer-focus:bg-white"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-muted hover:text-text transition-colors"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
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
                      Sign In
                    </>
                  ) : (
                    'Sign In'
                  )}
                </span>
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
