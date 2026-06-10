import React from 'react';

export default function DashboardPage() {
  const userJson = localStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;

  return (
    <div className="p-0">
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Dashboard</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">Program Head Dashboard</h1>
        <p className="text-muted text-sm mt-1">Welcome back, {user?.name || 'Program Head'}!</p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium">Your Department</h3>
          <p className="text-2xl font-bold text-[#1A1410] mt-1">N/A</p>
        </div>
        {/* Add more statistics or quick links as needed */}
      </div>
    </div>
  );
}
