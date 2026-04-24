import { Controller, Post, Get, Param, Query, Body, UseInterceptors, UploadedFile, HttpCode, NotFoundException, BadRequestException, Headers, Res, UseGuards, Req, ForbiddenException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { HrService } from './hr.service'
import { HrCleanupService } from './hr-cleanup.service'
import { StorageService } from '../storage/storage.service'
import { AuthGuard } from '@nestjs/passport'
import { RateLimiter, maskSensitive } from './hr.utils'
import * as archiver from 'archiver'

// 限流器实例
const uploadLimiter = new RateLimiter()
const submitLimiter = new RateLimiter()

@Controller('hr')
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly storageService: StorageService,
    private readonly cleanupService: HrCleanupService,
  ) {}

  /**
   * 管理员登录
   */
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: { username: string; password: string }) {
    console.log('管理员登录请求:', maskSensitive(body.username))

    if (!body.username || !body.password) {
      throw new BadRequestException('用户名和密码不能为空')
    }

    const admin = await this.hrService.validateAdmin(body.username, body.password)
    if (!admin) {
      throw new BadRequestException('用户名或密码错误')
    }

    const token = await this.hrService.generateToken(admin)

    return {
      code: 200,
      msg: '登录成功',
      data: { token, username: admin.username },
    }
  }

  /**
   * 上传文件（无需鉴权，有限流）
   */
  @Post('files/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('fileType') fileType: string,
    @Query('education') education: string,
    @Req() req: any,
  ) {
    // IP 限流：每分钟最多 10 次
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown'
    if (uploadLimiter.isRateLimited(clientIp, 10, 60 * 1000)) {
      throw new BadRequestException('上传过于频繁，请稍后再试')
    }

    if (!file) {
      throw new BadRequestException('请选择要上传的文件')
    }

    if (!fileType) {
      throw new BadRequestException('请指定文件类型')
    }

    console.log('收到文件上传请求:', { fileType, size: file.size })

    // 上传文件到 Supabase Storage
    const { key, url } = await this.storageService.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    )

    console.log('文件上传成功:', { key, url })

    // AI 校验
    let verification: any = null
    if (file.mimetype.startsWith('image/') && !['medical_report'].includes(fileType)) {
      // 使用签名 URL 进行校验
      const signedUrl = await this.storageService.getSignedUrl(key, 1800)
      verification = await this.hrService.verifyDocumentImage(signedUrl, fileType, education)

      if (verification && !verification.verified) {
        // 校验未通过，删除已上传的文件
        await this.storageService.deleteFile(key)
        console.log('校验未通过，已删除文件:', key)

        return {
          code: 200,
          msg: '校验未通过',
          data: {
            fileKey: key,
            fileName: file.originalname,
            fileSize: file.size,
            url,
            fileMimetype: file.mimetype,
            verification,
          },
        }
      }
    }

    return {
      code: 200,
      msg: '上传成功',
      data: {
        fileKey: key,
        fileName: file.originalname,
        fileSize: file.size,
        url,
        fileMimetype: file.mimetype,
        verification,
      },
    }
  }

  /**
   * 提交员工资料（无需鉴权，有限流）
   */
  @Post('employees')
  @HttpCode(200)
  async submitEmployee(
    @Body() body: {
      name: string
      phone: string
      education: string
      joinDate: string
      files: Array<{
        fileType: string
        fileKey: string
        fileName: string
        fileSize: number
        verificationOverride?: boolean
      }>
    },
    @Req() req: any,
  ) {
    // IP 限流：每分钟最多 5 次
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown'
    if (submitLimiter.isRateLimited(clientIp, 5, 60 * 1000)) {
      throw new BadRequestException('提交过于频繁，请稍后再试')
    }

    console.log('收到员工资料提交请求:', maskSensitive(`name=${body.name}, phone=${body.phone}`))

    if (!body.name || !body.phone) {
      throw new BadRequestException('姓名和手机号不能为空')
    }

    if (!body.education) {
      throw new BadRequestException('请选择学历')
    }

    if (!body.files || body.files.length === 0) {
      throw new BadRequestException('请上传所需资料')
    }

    // 检查手机号是否已提交
    const existing = await this.hrService.lookupByPhone(body.phone)
    if (existing) {
      throw new BadRequestException('该手机号已提交过资料')
    }

    // 创建员工记录
    const employee = await this.hrService.createEmployee({
      name: body.name,
      phone: body.phone,
      education: body.education,
      join_date: body.joinDate,
    })

    // 创建文件记录
    const fileRecords: any[] = []
    for (const file of body.files) {
      const ext = file.fileName.split('.').pop() || ''
      const fileRecord = await this.hrService.createEmployeeFile(employee.id, {
        file_type: file.fileType,
        file_key: file.fileKey,
        file_name: file.fileName,
        file_size: file.fileSize,
        file_type_ext: ext,
        verification_override: file.verificationOverride || false,
      })
      fileRecords.push(fileRecord)
    }

    console.log('员工资料提交成功:', { employeeId: employee.id, fileCount: fileRecords.length })

    return {
      code: 200,
      msg: '提交成功',
      data: {
        employee,
        files: fileRecords,
      },
    }
  }

  /**
   * 获取员工列表（管理员，JWT 鉴权）
   */
  @Get('employees')
  @UseGuards(AuthGuard('jwt'))
  async getEmployeeList(
    @Query('name') name?: string,
    @Query('phone') phone?: string,
  ) {
    console.log('管理员查询员工列表')
    const result = await this.hrService.getEmployeeList({ name, phone })
    return {
      code: 200,
      data: result,
    }
  }

  /**
   * 获取员工详情（管理员，JWT 鉴权）
   */
  @Get('employees/:id')
  @UseGuards(AuthGuard('jwt'))
  async getEmployeeDetail(@Param('id') id: string) {
    console.log('管理员查询员工详情:', id)
    const result = await this.hrService.getEmployeeDetail(Number(id))

    if (!result) {
      throw new NotFoundException('员工不存在')
    }

    // 为文件生成签名 URL
    const filesWithSignedUrl = await Promise.all(
      result.files.map(async (file) => {
        const signedUrl = await this.storageService.getSignedUrl(file.file_key, 1800)
        return { ...file, signed_url: signedUrl }
      })
    )

    return {
      code: 200,
      data: {
        employee: result.employee,
        files: filesWithSignedUrl,
      },
    }
  }

  /**
   * 打包下载员工资料（管理员，JWT 鉴权）
   */
  @Get('employees/:id/download')
  @UseGuards(AuthGuard('jwt'))
  async downloadEmployeeFiles(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    console.log('管理员下载员工资料:', id)

    const result = await this.hrService.getEmployeeDetail(Number(id))
    if (!result) {
      throw new NotFoundException('员工不存在')
    }

    const { employee, files } = result

    if (!files || files.length === 0) {
      throw new NotFoundException('该员工没有上传任何文件')
    }

    // 设置响应头
    const zipFileName = encodeURIComponent(`${employee.name}_入职资料.zip`)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${zipFileName}`)

    const archive = archiver('zip', { zlib: { level: 5 } })
    archive.pipe(res)

    for (const file of files) {
      try {
        const fileBuffer = await this.storageService.downloadFile(file.file_key)
        const typeName = this.getFileTypeName(file.file_type)
        const ext = file.file_type_ext || file.file_name.split('.').pop() || 'bin'
        const fileName = `${typeName}_${file.id}.${ext}`

        archive.append(fileBuffer, { name: fileName })
      } catch (error) {
        console.error(`下载文件 ${file.file_key} 失败:`, error)
      }
    }

    await archive.finalize()
  }

  /**
   * 删除员工资料（管理员，JWT 鉴权）
   */
  @Post('employees/:id/delete')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  async deleteEmployee(@Param('id') id: string) {
    console.log('管理员删除员工资料:', id)
    try {
      await this.hrService.deleteEmployee(Number(id))
      return {
        code: 200,
        msg: '删除成功',
      }
    } catch (error: any) {
      console.error('删除员工失败:', error)
      throw new BadRequestException(error.message || '删除失败')
    }
  }

  /**
   * 修改管理员密码（JWT 鉴权）
   */
  @Post('auth/change-password')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  async changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @Req() req: any,
  ) {
    console.log('管理员修改密码')
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('请输入当前密码和新密码')
    }
    if (body.newPassword.length < 6) {
      throw new BadRequestException('新密码长度至少6位')
    }

    try {
      await this.hrService.changePassword(req.user.userId, body.currentPassword, body.newPassword)
      return {
        code: 200,
        msg: '密码修改成功',
      }
    } catch (error: any) {
      throw new BadRequestException(error.message || '修改密码失败')
    }
  }

  /**
   * 手动触发孤儿文件清理（管理员，JWT 鉴权）
   */
  @Post('cleanup/orphan-files')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  async cleanupOrphanFiles() {
    console.log('管理员手动触发清理孤儿文件')
    try {
      const result = await this.cleanupService.manualCleanup()
      return {
        code: 200,
        msg: '清理完成',
        data: result,
      }
    } catch (error: any) {
      console.error('清理孤儿文件失败:', error)
      throw new BadRequestException(error.message || '清理失败')
    }
  }

  /**
   * 获取文件类型的中文名称
   */
  private getFileTypeName(fileType: string): string {
    const typeMap: Record<string, string> = {
      id_card_front: '身份证正面',
      id_card_back: '身份证背面',
      medical_report: '体检报告',
      resignation_proof: '离职证明',
      bank_card_front: '银行卡正面',
      bank_card_back: '银行卡反面',
      // 学历学位证书
      diploma: '学历证书',
      degree: '学位证书',
      master_diploma: '硕士学历证书',
      master_degree: '硕士学位证书',
      doctor_diploma: '博士学历证书',
      doctor_degree: '博士学位证书',
      // 兼容旧命名
      degree_cert_1: '学位证书1',
      degree_cert_2: '学位证书2',
      degree_cert_3: '学位证书3',
      degree_cert_4: '学位证书4',
    }
    return typeMap[fileType] || fileType
  }
}
