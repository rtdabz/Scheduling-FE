import React, { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import { getCachedData } from '../../lib/dataCache';
import RoomDetailContent from './RoomDetailContent';
import Modal from './Modal';

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
  } | null;
  faculty?: {
    id: number;
    first_name: string;
    last_name: string;
    middle_name?: string | null;
  } | null;
}

interface RoomDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: number | null;
  initialViewMode?: 'list' | 'grid';
  className?: string;
  initialRoom?: Room | null;
  initialSchedules?: Schedule[];
}

export default function RoomDetailModal({ isOpen, onClose, roomId, initialViewMode = 'list', className = '', initialRoom = null, initialSchedules = [] }: RoomDetailModalProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !roomId) {
      setRoom(null);
      setSchedules([]);
      setIsLoading(true);
      return;
    }

    // The Rooms page already has the room and timetable payload. Seed the
    // detail view synchronously so printing never captures an async skeleton,
    // including for rooms whose schedule list is empty.
    // The page owns and live-refreshes that payload, so refetching here only
    // swapped the cards a second time once the request came back.
    if (initialRoom && initialRoom.id === roomId) {
      setRoom(initialRoom);
      setSchedules(initialSchedules);
      setIsLoading(false);
      return;
    }

    const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const roomsCacheKey = `page:rooms:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
    const cachedRoomsData = getCachedData<any>(roomsCacheKey);

    let cachedRoom: Room | undefined;
    let cachedSchedules: Schedule[] = [];

    if (cachedRoomsData) {
      cachedRoom = cachedRoomsData.rooms.find((r: any) => r.id === roomId);
      cachedSchedules = cachedRoomsData.schedules || [];
    }

    if (cachedRoom) {
      setRoom(cachedRoom);
      setSchedules(cachedSchedules);
      setIsLoading(false);

      const fetchRoomBackground = async () => {
        try {
          const [roomRes, initialRes] = await Promise.all([
            api.get<Room>(`/rooms/${roomId}`),
            api.get<{ schedules: Schedule[] }>('/initial-data?include=schedules'),
          ]);
          setRoom(roomRes.data);
          setSchedules(initialRes.data.schedules);
        } catch {
          // Ignore background fetch errors
        }
      };
      fetchRoomBackground();
      return;
    }

    const fetchRoom = async () => {
      setIsLoading(!initialRoom || initialRoom.id !== roomId);
      if (!initialRoom || initialRoom.id !== roomId) setRoom(null);
      try {
        const [roomRes, initialRes] = await Promise.all([
          api.get<Room>(`/rooms/${roomId}`),
          api.get<{ schedules: Schedule[] }>('/initial-data?include=schedules'),
        ]);
        setRoom(roomRes.data);
        setSchedules(initialRes.data.schedules);
      } catch {
        onCloseRef.current();
      } finally {
        setIsLoading(false);
      }
    };
    fetchRoom();
  }, [roomId, isOpen, initialRoom, initialSchedules]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Classroom Details"
      description="Weekly schedule and room information"
      size="xl"
      className={`max-h-[95vh] ${className}`}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
        <RoomDetailContent room={room} schedules={schedules} isLoading={isLoading} initialViewMode={initialViewMode} />
      </div>
    </Modal>
  );
}
