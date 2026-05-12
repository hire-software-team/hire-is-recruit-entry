import * as crypto from 'crypto'
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { getSupabaseClient } from '../storage/database/supabase-client'
import { Employee, EmployeeFile } from './hr.types'
import { LLMClient, Config } from 'coze-coding-dev-sdk'
import { StorageService } from '../storage/storage.service'
import { maskPhone, maskSensitive } from './hr.utils'
import * as bcrypt from 'bcryptjs'
import { jwtConstants } from './hr-auth.constants'

interface CreateEmployeeDto {
  name: string
  phone: string
  education: string
  join_date: string
  hr_contact: string
}

interface VerifyResult {
  verified: boolean
  documentTypeMatch: boolean
  isComplete: boolean
  isTextLegible: boolean
  isClear: boolean
  reason: string
}

// 证件类型描述映射（用于 AI 校验）
// key = fileType，value = { label, description }
// 其中 diploma 和 degree 需要根据 education 动态调整描述
const DOCUMENT_TYPE_PROMPTS: Record<string, { label: string; description: string }> = {
  photo: {
    label: '个人照片',
    description: '这是一张个人照片的校验。请宽松检查以下要点：1. 必须是人物照片，照片中有人物面部 2. 前景主体必须是一个人物，不能是多人合照 3. 在不遮挡主体的情况下，背景可以有路人 4. 主体的面部特征清晰可辨认，能看清五官 5. 允许日常照片（非证件照也可以），允许戴眼镜，但不能戴墨镜、帽子等遮挡面部的配饰 6. 允许有背景和文字，不要求纯色背景 7. 照片中面部占画面比例合理，不能过小导致无法辨认 如果面部清晰可辨认，请判定为通过。',
  },
  id_card_front: {
    label: '身份证正面（人像面）',
    description: '中国居民身份证人像面，右侧有持证人照片，左侧包含姓名、性别、民族、出生日期、住址、公民身份号码等信息，正面没有国徽',
  },
  id_card_back: {
    label: '身份证背面（国徽面）',
    description: '中国居民身份证国徽面，上方有国徽图案，下方包含签发机关和有效期限',
  },
  resignation_proof: {
    label: '离职证明',
    description: '离职证明或解除劳动关系证明，包含员工姓名、入职/离职日期、原单位名称、公章等',
  },
  bank_card_front: {
    label: '银行卡正面',
    description: '银行卡正面照，包含银行卡号、持卡人姓名拼音、卡组织标识（如银联/VISA/Mastercard）、发卡银行名称或logo等信息',
  },
  bank_card_back: {
    label: '银行卡反面',
    description: '银行卡反面照，包含磁条或芯片区域、签名栏、客服电话、安全码区域等信息',
  },
}

// 学历学位证书的 Prompt 根据 education 动态生成
function getEduCertPrompt(fileType: string, education: string): { label: string; description: string } | null {
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

  // 上传会话跟踪：记录 fileKey 与 uploadToken 的绑定关系，防止跨会话伪造
  // key = fileKey, value = { uploadToken, uploadedAt }
  private uploadSessions: Map<string, { uploadToken: string; uploadedAt: number }> = new Map()

  constructor(
    private readonly storageService: StorageService,
    private readonly jwtService: JwtService,
  ) {
    const config = new Config()
    this.llmClient = new LLMClient(config)

    // 每小时清理过期的上传会话记录（超过2小时的）
    setInterval(() => {
      const now = Date.now()
      for (const [key, value] of this.uploadSessions) {
        if (now - value.uploadedAt > 2 * 60 * 60 * 1000) {
          this.uploadSessions.delete(key)
        }
      }
    }, 60 * 60 * 1000)
  }

  /**
   * 注册上传会话：生成随机 token 与 fileKey 绑定
   * 返回 uploadToken，提交时需要携带此 token
   */
  registerUploadSession(fileKey: string): string {
    const uploadToken = crypto.randomBytes(16).toString('hex')
    this.uploadSessions.set(fileKey, { uploadToken, uploadedAt: Date.now() })
    return uploadToken
  }

  /**
   * 验证 fileKey 与 uploadToken 的绑定关系（非破坏性，允许提交失败后重试）
   */
  validateUploadSession(fileKey: string, uploadToken: string): boolean {
    const session = this.uploadSessions.get(fileKey)
    if (!session) return false
    if (session.uploadToken !== uploadToken) return false
    return true
  }

  /**
   * 删除上传会话记录
   */
  removeUploadSession(fileKey: string): void {
    this.uploadSessions.delete(fileKey)
  }

  /**
   * 创建或更新员工记录
   * 如果手机号已存在且未锁定，则更新；如果已锁定，则拒绝
   */
  async createEmployee(dto: CreateEmployeeDto): Promise<Employee> {
    // 先检查手机号是否已存在
    const existing = await this.lookupByPhone(dto.phone)

    if (existing) {
      // 已锁定，不允许修改
      if (existing.employee.status === 'locked') {
        throw new Error('资料已被锁定，无法修改')
      }
      // 未锁定，执行更新
      const { data, error } = await this.supabase
        .from('employees')
        .update({
          name: dto.name,
          education: dto.education,
          join_date: dto.join_date,
          hr_contact: dto.hr_contact,
          status: 'submitted',
        })
        .eq('id', existing.employee.id)
        .select()
        .single()

      if (error) {
        console.error('更新员工失败:', error)
        throw new Error(`更新员工失败: ${error.message}`)
      }

      return data as Employee
    }

    // 新建员工记录
    const { data, error } = await this.supabase
      .from('employees')
      .insert({
        name: dto.name,
        phone: dto.phone,
        education: dto.education,
        join_date: dto.join_date,
        hr_contact: dto.hr_contact,
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
   * 替换员工文件：先删除旧文件（Storage + 数据库），再插入新文件
   */
  async replaceEmployeeFiles(employeeId: number, newFiles: Array<{
    file_type: string
    file_key: string
    file_name: string
    file_size: number
    file_type_ext: string
    verification_override?: boolean
  }>): Promise<EmployeeFile[]> {
    // 1. 获取旧文件列表
    const { data: oldFiles } = await this.supabase
      .from('employee_files')
      .select('file_key')
      .eq('employee_id', employeeId)

    // 2. 只删除不再使用的旧文件的 Storage 对象（保留仍在新列表中的文件）
    const newFileKeys = new Set(newFiles.map(f => f.file_key))
    if (oldFiles && oldFiles.length > 0) {
      for (const file of oldFiles) {
        if (!newFileKeys.has(file.file_key)) {
          try {
            await this.storageService.deleteFile(file.file_key)
          } catch (e) {
            console.error('删除旧文件失败:', maskSensitive(file.file_key), e)
          }
        }
      }
    }

    // 3. 删除旧文件的数据库记录
    await this.supabase
      .from('employee_files')
      .delete()
      .eq('employee_id', employeeId)

    // 4. 插入新文件记录
    const fileRecords: EmployeeFile[] = []
    for (const fileData of newFiles) {
      const fileRecord = await this.createEmployeeFile(employeeId, fileData)
      fileRecords.push(fileRecord)
    }

    return fileRecords
  }

  /**
   * 切换员工锁定状态
   */
  async setEmployeeLock(id: number, action: string, adminId: number): Promise<{ status: string; lockSource: string }> {
    // 先清理过期的自动锁定
    await this.cleanupExpiredViewers(id)

    const { data: employee, error: empError } = await this.supabase
      .from('employees')
      .select('id, status, lock_source')
      .eq('id', id)
      .single()

    if (empError || !employee) {
      throw new Error('员工不存在')
    }

    let newStatus: string
    let newLockSource: string | null

    if (action === 'unlock') {
      // 手动解锁：设为auto（退出时自动解锁）
      newStatus = employee.status // 保持当前状态
      newLockSource = 'auto' // 退出时如果viewing_count=0则解锁
      // 如果当前没人查看，直接解锁
      const { data: viewers } = await this.supabase
        .from('employee_viewers')
        .select('admin_id')
        .eq('employee_id', id)
      if (!viewers || viewers.length === 0) {
        newStatus = 'submitted'
        newLockSource = null
      }
    } else {
      // 锁定：手动锁定
      newStatus = 'locked'
      newLockSource = 'manual'
    }

    const { error: updateError } = await this.supabase
      .from('employees')
      .update({
        status: newStatus,
        lock_source: newLockSource,
        locked_by: newStatus === 'locked' ? adminId : null,
        locked_at: newStatus === 'locked' ? new Date().toISOString() : null,
      })
      .eq('id', id)

    if (updateError) {
      throw new Error(`更新状态失败: ${updateError.message}`)
    }

    console.log(`员工 ${id} 锁定操作: action=${action}, status=${newStatus}, lock_source=${newLockSource}`)
    return { status: newStatus, lockSource: newLockSource || '' }
  }

  /**
   * 查询员工资料状态（通过手机号，无需鉴权）
   */
  async getEmployeeStatus(phone: string): Promise<{ submitted: boolean; locked: boolean; lockSource?: string; employeeId?: number }> {
    const result = await this.lookupByPhone(phone)
    if (!result) {
      return { submitted: false, locked: false }
    }
    // 先清理过期的自动锁定
    await this.cleanupExpiredViewers(result.employee.id)

    // 重新读取状态（cleanup可能已更新）
    const { data: emp } = await this.supabase
      .from('employees')
      .select('status, lock_source')
      .eq('id', result.employee.id)
      .maybeSingle()

    return {
      submitted: true,
      locked: emp?.status === 'locked',
      lockSource: emp?.lock_source || undefined,
      employeeId: result.employee.id,
    }
  }

  /**
   * 获取员工自己的文件列表（用于修改资料时恢复，带签名URL）
   */
  async getEmployeeOwnFiles(employeeId: number) {
    const { data: files, error } = await this.supabase
      .from('employee_files')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('获取员工文件失败:', error)
      throw new Error(`获取员工文件失败: ${error.message}`)
    }

    const fileList = (files as EmployeeFile[]) || []
    // 为每个文件生成签名URL
    const filesWithUrl = await Promise.all(
      fileList.map(async (f) => {
        const signedUrl = await this.storageService.getSignedUrl(f.file_key, 300) // 5分钟有效
        const uploadToken = this.registerUploadSession(f.file_key)
        return {
          id: f.id,
          fileType: f.file_type,
          fileKey: f.file_key,
          fileName: f.file_name,
          fileSize: f.file_size,
          fileMimetype: f.file_type_ext,
          fileTypeExt: f.file_type_ext,
          verificationOverride: f.verification_override,
          signedUrl,
          uploadToken,
        }
      })
    )

    return filesWithUrl
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
    verification_override?: boolean
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
        verification_override: fileData.verification_override || false,
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
   * 通过手机号查找员工（仅内部使用，HR管理端专用）
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
   * 获取员工列表（脱敏手机号）
   */
  async getEmployeeList(filters?: {
    name?: string
    phone?: string
    status?: string
    hrContacts?: string[] | null  // null=不过滤(全部), 数组=只返回范围内的
  }): Promise<{ employees: any[]; total: number }> {
    let query = this.supabase
      .from('employees')
      .select('*', { count: 'exact' })

    if (filters?.name) {
      // 转义 ilike 特殊字符 % 和 _，防止 SQL 模式注入
      const safeName = filters.name.replace(/%/g, '\\%').replace(/_/g, '\\_')
      query = query.ilike('name', `%${safeName}%`)
    }
    if (filters?.phone) {
      query = query.eq('phone', filters.phone)
    }
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    // hr_contacts 范围过滤：level2/3 只看范围内员工
    if (filters?.hrContacts && filters.hrContacts.length > 0) {
      query = query.in('hr_contact', filters.hrContacts)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error, count } = await query

    if (error) {
      console.error('获取员工列表失败:', error)
      throw new Error(`获取员工列表失败: ${error.message}`)
    }

    // 脱敏手机号
    const employees = ((data as Employee[]) || []).map(emp => ({
      ...emp,
      phone: maskPhone(emp.phone),
    }))

    return {
      employees,
      total: count || 0,
    }
  }

  /**
   * 获取员工详情（脱敏手机号）
   */
  async getEmployeeDetail(id: number): Promise<{ employee: any; files: EmployeeFile[] }> {
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

    // 脱敏手机号
    const maskedEmployee = {
      ...(employee as Employee),
      phone: maskPhone((employee as Employee).phone),
    }

    return {
      employee: maskedEmployee,
      files: (files as EmployeeFile[]) || [],
    }
  }

  /**
   * 验证管理员（bcrypt 比对）
   */
  async validateAdmin(username: string, password: string): Promise<{ id: number; username: string; role: string; hrContacts: string[] } | null> {
    const { data, error } = await this.supabase
      .from('hr_admins')
      .select('id, username, password_hash, role, hr_contacts')
      .eq('username', username)
      .maybeSingle()

    if (error) {
      console.error('验证管理员失败:', error)
      return null
    }

    if (!data) {
      return null
    }

    const isValid = await bcrypt.compare(password, data.password_hash)
    if (!isValid) return null

    return { id: data.id, username: data.username, role: data.role, hrContacts: data.hr_contacts || [] }
  }

  /**
   * 签发 JWT Token
   */
  async generateToken(admin: { id: number; username: string; role: string; hrContacts: string[] }): Promise<string> {
    const payload = { sub: admin.id, username: admin.username, role: admin.role, hrContacts: admin.hrContacts }
    return this.jwtService.sign(payload)
  }

  /**
   * 校验证件图片是否合规
   * @param imageUrl 图片访问 URL（签名 URL）
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

    const systemPrompt = `你是一个证件图像审核助手。你需要判断用户上传的图片是否符合指定的证件类型要求，并检查证件是否完整、文字是否清晰可识别。

目标证件类型：${docInfo.label}
证件特征描述：${docInfo.description}

请严格按照以下JSON格式输出，不要输出任何其他内容：
{"passed":true或false,"documentTypeMatch":true或false,"isComplete":true或false,"isTextLegible":true或false,"isClear":true或false,"reason":"不通过的具体原因，通过时为空字符串"}

判断规则：
1. documentTypeMatch：图片内容是否与目标证件类型匹配。如果图片是其他类型的证件、或者不是证件，则为false。
2. isComplete：证件是否完整展示。以下情况为false：证件大面积被裁切导致关键信息（如姓名、身份证号）缺失、证件严重破损。以下情况为true（可接受）：证件边缘有少量留白但不影响信息读取、证件四角略有裁切但所有文字信息完整可见。
3. isTextLegible：证件上的关键文字是否清晰可识别。以下情况为false：文字严重模糊完全无法辨认、大面积文字被遮挡。以下情况为true（可接受）：轻微的拍摄角度倾斜但文字仍可正常阅读、局部轻微反光但不影响关键信息读取、文字略有小幅变形但可辨认。
4. isClear：整体图像质量是否合格。以下情况为false：图像严重模糊（完全看不清内容）、大面积遮挡导致证件无法辨认。以下情况为true（可接受）：轻微的对焦不实但文字仍可辨别、局部轻度阴影但不影响整体识别。
5. passed = documentTypeMatch && isComplete && isTextLegible && isClear。注意：只有严重影响信息读取的问题才判为false，轻微的拍摄瑕疵应视为可接受。
6. reason：不通过时给出具体原因，必须指出具体哪项不通过及详细说明。通过时为空字符串。`

    try {
      console.log('开始校验证件图片:', { fileType, education })

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
        isComplete: Boolean(result.isComplete),
        isTextLegible: Boolean(result.isTextLegible),
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

  /**
   * 清理孤儿文件：删除 Storage 中未关联数据库记录的文件
   * 仅清理超过 24 小时的文件（避免删除正在上传中的文件）
   */
  async cleanupOrphanFiles(): Promise<{ scanned: number; deleted: number; kept: number }> {
    console.log('开始清理孤儿文件...')

    // 1. 获取 Storage 中所有文件
    const storageKeys = await this.storageService.listFiles('hr-files/')
    console.log(`Storage 中共 ${storageKeys.length} 个文件`)

    // 2. 获取数据库中所有已关联的 file_key
    const { data: dbFiles, error } = await this.supabase
      .from('employee_files')
      .select('file_key')

    if (error) {
      console.error('查询数据库文件记录失败:', error)
      throw new Error(`查询数据库文件记录失败: ${error.message}`)
    }

    const dbKeys = new Set((dbFiles || []).map((f: any) => f.file_key))
    console.log(`数据库中 ${dbKeys.size} 个已关联文件`)

    // 3. 找出孤儿文件（Storage 中存在但数据库中无记录）
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000
    let deleted = 0
    let kept = 0

    for (const key of storageKeys) {
      if (dbKeys.has(key)) {
        kept++
        continue
      }

      const fileName = key.split('/').pop() || ''
      const timestampMatch = fileName.match(/^(\d+)-/)
      if (timestampMatch) {
        const fileTime = parseInt(timestampMatch[1], 10)
        if (now - fileTime < twentyFourHours) {
          kept++
          continue
        }
      }

      const success = await this.storageService.deleteFile(key)
      if (success) {
        deleted++
        console.log(`已清理孤儿文件: ${key}`)
      }
    }

    console.log(`孤儿文件清理完成: 扫描 ${storageKeys.length}, 删除 ${deleted}, 保留 ${kept}`)
    return { scanned: storageKeys.length, deleted, kept }
  }

  /**
   * 删除员工及其所有文件
   */
  async deleteEmployee(id: number): Promise<void> {
    // 1. 获取员工的所有文件记录
    const { data: files, error: fileError } = await this.supabase
      .from('employee_files')
      .select('file_key')
      .eq('employee_id', id)

    if (fileError) {
      console.error('查询员工文件失败:', fileError)
      throw new Error(`查询员工文件失败: ${fileError.message}`)
    }

    // 2. 删除 Storage 中的文件
    if (files && files.length > 0) {
      for (const file of files) {
        await this.storageService.deleteFile(file.file_key)
      }
    }

    // 3. 删除数据库中的文件记录
    const { error: deleteFilesError } = await this.supabase
      .from('employee_files')
      .delete()
      .eq('employee_id', id)

    if (deleteFilesError) {
      console.error('删除员工文件记录失败:', deleteFilesError)
      throw new Error(`删除员工文件记录失败: ${deleteFilesError.message}`)
    }

    // 4. 删除员工记录
    const { error: deleteEmpError } = await this.supabase
      .from('employees')
      .delete()
      .eq('id', id)

    if (deleteEmpError) {
      console.error('删除员工记录失败:', deleteEmpError)
      throw new Error(`删除员工记录失败: ${deleteEmpError.message}`)
    }

    console.log('员工及资料已删除:', id)
  }

  /**
   * 修改管理员密码
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 6) {
      throw new Error('新密码长度至少6位')
    }

    // 验证当前密码
    const { data: admin, error } = await this.supabase
      .from('hr_admins')
      .select('id, password_hash')
      .eq('id', userId)
      .maybeSingle()

    if (error || !admin) {
      throw new Error('用户不存在')
    }

    // 比对当前密码（hr_admins 表始终使用 bcrypt 哈希）
    const isValid = await bcrypt.compare(currentPassword, admin.password_hash)

    if (!isValid) {
      throw new Error('当前密码错误')
    }

    // 哈希新密码并更新
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    const { error: updateError } = await this.supabase
      .from('hr_admins')
      .update({ password_hash: hashedPassword })
      .eq('id', userId)

    if (updateError) {
      throw new Error(`修改密码失败: ${updateError.message}`)
    }

    console.log('管理员密码已修改:', maskSensitive(`userId=${userId}`))
  }

  // ==================== 管理员 CRUD ====================

  /** 获取管理员列表（仅 level1 可调用） */
  async getAdminList(): Promise<{ id: number; username: string; role: string; hrContacts: string[]; createdBy: number | null; createdAt: string }[]> {
    const { data, error } = await this.supabase
      .from('hr_admins')
      .select('id, username, role, hr_contacts, created_by, created_at')
      .order('id', { ascending: true })

    if (error) {
      throw new Error(`获取管理员列表失败: ${error.message}`)
    }

    return (data || []).map(d => ({
      id: d.id,
      username: d.username,
      role: d.role,
      hrContacts: d.hr_contacts || [],
      createdBy: d.created_by,
      createdAt: d.created_at,
    }))
  }

  /** 创建管理员（仅 level1 可调用） */
  async createAdmin(params: {
    username: string
    password: string
    role: string
    hrContacts: string[]
    createdBy: number
  }): Promise<{ id: number; username: string; role: string }> {
    const { username, password, role, hrContacts, createdBy } = params

    // 校验角色
    if (!['level2', 'level3'].includes(role)) {
      throw new Error('只能创建二级或三级管理员')
    }

    // 校验 hrContacts
    const validContacts = ['魏经理', '孙经理']
    if (role !== 'level1') {
      for (const c of hrContacts) {
        if (!validContacts.includes(c)) {
          throw new Error(`无效的对接HR: ${c}，可选值: ${validContacts.join('、')}`)
        }
      }
      if (hrContacts.length === 0) {
        throw new Error('二三级管理员必须设置可查看的对接HR范围')
      }
    }

    // 检查用户名是否已存在
    const { data: existing } = await this.supabase
      .from('hr_admins')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (existing) {
      throw new Error('用户名已存在')
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const { data, error } = await this.supabase
      .from('hr_admins')
      .insert({
        username,
        password_hash: hashedPassword,
        role,
        hr_contacts: hrContacts,
        created_by: createdBy,
      })
      .select('id, username, role')
      .single()

    if (error) {
      throw new Error(`创建管理员失败: ${error.message}`)
    }

    return data
  }

  /** 删除管理员（仅 level1 可调用，不能删自己） */
  async deleteAdmin(adminId: number, operatorId: number): Promise<void> {
    if (adminId === operatorId) {
      throw new Error('不能删除自己')
    }

    // 检查目标是否是 level1
    const { data: target } = await this.supabase
      .from('hr_admins')
      .select('role')
      .eq('id', adminId)
      .maybeSingle()

    if (!target) {
      throw new Error('管理员不存在')
    }

    if (target.role === 'level1') {
      throw new Error('不能删除一级管理员')
    }

    const { error } = await this.supabase
      .from('hr_admins')
      .delete()
      .eq('id', adminId)

    if (error) {
      throw new Error(`删除管理员失败: ${error.message}`)
    }
  }

  /** 修改管理员（重置密码 / 修改 hrContacts） */
  async updateAdmin(params: {
    adminId: number
    password?: string
    hrContacts?: string[]
  }): Promise<void> {
    const { adminId, password, hrContacts } = params

    const updates: Record<string, any> = {}
    if (password) {
      updates.password_hash = await bcrypt.hash(password, 10)
    }
    if (hrContacts !== undefined) {
      const validContacts = ['魏经理', '孙经理']
      for (const c of hrContacts) {
        if (!validContacts.includes(c)) {
          throw new Error(`无效的对接HR: ${c}`)
        }
      }
      updates.hr_contacts = hrContacts
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('没有需要更新的内容')
    }

    const { error } = await this.supabase
      .from('hr_admins')
      .update(updates)
      .eq('id', adminId)

    if (error) {
      throw new Error(`修改管理员失败: ${error.message}`)
    }
  }

  /** 构建员工查询的 HR 范围过滤条件 */
  buildHrContactFilter(role: string, hrContacts: string[]): string[] | null {
    if (role === 'level1') return null // null 表示不过滤，返回全部
    return hrContacts.length > 0 ? hrContacts : null
  }

  /** 检查员工是否在管理员的查看范围内 */
  async isEmployeeInScope(employeeId: number, role: string, hrContacts: string[]): Promise<boolean> {
    if (role === 'level1') return true
    const { data } = await this.supabase
      .from('employees')
      .select('hr_contact')
      .eq('id', employeeId)
      .maybeSingle()
    if (!data) return false
    return hrContacts.includes(data.hr_contact)
  }

  /** 获取员工的viewing_count */
  async getViewingCount(employeeId: number): Promise<number> {
    await this.cleanupExpiredViewers(employeeId)
    const { data: emp } = await this.supabase
      .from('employees')
      .select('viewing_count')
      .eq('id', employeeId)
      .maybeSingle()
    return emp?.viewing_count || 0
  }

  /** 检查删除时是否只有当前管理员自己在查看，如果是则清理自己的viewer记录并允许删除 */
  async canDeleteWhileViewing(employeeId: number, adminId: number): Promise<boolean> {
    await this.cleanupExpiredViewers(employeeId)

    // 查询当前所有viewer
    const { data: viewers } = await this.supabase
      .from('employee_viewers')
      .select('admin_id')
      .eq('employee_id', employeeId)

    if (!viewers || viewers.length === 0) {
      return true
    }

    // 只有自己一个人在查看，清理自己的viewer记录后允许删除
    if (viewers.length === 1 && viewers[0].admin_id === adminId) {
      await this.supabase
        .from('employee_viewers')
        .delete()
        .eq('employee_id', employeeId)
        .eq('admin_id', adminId)

      // 重置viewing_count，如果是auto锁定则解锁
      const { data: emp } = await this.supabase
        .from('employees')
        .select('lock_source, status')
        .eq('id', employeeId)
        .maybeSingle()

      if (emp?.lock_source === 'auto' && emp?.status === 'locked') {
        await this.supabase
          .from('employees')
          .update({ status: 'submitted', lock_source: null, locked_by: null, locked_at: null, viewing_count: 0 })
          .eq('id', employeeId)
      } else {
        await this.supabase
          .from('employees')
          .update({ viewing_count: 0 })
          .eq('id', employeeId)
      }
      return true
    }

    // 有其他管理员在查看，不允许删除
    return false
  }

  /** 管理员进入详情页 */
  // ========== 查看锁定机制 ==========

  /** 被动清理过期的viewer记录，重算viewing_count，必要时解锁 */
  private async cleanupExpiredViewers(employeeId: number): Promise<number> {
    // 1. 删除超过30分钟的viewer记录
    await this.supabase
      .from('employee_viewers')
      .delete()
      .eq('employee_id', employeeId)
      .lt('entered_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

    // 2. 重算viewing_count
    const { count } = await this.supabase
      .from('employee_viewers')
      .select('*', { count: 'exact', head: true })
      .eq('employee_id', employeeId)

    const viewingCount = count || 0

    // 3. 如果count=0且lock_source=auto，则解锁
    const { data: emp } = await this.supabase
      .from('employees')
      .select('lock_source, status')
      .eq('id', employeeId)
      .maybeSingle()

    if (viewingCount === 0 && emp?.lock_source === 'auto' && emp?.status === 'locked') {
      await this.supabase
        .from('employees')
        .update({ status: 'submitted', lock_source: null, locked_by: null, locked_at: null, viewing_count: 0 })
        .eq('id', employeeId)
    } else {
      await this.supabase
        .from('employees')
        .update({ viewing_count: viewingCount })
        .eq('id', employeeId)
    }

    return viewingCount
  }

  /** 管理员进入详情页 */
  async enterView(employeeId: number, adminId: number): Promise<{ viewingCount: number; lockSource: string | null }> {
    // 先清理过期记录
    await this.cleanupExpiredViewers(employeeId)

    // 去重：同一管理员对同一员工只算一次
    const { data: existing } = await this.supabase
      .from('employee_viewers')
      .select('admin_id')
      .eq('employee_id', employeeId)
      .eq('admin_id', adminId)
      .maybeSingle()

    if (!existing) {
      // 插入viewer记录
      await this.supabase
        .from('employee_viewers')
        .insert({ employee_id: employeeId, admin_id: adminId })
    }

    // 重算viewing_count
    const { count } = await this.supabase
      .from('employee_viewers')
      .select('*', { count: 'exact', head: true })
      .eq('employee_id', employeeId)

    const viewingCount = count || 0

    // 如果之前未锁定，自动锁定
    const { data: emp } = await this.supabase
      .from('employees')
      .select('status, lock_source')
      .eq('id', employeeId)
      .maybeSingle()

    if (emp?.status === 'submitted') {
      await this.supabase
        .from('employees')
        .update({
          status: 'locked',
          lock_source: 'auto',
          locked_at: new Date().toISOString(),
          viewing_count: viewingCount,
        })
        .eq('id', employeeId)
      return { viewingCount, lockSource: 'auto' }
    }

    // 已锁定，更新viewing_count
    await this.supabase
      .from('employees')
      .update({ viewing_count: viewingCount })
      .eq('id', employeeId)

    return { viewingCount, lockSource: emp?.lock_source || null }
  }

  /** 管理员退出详情页 */
  async exitView(employeeId: number, adminId: number): Promise<{ viewingCount: number; unlocked: boolean }> {
    // 删除viewer记录
    await this.supabase
      .from('employee_viewers')
      .delete()
      .eq('employee_id', employeeId)
      .eq('admin_id', adminId)

    // 清理过期 + 重算count
    const viewingCount = await this.cleanupExpiredViewers(employeeId)

    // 如果count=0且lock_source=auto，cleanupExpiredViewers已经解锁了
    const { data: emp } = await this.supabase
      .from('employees')
      .select('status, lock_source')
      .eq('id', employeeId)
      .maybeSingle()

    const unlocked = viewingCount === 0 && emp?.lock_source !== 'manual' && emp?.status === 'submitted'

    return { viewingCount, unlocked }
  }

  /** 修改lock_source（管理员在详情页内点锁定/解锁） */
  async setLockSource(employeeId: number, lockSource: 'manual' | 'auto', adminId: number): Promise<void> {
    const updates: Record<string, unknown> = { lock_source: lockSource }
    if (lockSource === 'manual') {
      updates.locked_by = adminId
    } else {
      updates.locked_by = null
    }
    await this.supabase
      .from('employees')
      .update(updates)
      .eq('id', employeeId)
  }

  /** 检查员工是否正在被管理员查看 */
  async isBeingViewed(employeeId: number): Promise<boolean> {
    await this.cleanupExpiredViewers(employeeId)
    const { data: emp } = await this.supabase
      .from('employees')
      .select('viewing_count')
      .eq('id', employeeId)
      .maybeSingle()
    return (emp?.viewing_count || 0) > 0
  }
}
