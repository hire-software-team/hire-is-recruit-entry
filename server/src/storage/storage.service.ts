import { Injectable } from '@nestjs/common'
import { getSupabaseClient } from './database/supabase-client'

@Injectable()
export class StorageService {
  private supabase = getSupabaseClient()

  /**
   * 上传文件到对象存储
   */
  async uploadFile(buffer: Buffer, filename: string, mimetype: string): Promise<{ key: string; url: string }> {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 9)
    const ext = filename.split('.').pop()
    const key = `hr-files/${timestamp}-${random}.${ext}`

    console.log('开始上传文件到 Supabase Storage:', { key, filename, mimetype })

    // 上传到 Supabase Storage
    const { data, error } = await this.supabase.storage
      .from('hr-files')
      .upload(key, buffer, {
        contentType: mimetype,
      })

    if (error) {
      console.error('上传文件到 Supabase Storage 失败:', error)
      throw new Error(`上传文件失败: ${error.message}`)
    }

    console.log('文件上传成功:', key)

    // 获取公开访问 URL
    const urlData = this.supabase.storage
      .from('hr-files')
      .getPublicUrl(key)

    return {
      key,
      url: urlData.data.publicUrl,
    }
  }

  /**
   * 下载文件
   */
  async downloadFile(key: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage
      .from('hr-files')
      .download(key)

    if (error) {
      console.error('下载文件失败:', error)
      throw new Error(`下载文件失败: ${error.message}`)
    }

    // 将 Blob 转换为 ArrayBuffer，再转换为 Buffer
    if (!data) {
      throw new Error('下载数据为空')
    }

    const arrayBuffer = await data.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}
