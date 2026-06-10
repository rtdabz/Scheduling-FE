
import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

export default function Departments() {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/departments');
      // Handle potential pagination or check if data is in a sub-property
      const departmentData = Array.isArray(res.data) ? res.data : (res.data.data || []);
      setDepartments(departmentData);
    } catch (error) {
      toast.error('Error', 'Failed to fetch departments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/departments', {
        department_name: name,
        department_code: code
      });
      toast.success('Success', 'Department created successfully');
      setName('');
      setCode('');
      setIsModalOpen(false);
      fetchDepartments();
    } catch (error: any) {
      toast.error('Error', error.response?.data?.message || 'Failed to create department');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteDepartment = async (id: number) => {
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success('Deleted', 'Department removed');
      fetchDepartments();
    } catch (error) {
      toast.error('Error', 'Failed to delete department');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-muted text-sm mb-1">Home / Departments</p>
          <h1 className="font-display text-3xl font-bold text-[#1A1410]">Departments</h1>
          <p className="text-muted text-sm mt-1">Manage academic departments of the institution</p>
          <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1A1410] text-white px-4 py-2 rounded-lg hover:bg-[#C9952A] transition-colors flex items-center gap-2"
        >
          <span className="text-xl">+</span> Add Department
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 font-semibold text-sm text-gray-700">Code</th>
              <th className="px-6 py-4 font-semibold text-sm text-gray-700">Department Name</th>
              <th className="px-6 py-4 font-semibold text-sm text-gray-700">Created At</th>
              <th className="px-6 py-4 font-semibold text-sm text-gray-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-gray-500 italic">Loading departments...</td>
              </tr>
            ) : departments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-gray-500">No departments found.</td>
              </tr>
            ) : (
              departments.map((dept) => (
                <tr key={dept.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono font-bold uppercase">{dept.department_code}</span></td>
                  <td className="px-6 py-4 text-gray-800 font-medium">{dept.department_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{(dept as any).created_at ? new Date((dept as any).created_at).toLocaleDateString() : 'N/A'}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => deleteDepartment(dept.id)}
                      className="text-red-500 hover:text-red-700 p-2"
                    >
                      Delete
                    </button>
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
              <h2 className="text-xl font-bold text-[#1A1410]">Add New Department</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department Code</label>
                <input 
                  type="text" 
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. BSCS"
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#C9952A] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bachelor of Science in Computer Science"
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#C9952A] outline-none"
                />
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
                  {isSubmitting ? 'Creating...' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
