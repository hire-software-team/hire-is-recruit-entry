import { Injectable } from '@nestjs/common'
import { getSupabaseClient } from '../storage/database/supabase-client'
import { Employee, EmployeeFile } from './hr.types'
import { LLMClient, Config } from 'coze-coding-dev-sdk'

interface CreateEmployeeDto {
  name: string
  phone: string
  education: string
  join_date: string
}

interface VerifyResult {
  verified: boolean
  documentTypeMatch: boolean
  isClear: boolean
  reason: string
}

// 证件类型描述映射（用于 AI 校验）
// key = fileType，value = { label, description }
// 其中 diploma 和 degree 需要根据 education 动态调整描述
const DOCUMENT_TYPE_PROMPTS: Record<string, { label: string; description: string }> = {
  id_card_front: {
    label: '身份证正面（人像面）',
    description: '中国居民身份证人像面，包含姓名、性别、民族、出生日期、住址、公民身份号码等信息，右上角有国徽',
  },
  id_card_back: {
    label: '身份证背面（国徽面）',
    description: '中国居民身份证国徽面，包含签发机关和有效期限，上方有国徽图案',
  },
  resignation_proof: {
    label: '离职证明',
    description: '离职证明或解除劳动关系证明，包含员工姓名、入职/离职日期、原单位名称、公章等',
  },
}

// 学历学位证书的 Prompt 根据 education 动态生成
function getEduCertPrompt(fileType: string, education: string): { label: string; description: string } | null {
  const eduLabelMap: Record<string, string> = {
    below_bachelor: '大专/职高/高中',
    bachelor: '本科',
    master: '硕士',
    doctor: '博士',
  }

  switch (fileType) {
    case 'diploma':
      if (education === 'below_bachelor') {
        return {
          label: '学历证书',
          description: '中国学历证书（毕业证书），包含姓名、学历层次（如大专、职高、高中、中专等）、专业、学校名称、颁发日期等。注意：不要求是本科学历，接受大专、职高、高中、中专等各种层次的学历证书',
        }
      }
      return {
        label: '本科学历证书',
        description: '中国本科学历证书（毕业证书），包含姓名、学历层次为本科、专业、学校名称、颁发日期等',
      }
    case 'degree':
      return {
        label: '本科学位证书',
        description: '中国学士学位证书，包含姓名、学位名称为学士、颁发院校、颁发日期、证书编号等',
      }
    case 'master_diploma':
      return {
        label: '硕士学历证书',
        description: '中国硕士研究生学历证书（毕业证书），包含姓名、学历层次为硕士/研究生、专业、学校名称、颁发日期等',
      }
    case 'master_degree':
      return {
        label: '硕士学位证书',
        description: '中国硕士学位证书，包含姓名、学位名称为硕士、颁发院校、颁发日期、证书编号等',
      }
    case 'doctor_diploma':
      return {
        label: '博士学历证书',
        description: '中国博士研究生学历证书（毕业证书），包含姓名、学历层次为博士/研究生、专业、学校名称、颁发日期等',
      }
    case 'doctor_degree':
      return {
        label: '博士学位证书',
        description: '中国博士学位证书，包含姓名、学位名称为博士、颁发院校、颁发日期、证书编号等',
      }
    default:
      return null
  }
}

// 不需要校验的文件类型
const SKIP_VERIFICATION_TYPES = ['medical_report']

@Injectable()
export class HrService {
  private supabase = getSupabaseClient()
  private llmClient: LLMClient

  constructor() {
    const config = new Config()
    this.llmClient = new LLMClient(config)
  }

  /**
   * 创建员工记录
   */
  async createEmployee(dto: CreateEmployeeDto): Promise<Employee> {
    const { data, error } = await this.supabase
      .from('employees')
      .insert({
        name: dto.name,
        phone: dto.phone,
        education: dto.education,
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

  /**
   * 校验证件图片是否合规
   * @param imageUrl 图片公开访问 URL
   * @param fileType 文件类型标识
   * @param education 学历（用于动态调整学历学位证书的校验 Prompt）
   * @returns 校验结果
   */
  async verifyDocumentImage(imageUrl: string, fileType: string, education?: string): Promise<VerifyResult | null> {
    // 体检报告跳过校验
    if (SKIP_VERIFICATION_TYPES.includes(fileType)) {
      return null
    }

    // 获取校验 Prompt
    let docInfo = DOCUMENT_TYPE_PROMPTS[fileType]

    // 学历学位证书类型：根据 education 动态获取
    if (!docInfo) {
      if (education) {
        const eduPrompt = getEduCertPrompt(fileType, education)
        if (eduPrompt) {
          docInfo = eduPrompt
        }
      }
    }

    if (!docInfo) {
      // 未知类型跳过校验
      return null
    }

    const systemPrompt = `你是一个专业的证件图像审核助手。你需要判断用户上传的图片是否符合指定的证件类型要求，以及图像是否清晰可辨。

目标证件类型：${docInfo.label}
证件特征描述：${docInfo.description}

请严格按照以下JSON格式输出，不要输出任何其他内容：
{"passed":true或false,"documentTypeMatch":true或false,"isClear":true或false,"reason":"不通过的具体原因，通过时为空字符串"}

判断规则：
1. documentTypeMatch：图片内容是否与目标证件类型匹配。如果图片是其他类型的证件、或者不是证件，则为false。
2. isClear：图像是否清晰可辨。如果图像严重模糊、过度遮挡、严重反光、过暗无法辨认，则为false。
3. passed = documentTypeMatch && isClear
4. reason：不通过时给出具体原因，例如"图片内容不是身份证正面"或"图像模糊不清，请重新拍摄"。通过时为空字符串。`

    try {
      console.log('开始校验证件图片:', { fileType, education, imageUrl: imageUrl.substring(0, 100) })

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: '请审核这张图片是否符合要求' },
            {
              type: 'image_url' as const,
              image_url: { url: imageUrl, detail: 'low' as const },
            },
          ],
        },
      ]

      const response = await this.llmClient.invoke(messages, {
        model: 'doubao-seed-2-0-mini-260215',
        temperature: 0.1,
        thinking: 'disabled',
      })

      console.log('大模型校验原始返回:', response.content)

      const content = response.content.trim()
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.error('无法从模型返回中提取 JSON:', content)
        return null
      }

      const result = JSON.parse(jsonMatch[0])

      const verifyResult: VerifyResult = {
        verified: Boolean(result.passed),
        documentTypeMatch: Boolean(result.documentTypeMatch),
        isClear: Boolean(result.isClear),
        reason: String(result.reason || ''),
      }

      console.log('证件校验结果:', verifyResult)
      return verifyResult
    } catch (error) {
      console.error('证件校验调用大模型失败:', error)
      return null
    }
  }
}
