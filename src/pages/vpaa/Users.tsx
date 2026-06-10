
import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface User {
  id: number;
  name: string;
  username: string;
  role: string;
  department?: {
    department_name: string;
  };
}

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

export default function Users() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal & Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: 'secretary',
    department_id: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-generate username and password based on role and department
  useEffect(() => {
    if (formData.role && formData.department_id) {
      const dept = departments.find(d => d.id === parseInt(formData.department_id));
      if (dept) {
        const roleName = formData.role
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join('');
        
        const generatedUser = `${dept.department_code}${roleName}`;
        setFormData(prev => ({
          ...prev,
          username: generatedUser,
          password: `${dept.department_code.toLowerCase()}12345` // Default password pattern
        }));
      }
    }
  }, [formData.role, formData.department_id, departments]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [usersRes, deptsRes] = await Promise.all([
        api.get('/user'), // Changed from /users to /user to match the route we set up
        api.get('/departments')
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data.data || []));
      setDepartments(Array.isArray(deptsRes.data) ? deptsRes.data : (deptsRes.data.data || []));
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/user', formData); // Changed from /users to /user
      toast.success('Success', 'User created successfully');
      setFormData({ name: '', username: '', password: '', role: 'secretary', department_id: '' });
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error('Error', error.response?.data?.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'vpaa': return 'bg-purple-100 text-purple-700';
      case 'dean': return 'bg-blue-100 text-blue-700';
      case 'program_head': return 'bg-green-100 text-green-700';
      case 'secretary': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-muted text-sm mb-1">Home / User Management</p>
          <h1 className="font-display text-3xl font-bold text-[#1A1410]">User Management</h1>
          <p className="text-muted text-sm mt-1">Manage accounts for Deans, Program Heads, and Secretaries</p>
          <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1A1410] text-white px-4 py-2 rounded-lg hover:bg-[#C9952A] transition-colors flex items-center gap-2"
        >
          <span className="text-xl">+</span> Add User
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 font-semibold text-sm text-gray-700">Name</th>
              <th className="px-6 py-4 font-semibold text-sm text-gray-700">Username</th>
              <th className="px-6 py-4 font-semibold text-sm text-gray-700">Role</th>
              <th className="px-6 py-4 font-semibold text-sm text-gray-700">Department</th>
              <th className="px-6 py-4 font-semibold text-sm text-gray-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-500 italic">Loading users...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-500">No users found or backend endpoint pending.</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-gray-800 font-medium">{user.name}</td>
                  <td className="px-6 py-4 text-gray-600">{user.username}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${getRoleBadgeColor(user.role)}`}>
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {user.department?.department_name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-gray-400 hover:text-[#C9952A] p-2">Edit</button>
                    <button className="text-red-400 hover:text-red-600 p-2">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#1A1410]">Create New Account</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. John Doe"
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#C9952A] outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username (Auto)</label>
                  <input 
                    type="text" 
                    value={formData.username}
                    readOnly
                    placeholder="Auto-generated"
                    required
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password (Default)</label>
                  <input 
                    type="text" 
                    value={formData.password}
                    readOnly
                    placeholder="Auto-generated"
                    required
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select 
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#C9952A] outline-none bg-white"
                >
                  <option value="dean">Dean</option>
                  <option value="program_head">Program Head</option>
                  <option value="secretary">Secretary</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Department</label>
                <select 
                  value={formData.department_id}
                  onChange={(e) => setFormData({...formData, department_id: e.target.value})}
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#C9952A] outline-none bg-white"
                >
                  <option value="">Select a department...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-[#1A1410] text-white rounded-lg hover:bg-[#C9952A] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
