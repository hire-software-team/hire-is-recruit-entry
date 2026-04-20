// 共享类型定义
export interface Employee {
  id: number
  name: string
  phone: string
  status: string
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
  created_at: string
}
