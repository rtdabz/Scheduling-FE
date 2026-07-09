import { useState, useEffect } from 'react';
import { useTour } from '../../hooks/useTour';
import Skeleton from '../../components/ui/Skeleton';

export default function SecretaryDashboardPage() {
  useTour();
  const [isLoading, setIsLoading] = useState(true);
  
  const userJson = localStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="transition-opacity duration-200">
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Dashboard</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">Secretary Dashboard</h1>
        <p className="text-muted text-sm mt-1">Welcome back, {user?.name || 'Secretary'}!</p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-gray-150/70 shadow-sm animate-pulse">
              <Skeleton className="h-4 w-28 mb-3" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-gray-500 text-sm font-medium">Class Schedules</h3>
            <p className="text-3xl font-bold text-[#1A1410] mt-1">0</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-gray-500 text-sm font-medium">Active Rooms</h3>
            <p className="text-3xl font-bold text-[#1A1410] mt-1">6</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-gray-500 text-sm font-medium">Term Status</h3>
            <p className="text-3xl font-bold text-emerald-600 mt-1">Active</p>
          </div>
        </div>
      )}
    </div>
  );
}
