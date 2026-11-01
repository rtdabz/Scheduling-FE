import { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import { getCachedData } from '../../lib/dataCache';
import { getStoredUser } from '../../lib/storedUser';
import RoomDetailContent from './RoomDetailContent';
import type { LinkedSlot } from '../../lib/notificationLink';
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
  allow_lecture_usage?: boolean;
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
  initialSchedulesComplete?: boolean;
  highlightSlots?: LinkedSlot[];
}

const EMPTY_SCHEDULES: Schedule[] = [];

const fetchRoomSchedules = (roomId: number) => api.get<Schedule[]>('/schedules', {
  params: { room_id: roomId, semester_id: 'active', per_page: 1000 },
});

export default function RoomDetailModal({ isOpen, onClose, roomId, initialViewMode = 'list', className = '', initialRoom = null, initialSchedules = EMPTY_SCHEDULES, initialSchedulesComplete = true, highlightSlots }: RoomDetailModalProps) {
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

    if (initialRoom && initialRoom.id === roomId && initialSchedulesComplete) {
      setRoom(initialRoom);
      setSchedules(initialSchedules);
      setIsLoading(false);
      return;
    }

    let active = true;
    const user = getStoredUser();
    const roomsCacheKey = `page:rooms:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
    const cachedRoomsData = getCachedData<{ rooms?: Room[]; schedules?: Schedule[] }>(roomsCacheKey);

    let cachedRoom: Room | undefined;
    let cachedSchedules: Schedule[] = [];

    if (cachedRoomsData) {
      cachedRoom = cachedRoomsData.rooms?.find((r) => r.id === roomId);
      cachedSchedules = cachedRoomsData.schedules || [];
    }

    if (cachedRoom && initialSchedulesComplete) {
      setRoom(cachedRoom);
      setSchedules(cachedSchedules);
      setIsLoading(false);

      const fetchRoomBackground = async () => {
        try {
          const [roomRes, schedulesRes] = await Promise.all([
            api.get<Room>(`/rooms/${roomId}`),
            fetchRoomSchedules(roomId),
          ]);
          if (!active) return;
          setRoom(roomRes.data);
          setSchedules(schedulesRes.data);
        } catch {
        }
      };
      void fetchRoomBackground();
      return () => { active = false; };
    }

    const fetchRoom = async () => {
      setIsLoading(true);
      setRoom(initialRoom && initialRoom.id === roomId ? initialRoom : null);
      try {
        const [roomRes, schedulesRes] = await Promise.all([
          api.get<Room>(`/rooms/${roomId}`),
          fetchRoomSchedules(roomId),
        ]);
        if (!active) return;
        setRoom(roomRes.data);
        setSchedules(schedulesRes.data);
      } catch {
        if (active) onCloseRef.current();
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void fetchRoom();
    return () => { active = false; };
  }, [roomId, isOpen, initialRoom, initialSchedules, initialSchedulesComplete]);

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
        <RoomDetailContent room={room} schedules={schedules} isLoading={isLoading} initialViewMode={initialViewMode} highlightSlots={highlightSlots} />
      </div>
    </Modal>
  );
}
