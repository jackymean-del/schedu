/**
 * useTerminology() — Spec Rule 5 (Non-negotiable)
 * 
 * React components must NEVER hardcode "Teacher", "Class", or "Period".
 * All domain labels must come from this hook.
 */
import { useTimetableStore } from '@/store/timetableStore'
import type { OrgType } from '@/types'

export interface TerminologyMap {
  organization: string
  group: string           // Class / Team / Ward
  groups: string
  participant: string     // Teacher / Employee / Doctor
  participants: string
  resource: string        // Subject / Task / Procedure
  resources: string
  session: string         // Period / Shift / Duty Slot
  sessions: string
  facility: string        // Classroom / Workspace / Ward
  facilities: string
  schedule: string        // Timetable / Schedule / Duty Roster
  classTeacher: string    // Class Teacher / Team Lead / Ward Doctor
  pool: string            // Teacher Pool / Employee Group
  pools: string
  room: string            // Room / Workspace / Bay
  rooms: string
  grade: string           // Grade / Level / Tier
  section: string         // Section / Division / Unit
}

const TERMINOLOGY: Record<OrgType, TerminologyMap> = {
  school: {
    organization: 'School',
    group: 'Class', groups: 'Classes',
    participant: 'Teacher', participants: 'Teachers',
    resource: 'Subject', resources: 'Subjects',
    session: 'Period', sessions: 'Periods',
    facility: 'Classroom', facilities: 'Classrooms',
    schedule: 'Schedule',
    classTeacher: 'Class Teacher',
    pool: 'Teacher Pool', pools: 'Teacher Pools',
    room: 'Venue', rooms: 'Venues',
    grade: 'Grade', section: 'Section',
  },
  college: {
    organization: 'College',
    group: 'Batch', groups: 'Batches',
    participant: 'Lecturer', participants: 'Lecturers',
    resource: 'Course', resources: 'Courses',
    session: 'Lecture', sessions: 'Lectures',
    facility: 'Hall', facilities: 'Halls',
    schedule: 'Timetable',
    classTeacher: 'Batch Coordinator',
    pool: 'Faculty Pool', pools: 'Faculty Pools',
    room: 'Hall No.', rooms: 'Halls',
    grade: 'Year', section: 'Batch',
  },
  corporate: {
    organization: 'Company',
    group: 'Team', groups: 'Teams',
    participant: 'Employee', participants: 'Employees',
    resource: 'Task', resources: 'Tasks',
    session: 'Slot', sessions: 'Slots',
    facility: 'Workspace', facilities: 'Workspaces',
    schedule: 'Schedule',
    classTeacher: 'Team Lead',
    pool: 'Employee Group', pools: 'Employee Groups',
    room: 'Meeting Room', rooms: 'Meeting Rooms',
    grade: 'Department', section: 'Division',
  },
  hospital: {
    organization: 'Hospital',
    group: 'Ward', groups: 'Wards',
    participant: 'Doctor', participants: 'Clinical Staff',
    resource: 'Procedure', resources: 'Procedures',
    session: 'Duty Slot', sessions: 'Duty Slots',
    facility: 'Ward', facilities: 'Wards',
    schedule: 'Duty Roster',
    classTeacher: 'Ward Doctor',
    pool: 'Staff Pool', pools: 'Staff Pools',
    room: 'Bay No.', rooms: 'Bays',
    grade: 'Department', section: 'Unit',
  },
  ngo: {
    organization: 'NGO',
    group: 'Project', groups: 'Projects',
    participant: 'Volunteer', participants: 'Volunteers',
    resource: 'Activity', resources: 'Activities',
    session: 'Session', sessions: 'Sessions',
    facility: 'Venue', facilities: 'Venues',
    schedule: 'Activity Schedule',
    classTeacher: 'Project Lead',
    pool: 'Volunteer Group', pools: 'Volunteer Groups',
    room: 'Venue', rooms: 'Venues',
    grade: 'Program', section: 'Team',
  },
  factory: {
    organization: 'Factory',
    group: 'Line', groups: 'Lines',
    participant: 'Worker', participants: 'Workers',
    resource: 'Task', resources: 'Tasks',
    session: 'Slot', sessions: 'Slots',
    facility: 'Station', facilities: 'Stations',
    schedule: 'Shift Schedule',
    classTeacher: 'Supervisor',
    pool: 'Worker Pool', pools: 'Worker Pools',
    room: 'Bay', rooms: 'Bays',
    grade: 'Line', section: 'Station',
  },
}

export function useTerminology(): TerminologyMap {
  const orgType = useTimetableStore(s => s.config.orgType)
  return TERMINOLOGY[orgType ?? 'school']
}

// Non-hook version for use outside React components
export function getTerminology(orgType: OrgType | null): TerminologyMap {
  return TERMINOLOGY[orgType ?? 'school']
}
