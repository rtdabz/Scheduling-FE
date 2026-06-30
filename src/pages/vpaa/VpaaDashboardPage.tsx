import { useTour } from '../../hooks/useTour'
import { useToast } from '../../context/ToastContext'

export default function VpaaDashboardPage() {
  useTour()
  const { toast } = useToast()
  
  const userJson = localStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;

  return (
    <div>
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Dashboard</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">VPAA Dashboard</h1>
        <p className="text-muted text-sm mt-1">Welcome back, {user?.name || 'Administrator'}!</p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>
      
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
      
      {/* Page content would go here */}
    </div>
  );
}
