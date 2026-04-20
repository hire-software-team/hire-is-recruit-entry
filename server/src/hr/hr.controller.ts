import { Controller, Post, Get, Param, Body, UseInterceptors, UploadedFile, HttpCode, NotFoundException, BadRequestException, Headers, Res } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { HrService } from './hr.service'
import { StorageService } from '../storage/storage.service'
import * as archiver from 'archiver'
import { Readable } from 'stream'

@Controller('hr')
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * 上传文件
   */
  @Post('files/upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请上传文件')
    }

    console.log('收到文件上传请求:', file.originalname, '大小:', file.size)

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

      // 创建临时文件记录
      const tempFile = await this.hrService.createTempFile({
        file_type: 'temp', // 临时类型，提交时更新
        file_key: key,
        file_name: file.originalname,
        file_size: file.size,
        file_type_ext: file.mimetype,
      })

      console.log('文件上传成功:', { id: tempFile.id, url })

      return {
        code: 200,
        msg: 'success',
        data: {
          id: tempFile.id,
          url,
          fileName: file.originalname,
          fileSize: file.size,
        },
      }
    } catch (error: any) {
      console.error('文件上传失败:', error)
      throw new BadRequestException(error.message || '文件上传失败')
    }
  }

  /**
   * 提交员工资料
   */
  @Post('employees')
  @HttpCode(200)
  async submitEmployee(@Body() body: {
    name: string
    phone: string
    join_date: string
    files: Array<{ id: number; file_type: string }>
  }) {
    console.log('收到员工资料提交请求:', body)

    const { name, phone, join_date, files } = body

    // 验证必填字段
    if (!name || !phone || !join_date) {
      throw new BadRequestException('请填写完整的基本信息')
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('请上传相关资料')
    }

    try {
      // 创建员工记录
      const employee = await this.hrService.createEmployee({
        name,
        phone,
        join_date: join_date,
        files,
      })

      // 更新文件关联
      const fileIds = files.map(f => f.id)
      await this.hrService.updateEmployeeFile(employee.id, fileIds)

      // 更新文件类型
      for (const file of files) {
        const { error } = await this.hrService['supabase']
          .from('employee_files')
          .update({ file_type: file.file_type })
          .eq('id', file.id)

        if (error) {
          console.error('更新文件类型失败:', error)
        }
      }

      console.log('员工资料提交成功:', { employeeId: employee.id })

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

    // 验证管理员
    const isValid = await this.hrService.validateAdmin(username, password)

    if (!isValid) {
      throw new BadRequestException('用户名或密码错误')
    }

    console.log('登录成功:', username)

    return {
      code: 200,
      msg: '登录成功',
      data: {
        token: 'mock-token-' + Date.now(), // 简单的 token
        username,
      },
    }
  }

  /**
   * 获取员工列表
   */
  @Get('employees')
  @HttpCode(200)
  async getEmployeeList(@Headers('authorization') auth: string, @Body() body?: any) {
    console.log('收到员工列表请求:', body)

    // 简单验证 token
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new BadRequestException('未授权')
    }

    try {
      const filters = body?.filters || {}
      const result = await this.hrService.getEmployeeList(filters)

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

    // 简单验证 token
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new BadRequestException('未授权')
    }

    try {
      const result = await this.hrService.getEmployeeDetail(Number(id))

      // 为文件添加公开访问 URL
      const filesWithUrl = result.files.map(file => {
        const { data } = this.storageService['supabase'].storage
          .from('hr-files')
          .getPublicUrl(file.file_key)
        return {
          ...file,
          url: data.publicUrl,
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
  async downloadEmployeeFiles(@Param('id') id: string, @Headers('authorization') auth: string, @Res() res: Response) {
    console.log('收到打包下载请求:', id)

    // 简单验证 token
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new BadRequestException('未授权')
    }

    try {
      // 获取员工详情
      const { employee, files } = await this.hrService.getEmployeeDetail(Number(id))

      if (files.length === 0) {
        throw new NotFoundException('该员工没有上传资料')
      }

      // 设置响应头
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename=${employee.name}-资料.zip`)

      // 创建 archiver 实例
      const archive = archiver('zip', {
        zlib: { level: 9 }, // 最高压缩级别
      })

      // 监听错误
      archive.on('error', (err) => {
        throw err
      })

      // 将输出流连接到响应
      archive.pipe(res as unknown as NodeJS.WritableStream)

      // 添加文件到压缩包
      for (const file of files) {
        try {
          const buffer = await this.storageService.downloadFile(file.file_key)

          // 确定文件名
          const fileTypeName = this.getFileTypeName(file.file_type)
          const fileName = `${employee.name}-${fileTypeName}-${file.file_name}`

          archive.append(buffer, { name: fileName })
        } catch (error) {
          console.error(`下载文件 ${file.file_name} 失败:`, error)
        }
      }

      // 完成压缩
      await archive.finalize()

      console.log('打包下载成功:', { employeeId: id, fileCount: files.length })
    } catch (error: any) {
      console.error('打包下载失败:', error)
      throw new BadRequestException(error.message || '打包下载失败')
    }
  }

  /**
   * 获取文件类型名称
   */
  private getFileTypeName(fileType: string): string {
    const typeMap: Record<string, string> = {
      id_card_front: '身份证正面',
      id_card_back: '身份证背面',
      degree_cert_1: '学位证书1',
      degree_cert_2: '学位证书2',
      degree_cert_3: '学位证书3',
      degree_cert_4: '学位证书4',
      medical_report: '体检报告',
      resignation_proof: '离职证明',
    }
    return typeMap[fileType] || fileType
  }
}
