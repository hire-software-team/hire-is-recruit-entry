import { Controller, Post, Get, Param, Query, Body, UseInterceptors, UploadedFile, HttpCode, NotFoundException, BadRequestException, Headers, Res } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { HrService } from './hr.service'
import { StorageService } from '../storage/storage.service'
import * as archiver from 'archiver'

@Controller('hr')
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * 上传文件（仅上传到对象存储，不写数据库）
   * 图片类型文件会调用大模型进行证件校验
   */
  @Post('files/upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('fileType') fileType: string,
    @Query('education') education: string,
  ) {
    if (!file) {
      throw new BadRequestException('请上传文件')
    }

    console.log('收到文件上传请求:', file.originalname, '大小:', file.size, '类型:', file.mimetype, '文件类型:', fileType)

    // 验证文件大小（最大 10MB）
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      throw new BadRequestException('文件大小不能超过 10MB')
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('仅支持 JPG、PNG、PDF 格式的文件')
    }

    try {
      // 上传到对象存储
      const { key, url } = await this.storageService.uploadFile(file.buffer, file.originalname, file.mimetype)

      console.log('文件上传成功:', { key, url })

      // 图片类型文件进行大模型校验
      let verification: {
        verified: boolean
        documentTypeMatch: boolean
        isClear: boolean
        reason: string
      } | null = null

      if (fileType && file.mimetype.startsWith('image/')) {
        verification = await this.hrService.verifyDocumentImage(url, fileType, education)
      }

      return {
        code: 200,
        msg: 'success',
        data: {
          fileKey: key,
          url,
          fileName: file.originalname,
          fileSize: file.size,
          fileMimetype: file.mimetype,
          verification,
        },
      }
    } catch (error: any) {
      console.error('文件上传失败:', error)
      throw new BadRequestException(error.message || '文件上传失败')
    }
  }

  /**
   * 通过手机号查找员工（用于员工再次打开小程序时恢复数据）
   */
  @Get('employees/lookup')
  @HttpCode(200)
  async lookupEmployee(@Query('phone') phone: string) {
    console.log('收到员工查找请求, phone:', phone)

    if (!phone) {
      throw new BadRequestException('请提供手机号')
    }

    try {
      const result = await this.hrService.lookupByPhone(phone)

      if (!result) {
        return {
          code: 200,
          msg: '未找到员工记录',
          data: null,
        }
      }

      // 为文件添加公开访问 URL
      const filesWithUrl = result.files.map(file => {
        const url = this.storageService.getPublicUrl(file.file_key)
        return {
          ...file,
          url,
        }
      })

      return {
        code: 200,
        msg: 'success',
        data: {
          employee: result.employee,
          files: filesWithUrl,
        },
      }
    } catch (error: any) {
      console.error('查找员工失败:', error)
      throw new BadRequestException(error.message || '查找员工失败')
    }
  }

  /**
   * 提交员工资料（同时创建员工记录和文件记录）
   */
  @Post('employees')
  @HttpCode(200)
  async submitEmployee(@Body() body: {
    name: string
    phone: string
    education: string
    join_date: string
    files: Array<{
      file_type: string
      file_key: string
      file_name: string
      file_size: number
      file_mimetype: string
    }>
  }) {
    console.log('收到员工资料提交请求:', JSON.stringify(body).substring(0, 500))

    const { name, phone, education, join_date, files } = body

    // 验证必填字段
    if (!name || !phone || !education || !join_date) {
      throw new BadRequestException('请填写完整的基本信息')
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('请上传相关资料')
    }

    try {
      // 1. 创建员工记录
      const employee = await this.hrService.createEmployee({
        name,
        phone,
        education,
        join_date,
      })

      console.log('员工记录创建成功:', { employeeId: employee.id })

      // 2. 批量创建文件记录（关联到该员工）
      for (const file of files) {
        await this.hrService.createEmployeeFile(employee.id, {
          file_type: file.file_type,
          file_key: file.file_key,
          file_name: file.file_name,
          file_size: file.file_size,
          file_type_ext: file.file_mimetype,
        })
      }

      console.log('员工资料提交成功:', { employeeId: employee.id, fileCount: files.length })

      return {
        code: 200,
        msg: '提交成功',
        data: {
          employeeId: employee.id,
        },
      }
    } catch (error: any) {
      console.error('员工资料提交失败:', error)
      throw new BadRequestException(error.message || '提交失败')
    }
  }

  /**
   * 管理员登录
   */
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: { username: string; password: string }) {
    const { username, password } = body

    console.log('收到登录请求:', username)

    const isValid = await this.hrService.validateAdmin(username, password)

    if (!isValid) {
      throw new BadRequestException('用户名或密码错误')
    }

    console.log('登录成功:', username)

    return {
      code: 200,
      msg: '登录成功',
      data: {
        token: 'mock-token-' + Date.now(),
        username,
      },
    }
  }

  /**
   * 获取员工列表
   */
  @Get('employees')
  @HttpCode(200)
  async getEmployeeList(@Headers('authorization') auth: string) {
    console.log('收到员工列表请求')

    if (!auth || !auth.startsWith('Bearer ')) {
      throw new BadRequestException('未授权')
    }

    try {
      const result = await this.hrService.getEmployeeList()

      return {
        code: 200,
        msg: 'success',
        data: result,
      }
    } catch (error: any) {
      console.error('获取员工列表失败:', error)
      throw new BadRequestException(error.message || '获取员工列表失败')
    }
  }

  /**
   * 获取员工详情
   */
  @Get('employees/:id')
  @HttpCode(200)
  async getEmployeeDetail(@Param('id') id: string, @Headers('authorization') auth: string) {
    console.log('收到员工详情请求:', id)

    if (!auth || !auth.startsWith('Bearer ')) {
      throw new BadRequestException('未授权')
    }

    try {
      const result = await this.hrService.getEmployeeDetail(Number(id))

      // 为文件添加公开访问 URL
      const filesWithUrl = result.files.map(file => {
        const url = this.storageService.getPublicUrl(file.file_key)
        return {
          ...file,
          url,
        }
      })

      return {
        code: 200,
        msg: 'success',
        data: {
          employee: result.employee,
          files: filesWithUrl,
        },
      }
    } catch (error: any) {
      console.error('获取员工详情失败:', error)
      throw new BadRequestException(error.message || '获取员工详情失败')
    }
  }

  /**
   * 打包下载员工所有资料
   */
  @Get('employees/:id/download')
  async downloadEmployeeFiles(@Param('id') id: string, @Headers('authorization') auth: string, @Query('token') queryToken: string, @Res() res: Response) {
    console.log('收到打包下载请求:', id)

    // 支持通过 header 或 query 参数传递 token
    const token = auth?.startsWith('Bearer ') ? auth : (queryToken ? `Bearer ${queryToken}` : '')
    if (!token) {
      throw new BadRequestException('未授权')
    }

    try {
      const { employee, files } = await this.hrService.getEmployeeDetail(Number(id))

      if (files.length === 0) {
        throw new NotFoundException('该员工没有上传资料')
      }

      res.setHeader('Content-Type', 'application/zip')
      const safeName = employee.name.replace(/[^\w\u4e00-\u9fa5]/g, '')
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName + '-资料.zip')}`)

      const archive = archiver('zip', { zlib: { level: 9 } })

      archive.on('error', (err) => { throw err })

      archive.pipe(res as unknown as NodeJS.WritableStream)

      for (const file of files) {
        try {
          const buffer = await this.storageService.downloadFile(file.file_key)
          const fileTypeName = this.getFileTypeName(file.file_type)
          const ext = file.file_name.split('.').pop() || ''
          const fileName = `${employee.name}-${fileTypeName}.${ext}`
          archive.append(buffer, { name: fileName })
        } catch (error) {
          console.error(`下载文件 ${file.file_name} 失败:`, error)
        }
      }

      await archive.finalize()

      console.log('打包下载成功:', { employeeId: id, fileCount: files.length })
    } catch (error: any) {
      console.error('打包下载失败:', error)
      throw new BadRequestException(error.message || '打包下载失败')
    }
  }

  private getFileTypeName(fileType: string): string {
    const typeMap: Record<string, string> = {
      id_card_front: '身份证正面',
      id_card_back: '身份证背面',
      diploma: '学历证书',
      degree: '学位证书',
      master_diploma: '硕士学历证书',
      master_degree: '硕士学位证书',
      doctor_diploma: '博士学历证书',
      doctor_degree: '博士学位证书',
      medical_report: '体检报告',
      resignation_proof: '离职证明',
      bank_card_front: '银行卡正面',
      bank_card_back: '银行卡反面',
      // 兼容旧命名
      degree_cert_1: '学位证书1',
      degree_cert_2: '学位证书2',
      degree_cert_3: '学位证书3',
      degree_cert_4: '学位证书4',
    }
    return typeMap[fileType] || fileType
  }
}
