import { useTour } from '../../hooks/useTour'

export default function DashboardPage() {
  useTour()
  
  const userJson = localStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;

  return (
    <div>
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Dashboard</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">Dean Dashboard</h1>
        <p className="text-muted text-sm mt-1">Welcome back, {user?.name || 'Dean'}!</p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>
      
      {/* Page content would go here */}
    </div>
  );
}