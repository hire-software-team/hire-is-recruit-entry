import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Upload, Settings } from 'lucide-react-taro'

interface FileInfo {
  id: string
  fileType: string
  fileName: string
  filePath: string
  fileSize: number
}

const IndexPage = () => {
  // 基本信息
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [joinDate, setJoinDate] = useState('')

  // 已上传的文件
  const [uploadedFiles, setUploadedFiles] = useState<FileInfo[]>([])
  const [isUploading, setIsUploading] = useState(false)

  // 文件类型定义
  const fileTypes = {
    idCardFront: { name: '身份证正面', type: 'id_card_front', required: true, maxCount: 1, accept: 'image' },
    idCardBack: { name: '身份证背面', type: 'id_card_back', required: true, maxCount: 1, accept: 'image' },
    degreeCert1: { name: '学位证书 1', type: 'degree_cert_1', required: true, maxCount: 1, accept: 'image' },
    degreeCert2: { name: '学位证书 2', type: 'degree_cert_2', required: true, maxCount: 1, accept: 'image' },
    degreeCert3: { name: '学位证书 3', type: 'degree_cert_3', required: true, maxCount: 1, accept: 'image' },
    degreeCert4: { name: '学位证书 4', type: 'degree_cert_4', required: true, maxCount: 1, accept: 'image' },
    medicalReport: { name: '体检报告', type: 'medical_report', required: true, maxCount: 999, accept: 'all' },
    resignationProof: { name: '离职证明', type: 'resignation_proof', required: true, maxCount: 1, accept: 'image' },
  }

  // 选择文件
  const handleChooseFile = async (fileType: string) => {
    const config = Object.values(fileTypes).find(c => c.type === fileType)
    if (!config) return

    try {
      // 检查是否已达到最大数量
      const currentCount = uploadedFiles.filter(f => f.fileType === fileType).length
      if (currentCount >= config.maxCount) {
        Taro.showToast({
          title: `${config.name}最多上传${config.maxCount}份`,
          icon: 'none',
        })
        return
      }

      let files: any[]

      if (config.accept === 'image') {
        // 选择图片
        const res = await Taro.chooseImage({
          count: config.maxCount - currentCount,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
        })
        files = res.tempFiles
      } else {
        // 选择文件（支持 PDF）
        const res = await Taro.chooseMessageFile({
          count: config.maxCount - currentCount,
          type: 'file',
          extension: ['pdf', 'jpg', 'jpeg', 'png'],
        })
        files = res.tempFiles
      }

      // 上传文件
      setIsUploading(true)
      for (const file of files) {
        try {
          console.log('开始上传文件:', file.name, '大小:', file.size, '路径:', file.path)

          const uploadRes = await Network.uploadFile({
            url: '/api/hr/files/upload',
            filePath: file.path,
            name: 'file',
          })

          console.log('上传响应:', uploadRes)

          const data = JSON.parse(uploadRes.data as string)
          console.log('解析后的数据:', data)

          if (data.code === 200) {
            setUploadedFiles(prev => [
              ...prev,
              {
                id: data.data.id,
                fileType,
                fileName: file.name,
                filePath: data.data.url,
                fileSize: file.size,
              },
            ])
            Taro.showToast({
              title: '上传成功',
              icon: 'success',
            })
          } else {
            throw new Error(data.msg || '上传失败')
          }
        } catch (error: any) {
          console.error('上传失败:', error)
          Taro.showToast({
            title: error.message || '上传失败',
            icon: 'none',
          })
        }
      }

      setIsUploading(false)
    } catch (error: any) {
      console.error('选择文件失败:', error)
      setIsUploading(false)
      if (error.errMsg && !error.errMsg.includes('cancel')) {
        Taro.showToast({
          title: '选择文件失败',
          icon: 'none',
        })
      }
    }
  }

  // 删除文件
  const handleDeleteFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
  }

  // 提交资料
  const handleSubmit = async () => {
    // 验证基本信息
    if (!name.trim()) {
      Taro.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (!phone.trim()) {
      Taro.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }
    if (!joinDate) {
      Taro.showToast({ title: '请选择入职日期', icon: 'none' })
      return
    }

    // 验证文件完整性
    const requiredFiles = Object.values(fileTypes).filter(f => f.required)
    const missingFiles: string[] = []

    for (const required of requiredFiles) {
      if (required.type === 'medical_report') {
        const count = uploadedFiles.filter(f => f.fileType === required.type).length
        if (count === 0) {
          missingFiles.push(required.name)
        }
      } else {
        const file = uploadedFiles.find(f => f.fileType === required.type)
        if (!file) {
          missingFiles.push(required.name)
        }
      }
    }

    if (missingFiles.length > 0) {
      Taro.showToast({
        title: `请上传: ${missingFiles.join('、')}`,
        icon: 'none',
        duration: 3000,
      })
      return
    }

    // 提交
    try {
      setIsUploading(true)

      const res = await Network.request({
        url: '/api/hr/employees',
        method: 'POST',
        data: {
          name,
          phone,
          join_date: joinDate,
          files: uploadedFiles.map(f => ({ id: f.id, file_type: f.fileType })),
        },
      })

      console.log('提交响应:', res)

      if (res.data.code === 200) {
        Taro.showModal({
          title: '提交成功',
          content: '您的资料已提交，请耐心等待HR审核',
          showCancel: false,
          success: () => {
            // 清空表单
            setName('')
            setPhone('')
            setJoinDate('')
            setUploadedFiles([])
          },
        })
      } else {
        throw new Error(res.data.msg || '提交失败')
      }
    } catch (error: any) {
      console.error('提交失败:', error)
      Taro.showToast({
        title: error.message || '提交失败',
        icon: 'none',
      })
    } finally {
      setIsUploading(false)
    }
  }

  // 选择日期
  const handleChooseDate = () => {
    Taro.showActionSheet({
      itemList: ['选择入职日期'],
      success: async () => {
        try {
          // 使用 prompt 简化日期选择
          const date = prompt('请输入入职日期（格式：YYYY-MM-DD）:')
          if (date) {
            // 简单的日期格式验证
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/
            if (dateRegex.test(date)) {
              setJoinDate(date)
            } else {
              Taro.showToast({
                title: '日期格式错误，请使用 YYYY-MM-DD',
                icon: 'none',
              })
            }
          }
        } catch (error) {
          console.error('选择日期失败:', error)
        }
      },
    })
  }

  return (
    <View className="min-h-screen bg-gray-50 p-4 pb-8">
      <View className="mb-4 flex justify-between items-center">
        <View>
          <Text className="block text-xl font-bold text-gray-900 mb-2">新员工资料上传</Text>
          <Text className="block text-sm text-gray-600">请填写基本信息并上传相关资料</Text>
        </View>
        <Button
          size="sm"
          variant="outline"
          onClick={() => Taro.navigateTo({ url: '/pages/hr-admin/index' })}
        >
          <Settings size={14} color="#6b7280" className="mr-1" />
          HR管理
        </Button>
      </View>

      <Alert className="mb-4">
        <Upload size={16} color="#6b7280" />
        <Text className="block text-sm ml-2">
          请确保上传的资料清晰可见，提交后无法修改
        </Text>
      </Alert>

      {/* 基本信息 */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          <Text className="block text-lg font-semibold text-gray-900 mb-4">基本信息</Text>

          <View>
            <Label className="mb-2">姓名 *</Label>
            <Input
              className="w-full"
              placeholder="请输入姓名"
              value={name}
              onInput={(e) => setName(e.detail.value)}
            />
          </View>

          <View>
            <Label className="mb-2">手机号 *</Label>
            <Input
              className="w-full"
              type="number"
              placeholder="请输入手机号"
              value={phone}
              onInput={(e) => setPhone(e.detail.value)}
              maxlength={11}
            />
          </View>

          <View>
            <Label className="mb-2">入职日期 *</Label>
            <View
              className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between"
              onClick={handleChooseDate}
            >
              <Text className={joinDate ? 'text-gray-900' : 'text-gray-400'}>
                {joinDate || '请选择入职日期'}
              </Text>
              <Upload size={16} color="#6b7280" className="text-gray-500" />
            </View>
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
              <View
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center min-h-32"
                onClick={() => handleChooseFile('idCardFront')}
              >
                {uploadedFiles.find(f => f.fileType === 'id_card_front') ? (
                  <View className="text-center">
                    <Upload size={24} color="#16a34a" className="mx-auto mb-2" />
                    <Text className="block text-xs text-gray-600">已上传</Text>
                  </View>
                ) : (
                  <View className="text-center">
                    <Upload size={24} color="#6b7280" className="mx-auto mb-2" />
                    <Text className="block text-xs text-gray-500">身份证正面</Text>
                  </View>
                )}
              </View>
              <View
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center min-h-32"
                onClick={() => handleChooseFile('idCardBack')}
              >
                {uploadedFiles.find(f => f.fileType === 'id_card_back') ? (
                  <View className="text-center">
                    <Upload size={24} color="#16a34a" className="mx-auto mb-2" />
                    <Text className="block text-xs text-gray-600">已上传</Text>
                  </View>
                ) : (
                  <View className="text-center">
                    <Upload size={24} color="#6b7280" className="mx-auto mb-2" />
                    <Text className="block text-xs text-gray-500">身份证背面</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* 学位证书 */}
          <View className="mb-6">
            <Text className="block text-base font-medium text-gray-900 mb-3">学位证书（必传）</Text>
            <View className="grid grid-cols-2 gap-3">
              {['degree_cert_1', 'degree_cert_2', 'degree_cert_3', 'degree_cert_4'].map((type, index) => (
                <View
                  key={type}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center min-h-32"
                  onClick={() => handleChooseFile(type)}
                >
                  {uploadedFiles.find(f => f.fileType === type) ? (
                    <View className="text-center">
                      <Upload size={24} color="#16a34a" className="mx-auto mb-2" />
                      <Text className="block text-xs text-gray-600">证书 {index + 1}</Text>
                    </View>
                  ) : (
                    <View className="text-center">
                      <Upload size={24} color="#6b7280" className="mx-auto mb-2" />
                      <Text className="block text-xs text-gray-500">证书 {index + 1}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* 体检报告 */}
          <View className="mb-6">
            <View className="flex justify-between items-center mb-3">
              <Text className="block text-base font-medium text-gray-900">体检报告（必传）</Text>
              <Text className="block text-xs text-gray-500">
                {uploadedFiles.filter(f => f.fileType === 'medical_report').length} 份
              </Text>
            </View>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => handleChooseFile('medicalReport')}
            >
              <Upload size={16} color="#6b7280" className="mr-2" />
              添加体检报告（PDF或图片）
            </Button>
            {uploadedFiles.filter(f => f.fileType === 'medical_report').length > 0 && (
              <View className="mt-2 space-y-2">
                {uploadedFiles
                  .filter(f => f.fileType === 'medical_report')
                  .map(file => (
                    <View
                      key={file.id}
                      className="bg-gray-50 rounded-lg px-3 py-2 flex justify-between items-center"
                    >
                      <Text className="block text-sm text-gray-700 flex-1 truncate">{file.fileName}</Text>
                      <Text
                        className="block text-xs text-red-600 ml-2"
                        onClick={() => handleDeleteFile(file.id)}
                      >
                        删除
                      </Text>
                    </View>
                  ))}
              </View>
            )}
          </View>

          {/* 离职证明 */}
          <View className="mb-6">
            <Text className="block text-base font-medium text-gray-900 mb-3">离职证明（必传）</Text>
            <View
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center min-h-32"
              onClick={() => handleChooseFile('resignationProof')}
            >
              {uploadedFiles.find(f => f.fileType === 'resignation_proof') ? (
                <View className="text-center">
                  <Upload size={24} color="#16a34a" className="mx-auto mb-2" />
                  <Text className="block text-xs text-gray-600">已上传</Text>
                </View>
              ) : (
                <View className="text-center">
                  <Upload size={24} color="#6b7280" className="mx-auto mb-2" />
                  <Text className="block text-xs text-gray-500">离职证明</Text>
                </View>
              )}
            </View>
          </View>
        </CardContent>
      </Card>

      {/* 提交按钮 */}
      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={isUploading}
      >
        {isUploading ? '提交中...' : '提交资料'}
      </Button>
    </View>
  )
}

export default IndexPage
