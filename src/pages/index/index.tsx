import { useState } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Upload, Settings, Camera, ImagePlus, FileText, Trash2 } from 'lucide-react-taro'

interface FileInfo {
  fileType: string
  fileName: string
  filePath: string
  fileSize: number
  fileKey: string
  fileMimetype: string
}

// 文件类型配置
const FILE_TYPE_CONFIG = {
  id_card_front: { name: '身份证正面', required: true, maxCount: 1, accept: 'image' as const },
  id_card_back: { name: '身份证背面', required: true, maxCount: 1, accept: 'image' as const },
  degree_cert_1: { name: '学位证书 1', required: true, maxCount: 1, accept: 'image' as const },
  degree_cert_2: { name: '学位证书 2', required: true, maxCount: 1, accept: 'image' as const },
  degree_cert_3: { name: '学位证书 3', required: true, maxCount: 1, accept: 'image' as const },
  degree_cert_4: { name: '学位证书 4', required: true, maxCount: 1, accept: 'image' as const },
  medical_report: { name: '体检报告', required: true, maxCount: 999, accept: 'all' as const },
  resignation_proof: { name: '离职证明', required: true, maxCount: 1, accept: 'image' as const },
}

const IndexPage = () => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<FileInfo[]>([])
  const [isUploading, setIsUploading] = useState(false)

  // 选择并上传文件
  const handleChooseFile = async (fileType: string) => {
    const config = FILE_TYPE_CONFIG[fileType]
    if (!config) return

    const currentCount = uploadedFiles.filter(f => f.fileType === fileType).length
    if (currentCount >= config.maxCount) {
      Taro.showToast({ title: `${config.name}最多上传${config.maxCount}份`, icon: 'none' })
      return
    }

    try {
      let files: any[]

      if (config.accept === 'image') {
        const res = await Taro.chooseImage({
          count: config.maxCount - currentCount,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
        })
        files = res.tempFiles
      } else {
        const res = await Taro.chooseMessageFile({
          count: config.maxCount - currentCount,
          type: 'file',
          extension: ['pdf', 'jpg', 'jpeg', 'png'],
        })
        files = res.tempFiles
      }

      setIsUploading(true)
      for (const file of files) {
        try {
          console.log('上传文件:', file.name, '大小:', file.size, '路径:', file.path)
          const uploadRes = await Network.uploadFile({
            url: '/api/hr/files/upload',
            filePath: file.path,
            name: 'file',
          })
          const data = JSON.parse(uploadRes.data as string)
          console.log('上传响应:', data)

          if (data.code === 200) {
            setUploadedFiles(prev => [...prev, {
              fileType,
              fileName: data.data.fileName,
              filePath: data.data.url,
              fileSize: data.data.fileSize,
              fileKey: data.data.fileKey,
              fileMimetype: data.data.fileMimetype,
            }])
            Taro.showToast({ title: '上传成功', icon: 'success' })
          } else {
            throw new Error(data.msg || '上传失败')
          }
        } catch (error: any) {
          console.error('上传失败:', error)
          Taro.showToast({ title: error.message || '上传失败', icon: 'none' })
        }
      }
      setIsUploading(false)
    } catch (error: any) {
      setIsUploading(false)
      if (error.errMsg && !error.errMsg.includes('cancel')) {
        console.error('选择文件失败:', error)
        Taro.showToast({ title: '选择文件失败', icon: 'none' })
      }
    }
  }

  const handleDeleteFile = (fileKey: string) => {
    setUploadedFiles(prev => prev.filter(f => f.fileKey !== fileKey))
  }

  const handleSubmit = async () => {
    if (!name.trim()) { Taro.showToast({ title: '请输入姓名', icon: 'none' }); return }
    if (!phone.trim()) { Taro.showToast({ title: '请输入手机号', icon: 'none' }); return }
    if (!joinDate) { Taro.showToast({ title: '请选择入职日期', icon: 'none' }); return }

    const missingFiles: string[] = []
    for (const [type, config] of Object.entries(FILE_TYPE_CONFIG)) {
      if (!config.required) continue
      const count = uploadedFiles.filter(f => f.fileType === type).length
      if (count === 0) missingFiles.push(config.name)
    }

    if (missingFiles.length > 0) {
      Taro.showToast({ title: `请上传: ${missingFiles.join('、')}`, icon: 'none', duration: 3000 })
      return
    }

    try {
      setIsUploading(true)
      const res = await Network.request({
        url: '/api/hr/employees',
        method: 'POST',
        data: {
          name, phone, join_date: joinDate,
          files: uploadedFiles.map(f => ({
            file_type: f.fileType,
            file_key: f.fileKey,
            file_name: f.fileName,
            file_size: f.fileSize,
            file_mimetype: f.fileMimetype,
          })),
        },
      })
      console.log('提交响应:', res)
      if (res.data.code === 200) {
        Taro.showModal({
          title: '提交成功',
          content: '您的资料已提交，请耐心等待HR审核',
          showCancel: false,
          success: () => { setName(''); setPhone(''); setJoinDate(''); setUploadedFiles([]) },
        })
      } else {
        throw new Error(res.data.msg || '提交失败')
      }
    } catch (error: any) {
      console.error('提交失败:', error)
      Taro.showToast({ title: error.message || '提交失败', icon: 'none' })
    } finally {
      setIsUploading(false)
    }
  }

  // 获取某类型已上传数量
  const getCount = (fileType: string) => uploadedFiles.filter(f => f.fileType === fileType).length

  // 渲染单个上传槽位
  const renderSlot = (fileType: string, label: string) => {
    const isUploaded = getCount(fileType) > 0
    return (
      <View
        className="border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center"
        style={{ borderColor: isUploaded ? '#16a34a' : '#d1d5db', minHeight: '128rpx' }}
        onClick={() => handleChooseFile(fileType)}
      >
        {isUploaded ? (
          <View className="text-center">
            <Camera size={24} color="#16a34a" className="mx-auto mb-1" />
            <Text className="block text-xs text-green-600">{label}</Text>
          </View>
        ) : (
          <View className="text-center">
            <ImagePlus size={24} color="#9ca3af" className="mx-auto mb-1" />
            <Text className="block text-xs text-gray-400">{label}</Text>
          </View>
        )}
      </View>
    )
  }

  const onDateChange = (e) => {
    setJoinDate(e.detail.value)
  }

  return (
    <View className="bg-gray-50 p-4 pb-8">
      {/* 标题 */}
      <View className="mb-4 flex justify-between items-center">
        <View>
          <Text className="block text-xl font-bold text-gray-900 mb-1">新员工资料上传</Text>
          <Text className="block text-sm text-gray-600">请填写基本信息并上传相关资料</Text>
        </View>
        <Button size="sm" variant="outline" onClick={() => Taro.navigateTo({ url: '/pages/hr-admin/index' })}>
          <Settings size={14} color="#6b7280" className="mr-1" />
          HR管理
        </Button>
      </View>

      <Alert className="mb-4">
        <Upload size={16} color="#6b7280" />
        <Text className="block text-sm ml-2">请确保上传的资料清晰可见，提交后无法修改</Text>
      </Alert>

      {/* 基本信息 */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <Text className="block text-lg font-semibold text-gray-900 mb-4">基本信息</Text>

          <View className="mb-4">
            <Label className="mb-2"><Text className="block text-sm font-medium text-gray-700">姓名 *</Text></Label>
            <View className="bg-gray-50 rounded-lg px-4 py-3">
              <Input className="w-full bg-transparent" placeholder="请输入姓名" value={name} onInput={(e) => setName(e.detail.value)} />
            </View>
          </View>

          <View className="mb-4">
            <Label className="mb-2"><Text className="block text-sm font-medium text-gray-700">手机号 *</Text></Label>
            <View className="bg-gray-50 rounded-lg px-4 py-3">
              <Input className="w-full bg-transparent" type="number" placeholder="请输入手机号" value={phone} onInput={(e) => setPhone(e.detail.value)} maxlength={11} />
            </View>
          </View>

          <View>
            <Label className="mb-2"><Text className="block text-sm font-medium text-gray-700">入职日期 *</Text></Label>
            <Picker mode="date" onChange={onDateChange} value={joinDate || ''}>
              <View className="bg-gray-50 rounded-lg px-4 py-3 flex justify-between items-center">
                <Text className={joinDate ? 'text-gray-900' : 'text-gray-400'}>{joinDate || '请选择入职日期'}</Text>
              </View>
            </Picker>
          </View>
        </CardContent>
      </Card>

      {/* 资料上传 */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <Text className="block text-lg font-semibold text-gray-900 mb-4">资料上传</Text>

          {/* 身份证 */}
          <View className="mb-6">
            <Text className="block text-base font-medium text-gray-900 mb-3">身份证（必传）</Text>
            <View className="grid grid-cols-2 gap-3">
              {renderSlot('id_card_front', '身份证正面')}
              {renderSlot('id_card_back', '身份证背面')}
            </View>
          </View>

          {/* 学位证书 */}
          <View className="mb-6">
            <Text className="block text-base font-medium text-gray-900 mb-3">学位证书（必传）</Text>
            <View className="grid grid-cols-2 gap-3">
              {renderSlot('degree_cert_1', '学位证书 1')}
              {renderSlot('degree_cert_2', '学位证书 2')}
              {renderSlot('degree_cert_3', '学位证书 3')}
              {renderSlot('degree_cert_4', '学位证书 4')}
            </View>
          </View>

          {/* 体检报告 */}
          <View className="mb-6">
            <View className="flex justify-between items-center mb-3">
              <Text className="block text-base font-medium text-gray-900">体检报告（必传）</Text>
              <Text className="block text-xs text-gray-500">{getCount('medical_report')} 份</Text>
            </View>
            <Button className="w-full" variant="outline" onClick={() => handleChooseFile('medical_report')}>
              <FileText size={16} color="#6b7280" className="mr-2" />
              添加体检报告（PDF或图片）
            </Button>
            {getCount('medical_report') > 0 && (
              <View className="mt-3">
                {uploadedFiles.filter(f => f.fileType === 'medical_report').map(file => (
                  <View key={file.fileKey} className="bg-gray-50 rounded-lg px-3 py-2 mb-2 flex justify-between items-center">
                    <Text className="block text-sm text-gray-700 flex-1">{file.fileName}</Text>
                    <View onClick={() => handleDeleteFile(file.fileKey)}>
                      <Trash2 size={16} color="#dc2626" />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 离职证明 */}
          <View className="mb-2">
            <Text className="block text-base font-medium text-gray-900 mb-3">离职证明（必传）</Text>
            {renderSlot('resignation_proof', '离职证明')}
          </View>
        </CardContent>
      </Card>

      {/* 提交按钮 */}
      <Button className="w-full" onClick={handleSubmit} disabled={isUploading}>
        {isUploading ? '提交中...' : '提交资料'}
      </Button>
    </View>
  )
}

export default IndexPage
