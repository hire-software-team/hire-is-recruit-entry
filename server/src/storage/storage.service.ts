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

    const url = this.getPublicUrl(key)

    return { key, url }
  }

  /**
   * 获取文件公开访问 URL
   */
  getPublicUrl(key: string): string {
    const { data } = this.supabase.storage
      .from('hr-files')
      .getPublicUrl(key)
    return data.publicUrl
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

    if (!data) {
      throw new Error('下载数据为空')
    }

    const arrayBuffer = await data.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  /**
   * 列出存储桶中指定前缀下的所有文件
   */
  async listFiles(prefix: string = 'hr-files/'): Promise<string[]> {
    const keys: string[] = []
    let offset = 0
    const limit = 100

    // 分页获取所有文件
    while (true) {
      const { data, error } = await this.supabase.storage
        .from('hr-files')
        .list(prefix, {
          limit,
          offset,
          sortBy: { column: 'created_at', order: 'asc' },
        })

      if (error) {
        console.error('列出存储文件失败:', error)
        throw new Error(`列出存储文件失败: ${error.message}`)
      }

      if (!data || data.length === 0) break

      for (const item of data) {
        // 只收集文件，跳过文件夹
        if (!item.id) continue
        keys.push(`${prefix}${item.name}`)
      }

      if (data.length < limit) break
      offset += limit
    }

    return keys
  }

  /**
   * 删除存储桶中的文件
   */
  async deleteFile(key: string): Promise<boolean> {
    const { error } = await this.supabase.storage
      .from('hr-files')
      .remove([key])

    if (error) {
      console.error('删除存储文件失败:', key, error)
      return false
    }

    console.log('已删除存储文件:', key)
    return true
  }
}
