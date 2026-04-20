import { Injectable } from '@nestjs/common'
import { getSupabaseClient } from '../storage/database/supabase-client'
import { Employee, EmployeeFile } from './hr.types'

interface CreateEmployeeDto {
  name: string
  phone: string
  join_date: string
}

@Injectable()
export class HrService {
  private supabase = getSupabaseClient()

  /**
   * 创建员工记录
   */
  async createEmployee(dto: CreateEmployeeDto): Promise<Employee> {
    const { data, error } = await this.supabase
      .from('employees')
      .insert({
        name: dto.name,
        phone: dto.phone,
        join_date: dto.join_date,
        status: 'submitted',
      })
      .select()
      .single()

    if (error) {
      console.error('创建员工失败:', error)
      throw new Error(`创建员工失败: ${error.message}`)
    }

    return data as Employee
  }

  /**
   * 创建员工文件记录
   */
  async createEmployeeFile(employeeId: number, fileData: {
    file_type: string
    file_key: string
    file_name: string
    file_size: number
    file_type_ext: string
  }): Promise<EmployeeFile> {
    const { data, error } = await this.supabase
      .from('employee_files')
      .insert({
        employee_id: employeeId,
        file_type: fileData.file_type,
        file_key: fileData.file_key,
        file_name: fileData.file_name,
        file_size: fileData.file_size,
        file_type_ext: fileData.file_type_ext,
      })
      .select()
      .single()

    if (error) {
      console.error('创建员工文件失败:', error)
      throw new Error(`创建员工文件失败: ${error.message}`)
    }

    return data as EmployeeFile
  }

  /**
   * 通过手机号查找员工
   */
  async lookupByPhone(phone: string): Promise<{ employee: Employee; files: EmployeeFile[] } | null> {
    const { data: employees, error: empError } = await this.supabase
      .from('employees')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)

    if (empError || !employees || employees.length === 0) {
      return null
    }

    const employee = employees[0] as Employee

    const { data: files, error: fileError } = await this.supabase
      .from('employee_files')
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: true })

    if (fileError) {
      console.error('查找员工文件失败:', fileError)
      return { employee, files: [] }
    }

    return {
      employee,
      files: (files as EmployeeFile[]) || [],
    }
  }

  /**
   * 获取员工列表
   */
  async getEmployeeList(filters?: {
    name?: string
    phone?: string
    status?: string
  }): Promise<{ employees: Employee[]; total: number }> {
    let query = this.supabase
      .from('employees')
      .select('*', { count: 'exact' })

    if (filters?.name) {
      query = query.ilike('name', `%${filters.name}%`)
    }
    if (filters?.phone) {
      query = query.eq('phone', filters.phone)
    }
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error, count } = await query

    if (error) {
      console.error('获取员工列表失败:', error)
      throw new Error(`获取员工列表失败: ${error.message}`)
    }

    return {
      employees: (data as Employee[]) || [],
      total: count || 0,
    }
  }

  /**
   * 获取员工详情
   */
  async getEmployeeDetail(id: number): Promise<{ employee: Employee; files: EmployeeFile[] }> {
    const { data: employee, error: empError } = await this.supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .single()

    if (empError) {
      console.error('获取员工详情失败:', empError)
      throw new Error(`获取员工详情失败: ${empError.message}`)
    }

    const { data: files, error: fileError } = await this.supabase
      .from('employee_files')
      .select('*')
      .eq('employee_id', id)
      .order('created_at', { ascending: true })

    if (fileError) {
      console.error('获取员工文件失败:', fileError)
      throw new Error(`获取员工文件失败: ${fileError.message}`)
    }

    return {
      employee: employee as Employee,
      files: (files as EmployeeFile[]) || [],
    }
  }

  /**
   * 验证管理员
   */
  async validateAdmin(username: string, password: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('admin_users')
      .select('*')
      .eq('username', username)
      .maybeSingle()

    if (error) {
      console.error('验证管理员失败:', error)
      return false
    }

    if (!data) {
      return false
    }

    return data.password === password
  }
}
