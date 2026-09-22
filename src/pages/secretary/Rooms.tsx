import { getPhilippineNowParts } from '../../lib/philippineTime';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BuildingsTable, RoomsTable } from '../../components/rooms/RoomListTables';
import { useLocation } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import ConfirmModal from '../../components/ui/ConfirmModal';
import SearchInput from '../../components/ui/SearchInput';
import {
  Pencil,
  Trash2,
  Search,
  X,
  Building2,
  ArrowLeft,
  Clock,
  LayoutGrid,
  List,
  Filter,
  Plus,
} from 'lucide-react';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import RoomDetailModal from '../../components/ui/RoomDetailModal';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';


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
  allow_lecture_usage: boolean;
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
  allow_lecture_usage?: boolean;
  status: 'available' | 'not available';
  department_id: number | null;
  department: Department | null;
  created_at: string;
  updated_at: string;
}

interface Schedule {
  id: number;
  semester_id: number;
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
    units?: number | string | null;
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
  activeSemester?: unknown;
}

const mapApiRoom = (r: ApiRoom): Room => ({
  id: r.id,
  room_code: r.room_code,
  building: r.building || '',
  room_type: r.room_type,
  allow_lecture_usage: !!r.allow_lecture_usage,
  status: r.status,
  department_id: r.department_id,
  department: r.department,
  createdAt: r.created_at
});

export default function SecretaryRooms() {
  const { toast } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const roomsCacheKey = `page:rooms:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
  const cachedRoomsData = getCachedData<RoomsPageData>(roomsCacheKey);
  const [rooms, setRooms] = useState<Room[]>(cachedRoomsData?.rooms ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedRoomsData?.departments ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cachedRoomsData?.schedules ?? []);
  const [activeSemester, setActiveSemester] = useState<unknown>(cachedRoomsData?.activeSemester ?? null);
  const [isLoading, setIsLoading] = useState(!hasCachedData(roomsCacheKey));
  const [selectedRoomIdForDetail, setSelectedRoomIdForDetail] = useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [printAfterOpen, setPrintAfterOpen] = useState(false);

  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const userDepartmentId = user?.department_id;
  const canManageRooms = isVpaa;

  const filteredRooms = useMemo(() => {
    if (isVpaa) return rooms;
    if (!userDepartmentId) return [];
    return rooms.filter(r => r.department_id !== null && Number(r.department_id) === Number(userDepartmentId));
  }, [rooms, isVpaa, userDepartmentId]);

  // Card view and schedule details states
  const [globalFilter, setGlobalFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const location = useLocation();
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(
    location.state?.selectedBuilding ?? null
  );

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
  const [allowLectureUsage, setAllowLectureUsage] = useState(false);
  const [status, setStatus] = useState<'available' | 'not available'>('available');
  const [departmentId, setDepartmentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Error states
  const [codeError, setCodeError] = useState('');
  const [buildingError, setBuildingError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await loadCachedData<RoomsPageData>(roomsCacheKey, async () => {
          const initialDataRes = await api.get<{ rooms?: ApiRoom[]; departments?: Department[]; schedules?: Schedule[]; active_semester?: unknown }>('/initial-data?include=rooms,departments,schedules');
          const rawRooms = Array.isArray(initialDataRes.data?.rooms) ? initialDataRes.data.rooms : [];
          const rawDepts = Array.isArray(initialDataRes.data?.departments) ? initialDataRes.data.departments : [];
          const rawSchedules = Array.isArray(initialDataRes.data?.schedules) ? initialDataRes.data.schedules : [];
          const activeSemester = initialDataRes.data?.active_semester || null;

          return {
            rooms: rawRooms.map(mapApiRoom),
            departments: rawDepts,
            schedules: rawSchedules,
            activeSemester: activeSemester,
          };
        });
        setRooms(data.rooms);
        setDepartments(data.departments);
        setSchedules(data.schedules || []);
        setActiveSemester(data.activeSemester || null);
      } catch {
        toast.error('Error', 'Failed to load rooms and schedules data.');
      } finally {
        setIsLoading(false);
      }
    };
    void fetchData();
  }, [roomsCacheKey, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    const trimmedBuilding = building.trim();
    
    let trimmedCode = roomCode.trim();
    if (!selectedBuilding && !isEditMode) {
      trimmedCode = trimmedBuilding ? `${trimmedBuilding.toUpperCase()}-101` : '';
    }

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
        room_type: (!selectedBuilding && !isEditMode) ? 'lecture' : roomType,
        allow_lecture_usage: (selectedBuilding || isEditMode) && roomType === 'laboratory' && allowLectureUsage,
        status,
        department_id: isVpaa ? (departmentId ? parseInt(departmentId) : null) : (departmentId ? parseInt(departmentId) : (user?.department_id ? Number(user.department_id) : null))
      };

      if (isEditMode && editingId !== null) {
        const res = await api.put<{ room: ApiRoom }>(`/rooms/${editingId}`, payload);
        const updatedRoom = mapApiRoom(res.data.room);
        setRooms(prev => {
          const nextRooms = prev.map(r => r.id === editingId ? updatedRoom : r);
          invalidateCacheGroups('rooms', 'schedules', 'dashboards');
          setCachedData<RoomsPageData>(roomsCacheKey, { rooms: nextRooms, departments, schedules, activeSemester });
          return nextRooms;
        });
        toast.success('Success', 'Room updated successfully');
      } else {
        const res = await api.post<{ room: ApiRoom }>('/rooms', payload);
        const createdRoom = mapApiRoom(res.data.room);
        setRooms(prev => {
          const nextRooms = [createdRoom, ...prev];
          invalidateCacheGroups('rooms', 'schedules', 'dashboards');
          setCachedData<RoomsPageData>(roomsCacheKey, { rooms: nextRooms, departments, schedules, activeSemester });
          return nextRooms;
        });
        toast.success('Success', 'Room created successfully');
      }

      setRoomCode('');
      setBuilding('');
      setRoomType('lecture');
      setAllowLectureUsage(false);
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
    setAllowLectureUsage(room.room_type === 'laboratory' && room.allow_lecture_usage);
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
          invalidateCacheGroups('rooms', 'schedules', 'dashboards');
          setCachedData<RoomsPageData>(roomsCacheKey, { rooms: nextRooms, departments, schedules, activeSemester });
          return nextRooms;
        });
        toast.success('Archived', 'Room archived successfully');
      } catch {
        toast.error('Error', 'Failed to archive room');
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
    const { weekdayIndex, hour, minute } = getPhilippineNowParts();
    const todayName = days[weekdayIndex];
    
    const todaySchedules = schedules.filter(s => s.room_id === roomId && s.day === todayName);
    
    if (todaySchedules.length === 0) {
      return { status: 'free-all-day', text: 'Free all day' };
    }
    
    const currentMinutes = hour * 60 + minute;
    
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


  const handlePrintRoom = (room: Room) => {
    setSelectedRoomIdForDetail(room.id);
    setPrintAfterOpen(true);
    setIsDetailModalOpen(true);
    document.body.classList.add('room-timetable-printing');
  };

  useEffect(() => {
    if (!isDetailModalOpen || !printAfterOpen) return;
    let attempts = 0;
    let frameId = 0;
    const printWhenReady = () => {
      const grid = document.querySelector('.room-timetable-modal .timetable-grid-root');
      if (grid || attempts >= 120) {
        document.body.classList.add('room-timetable-printing');
        window.print();
        return;
      }
      attempts += 1;
      frameId = window.requestAnimationFrame(printWhenReady);
    };
    frameId = window.requestAnimationFrame(printWhenReady);
    const afterPrint = () => {
      document.body.classList.remove('room-timetable-printing');
      setPrintAfterOpen(false);
      setIsDetailModalOpen(false);
      setSelectedRoomIdForDetail(null);
    };
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('afterprint', afterPrint);
      document.body.classList.remove('room-timetable-printing');
    };
  }, [isDetailModalOpen, printAfterOpen]);

  const roomGuideSteps = useMemo(() => [
    { element: '#rooms-filters select', action: 'select' as const, taskHint: 'Change a room filter to continue.', title: 'Find a room', description: 'Search by room or building. Use the type filter to narrow the list.', side: 'bottom' as const },
    { element: '[data-tour="building-card"]', waitFor: '#rooms-workspace', action: 'click' as const, skipIfMissing: true, taskHint: 'Click a building to see its rooms.', title: 'Check room details', description: 'Select a building to see rooms, capacity, status, and schedules.', side: 'top' as const },
    { element: '#rooms-add-button', action: 'click' as const, taskHint: 'Click Add to open the form.', title: 'Add a room or building', description: 'New spaces are created from this page.', side: 'bottom' as const },
    { element: '#room-form input[type="text"]:not([disabled])', waitFor: '#room-form', action: 'input' as const, taskHint: 'Type a name or code to continue.', title: 'Enter the details', description: 'Name the building, or code the room.', side: 'bottom' as const },
    { element: '#room-form select', waitFor: '#room-form', action: 'select' as const, taskHint: 'Choose an option to continue.', title: 'Set type and status', description: 'Room type and availability constrain every placement.', side: 'bottom' as const },
    { element: '#room-form', action: 'submit' as const, taskHint: 'Click Create to save it.', title: 'Save it', description: 'Submit the form to create it. Great work — that is the whole flow.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'rooms', isReady: true, steps: roomGuideSteps, mission: 'Manage Rooms' });

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div id="rooms-filters" className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between font-sans">
        {/* Search */}
        <SearchInput
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search rooms or buildings..."
        />

        {/* Dropdowns & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Department Filter (Only for VPAA) */}
          {isVpaa && (
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-gray-400" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
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
              className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
            >
              <option value="">All Types</option>
              <option value="lecture">Lecture</option>
              <option value="laboratory">Laboratory</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'grid' ? 'bg-[#5A1220] text-white shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                viewMode === 'list' ? 'bg-[#5A1220] text-white shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="List View"
            >
              <List size={15} />
            </button>
          </div>

          {/* Add button inside filter bar */}
          {canManageRooms && (
            <button
              id="rooms-add-button"
              onClick={() => {
                setIsEditMode(false);
                setEditingId(null);
                setRoomCode('');
                setBuilding(selectedBuilding || '');
                setRoomType('lecture');
                setAllowLectureUsage(false);
                setStatus('available');
                setDepartmentId(isVpaa ? '' : (user?.department_id?.toString() || ''));
                setCodeError('');
                setBuildingError('');
                setIsModalOpen(true);
              }}
              className="bg-[#5A1220] text-white px-5 py-2.5 rounded-full hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer ml-auto whitespace-nowrap"
            >
              <Plus size={15} />
              <span>{selectedBuilding ? 'Add Room' : 'Add Building'}</span>
            </button>
          )}
        </div>
      </div>

      <WorkflowGuideButton guideId="rooms" />
      <div id="rooms-workspace">
      {isLoading ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4 shadow-sm animate-pulse">
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
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden font-sans">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        )
      ) : selectedBuilding === null ? (
        /* Buildings Selection View */
        <div className="space-y-4">
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
                    data-tour="building-card"
                    onClick={() => setSelectedBuilding(building.name)}
                    className={`bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between space-y-4 group relative font-sans ${GRID_CARD_HOVER}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-xl bg-[#4e0a10]/5 text-[#4e0a10] flex items-center justify-center">
                        <Building2 size={24} />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider bg-gray-50 text-gray-500 border border-gray-150 px-2 py-0.5 rounded-full">
                        {building.totalCount} {building.totalCount === 1 ? 'room' : 'rooms'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-gray-800 font-sans leading-tight">
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
                          className="h-full bg-[#4e0a10] rounded-full transition-all duration-500"
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
            <BuildingsTable buildings={buildings} onSelect={(building) => setSelectedBuilding(building.name)} rowTourId="building-card" />
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
                
                return (
                  <div
                    key={room.id}
                    onClick={() => {
                      setSelectedRoomIdForDetail(room.id);
                      setIsDetailModalOpen(true);
                    }}
                    className={`bg-white border border-gray-150 rounded-2xl p-5 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between space-y-4 group relative font-sans ${GRID_CARD_HOVER}`}
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
                            <p className="text-xs font-bold text-emerald-600 truncate" title={liveStatus.text}>
                              {liveStatus.text}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs font-bold text-gray-500 truncate">
                            Vacant
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions Corner (Only if canManageRooms) */}
                    {canManageRooms && (
                      <div className="flex justify-end gap-2 border-t border-gray-100 pt-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleEditClick(room)}
                          className="flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                        >
                          <Pencil size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => triggerDeleteConfirmation(room.id)}
                          className="flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                        >
                          <Trash2 size={13} />
                          <span>Archive</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Rooms List View */
            <RoomsTable
              rooms={roomsInSelectedBuilding}
              getRoomStatusToday={getRoomStatusToday}
              canManage={canManageRooms}
              onOpen={(room) => {
                setSelectedRoomIdForDetail(room.id);
                setIsDetailModalOpen(true);
              }}
              onEdit={handleEditClick}
              onArchive={(room) => { void triggerDeleteConfirmation(room.id); }}
              onPrint={handlePrintRoom}
            />
          )}
        </div>
      )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex max-h-[calc(100dvh-2rem)] flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 flex shrink-0 justify-between items-center bg-[#4e0a10]">
              <h2 className="text-lg font-bold text-white font-display">
                {isEditMode
                  ? 'Edit Room Details'
                  : (selectedBuilding ? 'Add New Room' : 'Add New Building')}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <form id="room-form" onSubmit={handleSubmit} noValidate className="p-6 space-y-4 min-h-0 flex-1 overflow-y-auto">
              {!selectedBuilding && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Building Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={building}
                    onChange={(e) => {
                      setBuilding(e.target.value);
                      setBuildingError('');
                    }}
                    placeholder="e.g. NEE Building, Building 1"
                    className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 outline-none text-sm bg-white transition-all ${
                      buildingError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-200 focus:ring-[#C9952A]'
                    }`}
                  />
                  {buildingError && <p className="text-xs text-red-500 mt-1 font-semibold">{buildingError}</p>}
                </div>
              )}

              {(selectedBuilding || isEditMode) && (
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
              )}

              <div className="grid grid-cols-2 gap-4">
                {(selectedBuilding || isEditMode) && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                      Room Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={roomType}
                      onChange={(e) => {
                        const nextRoomType = e.target.value as 'lecture' | 'laboratory' | 'online' | 'field';
                        setRoomType(nextRoomType);
                        if (nextRoomType !== 'laboratory') {
                          setAllowLectureUsage(false);
                        }
                      }}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-sm bg-white"
                    >
                      <option value="lecture">Lecture</option>
                      <option value="laboratory">Laboratory</option>
                    </select>
                  </div>
                )}

                <div className={(selectedBuilding || isEditMode) ? "" : "col-span-2"}>
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

              {(selectedBuilding || isEditMode) && roomType === 'laboratory' && (
                <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allowLectureUsage}
                    onChange={(e) => setAllowLectureUsage(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#5A1220] focus:ring-[#C9952A]"
                  />
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-wider text-gray-600">Lecture fallback capable</span>
                    <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                      Allows major full-lecture courses to use this lab only when it is vacant.
                    </span>
                  </span>
                </label>
              )}

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
                  {isSubmitting && <LoadingSpinner size={16} className="animate-spin" />}
                  {isSubmitting
                    ? (isEditMode ? 'Saving...' : 'Creating...')
                    : (isEditMode ? 'Save Changes' : (selectedBuilding ? 'Create Room' : 'Create Building'))
                  }
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        eyebrow="Archive Record"
        title="Archive Room"
        message="This room will be hidden from active lists and can be restored by the VPAA from the Archive."
        confirmLabel="Archive"
        variant="danger"
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDeleteRoom}
      />

      {/* Classroom Detail Modal */}
      <RoomDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedRoomIdForDetail(null);
        }}
        roomId={selectedRoomIdForDetail}
        initialViewMode="grid"
        className="room-timetable-modal"
        initialRoom={rooms.find(room => room.id === selectedRoomIdForDetail) ?? null}
        initialSchedules={schedules}
      />
      <style>{`body.room-timetable-printing > div[role="presentation"] { visibility: hidden; }
      @page { size: landscape; margin: 0.35in; }
      @media print {
        body.room-timetable-printing #root { display: none !important; }
        body.room-timetable-printing > div[role="presentation"] { display: flex !important; position: static !important; inset: auto !important; overflow: visible !important; padding: 0 !important; background: white !important; visibility: visible !important; }
        body.room-timetable-printing > div[role="presentation"] > section.room-timetable-modal { display: flex !important; width: 100% !important; max-width: none !important; max-height: none !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }
        body.room-timetable-printing > div[role="presentation"] > section.room-timetable-modal > header { display: none !important; }
        body.room-timetable-printing .room-detail-print-info,
        body.room-timetable-printing .room-detail-print-toolbar { display: none !important; }
        body.room-timetable-printing .room-print-title { display: block !important; }
        body.room-timetable-printing .room-detail-print-grid { margin: 0 !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }
        body.room-timetable-printing .room-detail-print-grid > div:last-child { overflow: visible !important; padding: 0 !important; }
        body.room-timetable-printing .timetable-grid-root { width: 100% !important; min-height: 0 !important; border: 1px solid #cbd5e1 !important; box-shadow: none !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body.room-timetable-printing .timetable-grid-root,
        body.room-timetable-printing .timetable-grid-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body.room-timetable-printing .timetable-grid-root > div:last-child { border-left: 1px solid #cbd5e1 !important; border-bottom: 1px solid #cbd5e1 !important; }
        body.room-timetable-printing .timetable-grid-root [style*="grid-column: 1"] { border-left: 1px solid #cbd5e1 !important; border-right: 1px solid #cbd5e1 !important; }
        body.room-timetable-printing .timetable-grid-root { border: 1px solid #cbd5e1 !important; border-left: 1px solid #cbd5e1 !important; min-width: 0 !important; width: 100% !important; }
        body.room-timetable-printing .timetable-grid-header { background: #4e0a10 !important; background-color: #4e0a10 !important; background-image: none !important; box-shadow: inset 0 0 0 1000px #4e0a10 !important; color: #ffffff !important; border-color: #c9952a !important; }
        body.room-timetable-printing .timetable-grid-root > [style*="grid-column: 1"] { border-left: 1px solid #cbd5e1 !important; }
      }
      `}</style>
    </div>
  );
};
import LoadingSpinner from "../../components/ui/LoadingSpinner";
