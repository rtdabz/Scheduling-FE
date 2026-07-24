import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import {
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
  X,
  Loader2,
  Building2,
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  LayoutGrid,
  List,
  Filter,
  Plus
} from 'lucide-react';
import api from '../../lib/api';
import { clearDataCache, getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';


interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

interface Room {
  id: number;
  room_code: string;
  building: string;
  room_type: 'lecture' | 'laboratory' | 'online' | 'field';
  status: 'available' | 'not available';
  department_id: number | null;
  department: Department | null;
  createdAt?: string;
}

interface ApiRoom {
  id: number;
  room_code: string;
  building: string;
  room_type: 'lecture' | 'laboratory' | 'online' | 'field';
  status: 'available' | 'not available';
  department_id: number | null;
  department: Department | null;
  created_at: string;
  updated_at: string;
}

interface Schedule {
  id: number;
  term_id: number;
  section_id: number;
  course_id: number;
  faculty_id: number | null;
  room_id: number;
  department_id: number;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  start_time: string;
  end_time: string;
  mode: string;
  status: string;
  section?: {
    id: number;
    section_name: string;
  } | null;
  course?: {
    id: number;
    course_code: string;
    course_name: string;
  } | null;
  faculty?: {
    id: number;
    first_name: string;
    last_name: string;
    middle_name?: string | null;
  } | null;
}

interface RoomsPageData {
  rooms: Room[];
  departments: Department[];
  schedules?: Schedule[];
  activeTerm?: any;
}

const mapApiRoom = (r: ApiRoom): Room => ({
  id: r.id,
  room_code: r.room_code,
  building: r.building || '',
  room_type: r.room_type,
  status: r.status,
  department_id: r.department_id,
  department: r.department,
  createdAt: r.created_at
});

export default function VpaaRooms() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const roomsCacheKey = `page:rooms:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
  const cachedRoomsData = getCachedData<RoomsPageData>(roomsCacheKey);
  const [rooms, setRooms] = useState<Room[]>(cachedRoomsData?.rooms ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedRoomsData?.departments ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cachedRoomsData?.schedules ?? []);
  const [activeTerm, setActiveTerm] = useState<any | null>(cachedRoomsData?.activeTerm ?? null);
  const [isLoading, setIsLoading] = useState(!hasCachedData(roomsCacheKey));

  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const isDean = user?.role?.toLowerCase() === 'dean';
  const canManageRooms = isVpaa || isDean;

  const filteredRooms = useMemo(() => {
    if (isVpaa) return rooms;
    if (!user?.department_id) return [];
    return rooms.filter(r => r.department_id !== null && Number(r.department_id) === Number(user.department_id));
  }, [rooms, isVpaa, user?.department_id]);

  // Card view and schedule details states
  const [globalFilter, setGlobalFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [activeTabDay, setActiveTabDay] = useState<string>('Monday');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<number | null>(null);

  // Form state
  const [roomCode, setRoomCode] = useState('');
  const [building, setBuilding] = useState('');
  const [roomType, setRoomType] = useState<'lecture' | 'laboratory' | 'online' | 'field'>('lecture');
  const [status, setStatus] = useState<'available' | 'not available'>('available');
  const [departmentId, setDepartmentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Error states
  const [codeError, setCodeError] = useState('');
  const [buildingError, setBuildingError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (forceRefresh = false) => {
    setIsLoading(forceRefresh || !hasCachedData(roomsCacheKey));
    try {
      const data = await loadCachedData<RoomsPageData>(roomsCacheKey, async () => {
        const [initialDataRes] = await Promise.all([
          api.get<{ rooms: ApiRoom[]; departments: Department[]; schedules: Schedule[]; active_term: any }>('/initial-data')
        ]);
        return {
          rooms: initialDataRes.data.rooms.map(mapApiRoom),
          departments: initialDataRes.data.departments,
          schedules: initialDataRes.data.schedules,
          activeTerm: initialDataRes.data.active_term,
        };
      }, forceRefresh);
      setRooms(data.rooms);
      setDepartments(data.departments);
      setSchedules(data.schedules || []);
      setActiveTerm(data.activeTerm || null);
    } catch {
      toast.error('Error', 'Failed to load rooms and schedules data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    const trimmedCode = roomCode.trim();
    const trimmedBuilding = building.trim();

    if (!trimmedCode) {
      setCodeError('Room code is required');
      hasError = true;
    } else if (trimmedCode.length > 50) {
      setCodeError('Room code must not exceed 50 characters');
      hasError = true;
    } else {
      setCodeError('');
    }

    if (!trimmedBuilding) {
      setBuildingError('Building is required');
      hasError = true;
    } else {
      setBuildingError('');
    }

    if (hasError) return;

    setIsSubmitting(true);

    try {
      const payload = {
        room_code: trimmedCode,
        building: trimmedBuilding,
        room_type: roomType,
        status,
        department_id: isVpaa ? (departmentId ? parseInt(departmentId) : null) : (departmentId ? parseInt(departmentId) : (user?.department_id ? Number(user.department_id) : null))
      };

      if (isEditMode && editingId !== null) {
        const res = await api.put<{ room: ApiRoom }>(`/rooms/${editingId}`, payload);
        const updatedRoom = mapApiRoom(res.data.room);
        setRooms(prev => {
          const nextRooms = prev.map(r => r.id === editingId ? updatedRoom : r);
          clearDataCache();
          setCachedData<RoomsPageData>(roomsCacheKey, { rooms: nextRooms, departments, schedules, activeTerm });
          return nextRooms;
        });
        toast.success('Success', 'Room updated successfully');
      } else {
        const res = await api.post<{ room: ApiRoom }>('/rooms', payload);
        const createdRoom = mapApiRoom(res.data.room);
        setRooms(prev => {
          const nextRooms = [createdRoom, ...prev];
          clearDataCache();
          setCachedData<RoomsPageData>(roomsCacheKey, { rooms: nextRooms, departments, schedules, activeTerm });
          return nextRooms;
        });
        toast.success('Success', 'Room created successfully');
      }

      setRoomCode('');
      setBuilding('');
      setRoomType('lecture');
      setStatus('available');
      setDepartmentId(isVpaa ? '' : (user?.department_id?.toString() || ''));
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingId(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err?.response?.data?.message || 'Failed to save room';
      toast.error('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (room: Room) => {
    setRoomCode(room.room_code);
    setBuilding(room.building || '');
    setRoomType(room.room_type);
    setStatus(room.status);
    setDepartmentId(room.department_id ? room.department_id.toString() : '');
    setCodeError('');
    setBuildingError('');
    setEditingId(room.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = (id: number) => {
    setIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteRoom = async () => {
    if (idToDelete !== null) {
      try {
        await api.delete(`/rooms/${idToDelete}`);
        setRooms(prev => {
          const nextRooms = prev.filter(r => r.id !== idToDelete);
          clearDataCache();
          setCachedData<RoomsPageData>(roomsCacheKey, { rooms: nextRooms, departments, schedules, activeTerm });
          return nextRooms;
        });
        toast.success('Deleted', 'Room removed successfully');
      } catch {
        toast.error('Error', 'Failed to delete room');
      } finally {
        setIsDeleteModalOpen(false);
        setIdToDelete(null);
      }
    }
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let hour = parseInt(parts[0], 10);
    const minute = parts[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    hour = hour ? hour : 12;
    return `${hour}:${minute} ${ampm}`;
  };

  const getMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };

  const getRoomStatusToday = (roomId: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = days[new Date().getDay()];
    
    const todaySchedules = schedules.filter(s => s.room_id === roomId && s.day === todayName);
    
    if (todaySchedules.length === 0) {
      return { status: 'free-all-day', text: 'Free all day' };
    }
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const activeClass = todaySchedules.find(s => {
      const start = getMinutes(s.start_time);
      const end = getMinutes(s.end_time);
      return currentMinutes >= start && currentMinutes <= end;
    });
    
    if (activeClass) {
      const code = activeClass.course?.course_code || 'Class';
      const section = activeClass.section?.section_name || '';
      return { 
        status: 'occupied', 
        text: `Live: ${code} - ${section} (${formatTime(activeClass.start_time)} - ${formatTime(activeClass.end_time)})`,
        class: activeClass
      };
    }
    
    const upcomingClasses = todaySchedules
      .filter(s => getMinutes(s.start_time) > currentMinutes)
      .sort((a, b) => getMinutes(a.start_time) - getMinutes(b.start_time));
      
    if (upcomingClasses.length > 0) {
      const nextClass = upcomingClasses[0];
      const code = nextClass.course?.course_code || 'Class';
      return {
        status: 'upcoming',
        text: `Next: ${code} at ${formatTime(nextClass.start_time)}`,
        class: nextClass
      };
    }
    
    return { status: 'no-more-classes', text: 'No more classes today' };
  };

  const searchedRooms = useMemo(() => {
    let result = filteredRooms;

    if (globalFilter.trim()) {
      const query = globalFilter.toLowerCase();
      result = result.filter(r => 
        r.room_code.toLowerCase().includes(query) || 
        (r.building && r.building.toLowerCase().includes(query)) ||
        (r.room_type && r.room_type.toLowerCase().includes(query)) ||
        (r.department?.department_code && r.department.department_code.toLowerCase().includes(query)) ||
        (r.department?.department_name && r.department.department_name.toLowerCase().includes(query))
      );
    }

    if (departmentFilter) {
      result = result.filter(r => r.department_id !== null && Number(r.department_id) === Number(departmentFilter));
    }

    if (roomTypeFilter) {
      result = result.filter(r => r.room_type === roomTypeFilter);
    }

    return result;
  }, [filteredRooms, globalFilter, departmentFilter, roomTypeFilter]);

  const buildings = useMemo(() => {
    const map = new Map<string, Room[]>();
    searchedRooms.forEach(room => {
      const b = room.building || 'Other/Unassigned';
      if (!map.has(b)) {
        map.set(b, []);
      }
      map.get(b)!.push(room);
    });
    
    return Array.from(map.entries())
      .map(([name, roomsInBuilding]) => {
        const total = roomsInBuilding.length;
        const available = roomsInBuilding.filter(r => r.status === 'available').length;
        return {
          name,
          rooms: roomsInBuilding,
          totalCount: total,
          availableCount: available,
        };
      })
      .sort((a, b) => {
        if (a.name === 'Other/Unassigned') return 1;
        if (b.name === 'Other/Unassigned') return -1;
        return a.name.localeCompare(b.name);
      });
  }, [searchedRooms]);

  const roomsInSelectedBuilding = useMemo(() => {
    if (!selectedBuilding) return [];
    return searchedRooms
      .filter(r => (r.building || 'Other/Unassigned') === selectedBuilding)
      .sort((a, b) => a.room_code.localeCompare(b.room_code, undefined, { numeric: true, sensitivity: 'base' }));
  }, [searchedRooms, selectedBuilding]);

  const activeRoomSchedules = useMemo(() => {
    if (!selectedRoom) return [];
    return schedules
      .filter(s => s.room_id === selectedRoom.id && s.day === activeTabDay)
      .sort((a, b) => getMinutes(a.start_time) - getMinutes(b.start_time));
  }, [selectedRoom, schedules, activeTabDay]);

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between font-sans">
        {/* Search */}
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search rooms or buildings..."
            className="w-full pl-11 pr-4 py-2 border border-gray-200 rounded-lg outline-none text-xs focus:ring-1 focus:ring-[#C9952A] bg-gray-50/50 focus:bg-white transition-all font-sans"
          />
        </div>

        {/* Dropdowns & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Department Filter (Only for VPAA) */}
          {isVpaa && (
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-gray-400" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-2 py-1.5 border border-gray-250 rounded-lg outline-none text-[11px] bg-white text-gray-700 font-sans focus:ring-1 focus:ring-[#C9952A]"
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.department_code}</option>
                ))}
              </select>
            </div>
          )}

          {/* Room Type Filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <select
              value={roomTypeFilter}
              onChange={(e) => setRoomTypeFilter(e.target.value)}
              className="px-2 py-1.5 border border-gray-250 rounded-lg outline-none text-[11px] bg-white text-gray-700 font-sans focus:ring-1 focus:ring-[#C9952A]"
            >
              <option value="">All Types</option>
              <option value="lecture">Lecture</option>
              <option value="laboratory">Laboratory</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-[#4e0a10] shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-[#4e0a10] shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
              title="List View"
            >
              <List size={14} />
            </button>
          </div>

          {/* Add button inside filter bar */}
          {canManageRooms && (
            <button
              onClick={() => {
                setIsEditMode(false);
                setEditingId(null);
                setRoomCode('');
                setBuilding('');
                setRoomType('lecture');
                setStatus('available');
                setDepartmentId(isVpaa ? '' : (user?.department_id?.toString() || ''));
                setCodeError('');
                setBuildingError('');
                setIsModalOpen(true);
              }}
              className="bg-[#4e0a10] text-white px-4 py-1.5 rounded-lg hover:bg-[#C9952A] transition-all duration-200 flex items-center justify-center gap-1.5 font-semibold text-xs shadow-sm cursor-pointer ml-auto"
            >
              <Plus size={15} />
              <span>Add Room</span>
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-1.5 w-full rounded" />
              <div className="flex justify-between items-center">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : selectedBuilding === null ? (
        /* Buildings Selection View */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1A1410] font-sans uppercase tracking-wider text-gray-500">
              Buildings Overview ({buildings.length})
            </h2>
          </div>

          {buildings.length === 0 ? (
            <div className="py-16 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl bg-white font-sans">
              <p className="text-base font-semibold">No buildings found.</p>
              <p className="text-xs">Try adjusting your search criteria or add a room.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {buildings.map((building) => {
                const percent = Math.round((building.availableCount / building.totalCount) * 100);
                return (
                  <div
                    key={building.name}
                    onClick={() => setSelectedBuilding(building.name)}
                    className="bg-white border border-gray-100 hover:border-[#C9952A]/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col justify-between space-y-4 group font-sans"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-xl bg-[#4e0a10]/5 text-[#4e0a10] group-hover:bg-[#C9952A]/10 group-hover:text-[#C9952A] flex items-center justify-center transition-colors">
                        <Building2 size={24} />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider bg-gray-50 text-gray-500 border border-gray-150 px-2 py-0.5 rounded-full">
                        {building.totalCount} {building.totalCount === 1 ? 'room' : 'rooms'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-gray-800 font-sans group-hover:text-[#C9952A] transition-colors leading-tight">
                        {building.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1 font-semibold">
                        {building.availableCount} Available • {building.totalCount - building.availableCount} Unavailable
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        <span>Availability</span>
                        <span>{percent}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#4e0a10] rounded-full transition-all duration-500 group-hover:bg-[#C9952A]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Buildings List View */
            <div className="bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-sm font-sans">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/75 border-b border-gray-150">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Building Name</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Total Rooms</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Available Rooms</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Unavailable Rooms</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Availability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {buildings.map((building) => {
                      const percent = Math.round((building.availableCount / building.totalCount) * 100);
                      return (
                        <tr
                          key={building.name}
                          onClick={() => setSelectedBuilding(building.name)}
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#4e0a10]/5 text-[#4e0a10] flex items-center justify-center">
                                <Building2 size={16} />
                              </div>
                              <span className="text-sm font-bold text-gray-800 hover:text-[#C9952A] transition-colors">
                                {building.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-655 font-semibold">
                            {building.totalCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-emerald-600 font-semibold">
                            {building.availableCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-red-655 font-semibold">
                            {building.totalCount - building.availableCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3 max-w-xs">
                              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#4e0a10] rounded-full"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-gray-500">{percent}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Drilled-Down Rooms View */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedBuilding(null)}
                className="p-2 text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-855 font-sans">
                  {selectedBuilding} Rooms
                </h2>
                <p className="text-xs text-gray-400 font-sans font-semibold">
                  Viewing rooms in {selectedBuilding}
                </p>
              </div>
            </div>
            
            <span className="text-xs font-bold uppercase tracking-wider bg-[#4e0a10]/5 text-[#4e0a10] border border-[#4e0a10]/15 px-3 py-1 rounded-full w-max font-sans">
              {roomsInSelectedBuilding.length} {roomsInSelectedBuilding.length === 1 ? 'Room' : 'Rooms'} Total
            </span>
          </div>

          {roomsInSelectedBuilding.length === 0 ? (
            <div className="py-16 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl bg-white font-sans">
              <p className="text-base font-semibold">No rooms match your search in this building.</p>
              <p className="text-xs">Adjust search parameters or check another building.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roomsInSelectedBuilding.map((room) => {
                const liveStatus = getRoomStatusToday(room.id);
                
                let badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
                if (room.room_type === 'laboratory') {
                  badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
                } else if (room.room_type === 'online') {
                  badgeColor = 'bg-green-50 text-green-700 border-green-200';
                } else if (room.room_type === 'field') {
                  badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                }
                
                const statusBadgeColor = room.status === 'not available'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-green-50 text-green-700 border-green-200';

                return (
                  <div
                    key={room.id}
                    onClick={() => navigate(`/rooms/${room.id}`)}
                    className="bg-white border border-gray-150 hover:border-[#C9952A]/40 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group relative font-sans"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-sm font-mono font-bold text-gray-800 bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-lg uppercase border border-[#C9952A]/20">
                          {room.room_code}
                        </span>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-1.5 font-semibold">
                          {room.department ? `${room.department.department_code} Department` : 'General / All'}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                          {room.room_type}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusBadgeColor}`}>
                          {room.status}
                        </span>
                      </div>
                    </div>

                    {/* Today's Schedule Overview */}
                    <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 font-semibold mb-1">
                          <Clock size={12} />
                          <span>Today's Status</span>
                        </div>
                        {liveStatus.status === 'occupied' ? (
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <p className="text-xs font-bold text-emerald-600 truncate">
                              {liveStatus.text}
                            </p>
                          </div>
                        ) : liveStatus.status === 'upcoming' ? (
                          <p className="text-xs font-bold text-amber-600 truncate">
                            {liveStatus.text}
                          </p>
                        ) : (
                          <p className="text-xs font-bold text-gray-500 truncate">
                            {liveStatus.text}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions Corner (Only if canManageRooms) */}
                    {canManageRooms && (
                      <div className="flex justify-end gap-2 border-t border-gray-100 pt-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleEditClick(room)}
                          className="px-3 py-1.5 bg-white border border-gray-250 text-gray-700 hover:text-[#C9952A] hover:bg-gray-50 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer font-sans"
                        >
                          <Pencil size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => triggerDeleteConfirmation(room.id)}
                          className="px-3 py-1.5 bg-white border border-gray-250 text-red-600 hover:bg-red-50 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer font-sans"
                        >
                          <Trash2 size={13} />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Rooms List View */
            <div className="bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-sm font-sans">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/75 border-b border-gray-150">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Room Code</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Department</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Room Type</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Today's Status</th>
                      {canManageRooms && <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {roomsInSelectedBuilding.map((room) => {
                      const liveStatus = getRoomStatusToday(room.id);
                      
                      let badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
                      if (room.room_type === 'laboratory') {
                        badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
                      } else if (room.room_type === 'online') {
                        badgeColor = 'bg-green-50 text-green-700 border-green-200';
                      } else if (room.room_type === 'field') {
                        badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                      }
                      
                      const statusBadgeColor = room.status === 'not available'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-green-50 text-green-700 border-green-200';

                      return (
                        <tr
                          key={room.id}
                          onClick={() => navigate(`/rooms/${room.id}`)}
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-mono font-bold text-gray-800 bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-lg border border-[#C9952A]/20">
                              {room.room_code}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-655 font-semibold">
                            {room.department ? `${room.department.department_code}` : 'General / All'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                              {room.room_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusBadgeColor}`}>
                              {room.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {liveStatus.status === 'occupied' ? (
                              <div className="flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <p className="text-xs font-bold text-emerald-600 max-w-[200px] truncate">
                                  {liveStatus.text}
                                </p>
                              </div>
                            ) : liveStatus.status === 'upcoming' ? (
                              <p className="text-xs font-bold text-amber-600 max-w-[200px] truncate">
                                {liveStatus.text}
                              </p>
                            ) : (
                              <p className="text-xs font-bold text-gray-500 max-w-[200px] truncate">
                                {liveStatus.text}
                              </p>
                            )}
                          </td>
                          {canManageRooms && (
                            <td className="px-6 py-4 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => handleEditClick(room)}
                                  className="p-1 text-gray-500 hover:text-[#C9952A] transition-colors"
                                  title="Edit Room"
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  onClick={() => triggerDeleteConfirmation(room.id)}
                                  className="p-1 text-red-500 hover:text-red-700 transition-colors"
                                  title="Delete Room"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-bold text-[#1A1410] font-display">
                {isEditMode ? 'Edit Room' : 'Add New Room'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Room Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => {
                    setRoomCode(e.target.value.toUpperCase());
                    setCodeError('');
                  }}
                  placeholder="e.g. CCS-LAB1"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                    codeError
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {codeError && <p className="text-xs text-red-500 mt-1 font-semibold">{codeError}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Building <span className="text-red-500">*</span>
                </label>
                <select
                  value={building}
                  onChange={(e) => {
                    setBuilding(e.target.value);
                    setBuildingError('');
                  }}
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                    buildingError
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                >
                  <option value="">Select Building</option>
                  <option value="NEE Building">NEE Building</option>
                  <option value="Building 1">Building 1</option>
                  <option value="Building 2">Building 2</option>
                  <option value="Building 3">Building 3</option>
                  <option value="Building 4">Building 4</option>
                  <option value="Building 5">Building 5</option>
                  <option value="Building 6">Building 6</option>
                </select>
                {buildingError && <p className="text-xs text-red-500 mt-1 font-semibold">{buildingError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Room Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value as 'lecture' | 'laboratory' | 'online' | 'field')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  >
                    <option value="lecture">Lecture</option>
                    <option value="laboratory">Laboratory</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'available' | 'not available')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  >
                    <option value="available">Available</option>
                    <option value="not available">Not Available</option>
                  </select>
                </div>
              </div>

              {isVpaa ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Assigned Department
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                  >
                    <option value="">General / All Departments</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id.toString()}>
                        {dept.department_code} - {dept.department_name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Department
                  </label>
                  <input
                    type="text"
                    disabled
                    value={
                      departments.find(d => d.id === user?.department_id)
                        ? `${departments.find(d => d.id === user?.department_id)?.department_code} - ${departments.find(d => d.id === user?.department_id)?.department_name}`
                        : 'Your Department'
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-100 text-gray-500 text-sm outline-none cursor-not-allowed"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4e0a10] text-white rounded-xl hover:bg-[#C9952A] transition-colors disabled:opacity-50 text-sm font-semibold cursor-pointer"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {isSubmitting
                    ? (isEditMode ? 'Saving...' : 'Creating...')
                    : (isEditMode ? 'Save Changes' : 'Create Room')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-100">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-gray-800 font-display">Delete Room</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Are you sure you want to delete this room? This action is permanent and cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteRoom}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-xs font-semibold cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
