// 共享类型定义
export interface Employee {
  id: number
  name: string
  phone: string
  education: string | null
  join_date: string | null
  hr_contact: string | null
  status: string
  viewing_count: number
  lock_source: string | null
  locked_by: number | null
  locked_at: string | null
  created_at: string
}

export interface EmployeeFile {
  id: number
  employee_id: number
  file_type: string
  file_key: string
  file_name: string
  file_size: number
  file_type_ext: string
  verification_override: boolean
  created_at: string
  url?: string
  signed_url?: string
}
