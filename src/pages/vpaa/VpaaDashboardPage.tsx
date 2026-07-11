import { useState, useEffect } from 'react';
import { useTour } from '../../hooks/useTour';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';

export default function VpaaDashboardPage() {
  useTour();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="transition-opacity duration-200">
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Dashboard</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">VPAA Dashboard</h1>
        <p className="text-muted text-sm mt-1">Welcome back, {user?.name || 'Administrator'}!</p>
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
            <h3 className="text-gray-500 text-sm font-medium">Total Departments</h3>
            <p className="text-3xl font-bold text-[#1A1410] mt-1">7</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-gray-500 text-sm font-medium">Active Rooms</h3>
            <p className="text-3xl font-bold text-[#1A1410] mt-1">12</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-gray-500 text-sm font-medium">Pending Approvals</h3>
            <p className="text-3xl font-bold text-[#7B1113] mt-1">3</p>
          </div>
        </div>
      )}
      
      {/* Toast test buttons */}
      <div className="flex flex-wrap gap-4 mb-8 p-4 bg-white/50 rounded-xl border border-[#E2D9D0]">
        <button 
          onClick={() => toast.success('Schedule Saved', 'Class schedule has been saved successfully.')}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
          Test Success
        </button>
        <button 
          onClick={() => toast.error('Conflict Detected', 'Room overlap found on Tuesday 8AM.')}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">
          Test Error
        </button>
        <button 
          onClick={() => toast.warning('Incomplete Data', 'Some subjects have no assigned rooms.')}
          className="px-4 py-2 bg-[#C9952A] text-white rounded-lg text-sm hover:bg-[#B08225] transition-colors">
          Test Warning
        </button>
        <button 
          onClick={() => toast.info('Term Updated', 'Academic term set to 1st Sem 2024-2025.')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
          Test Info
        </button>
      </div>
    </div>
  );
}
