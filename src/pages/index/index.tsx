import { useState, useEffect } from 'react'
import { View, Text, Picker, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Upload, Settings, Camera, ImagePlus, FileText, Trash2, CircleCheck, Eye, Phone, Calendar, User, GraduationCap } from 'lucide-react-taro'

interface FileInfo {
  fileType: string
  fileName: string
  filePath: string
  fileSize: number
  fileKey: string
  fileMimetype: string
}

interface VerificationResult {
  verified: boolean
  documentTypeMatch: boolean
  isClear: boolean
  reason: string
}

// 学历选项
const EDUCATION_OPTIONS = [
  { value: 'below_bachelor', label: '本科以下' },
  { value: 'bachelor', label: '本科' },
  { value: 'master', label: '研究生' },
  { value: 'doctor', label: '博士生' },
]

// 文件类型配置（身份证、体检报告、离职证明）
const FILE_TYPE_CONFIG: Record<string, { name: string; required: boolean; maxCount: number; accept: 'image' | 'all' }> = {
  id_card_front: { name: '身份证正面', required: true, maxCount: 1, accept: 'image' },
  id_card_back: { name: '身份证背面', required: true, maxCount: 1, accept: 'image' },
  medical_report: { name: '体检报告', required: true, maxCount: 5, accept: 'all' },
  resignation_proof: { name: '离职证明', required: true, maxCount: 1, accept: 'image' },
  bank_card_front: { name: '银行卡正面', required: true, maxCount: 1, accept: 'image' },
  bank_card_back: { name: '银行卡反面', required: true, maxCount: 1, accept: 'image' },
}

// 学历学位证书槽位定义（固定6个，根据学历决定显示哪些）
const EDU_CERT_SLOTS = [
  { key: 'diploma', labelBelowBachelor: '学历证书', labelDefault: '本科学历证书' },
  { key: 'degree', labelBelowBachelor: '学位证书', labelDefault: '本科学位证书' },
  { key: 'master_diploma', labelBelowBachelor: '硕士学历证书', labelDefault: '硕士学历证书' },
  { key: 'master_degree', labelBelowBachelor: '硕士学位证书', labelDefault: '硕士学位证书' },
  { key: 'doctor_diploma', labelBelowBachelor: '博士学历证书', labelDefault: '博士学历证书' },
  { key: 'doctor_degree', labelBelowBachelor: '博士学位证书', labelDefault: '博士学位证书' },
]

// 根据学历获取可见的槽位索引范围
function getEduSlotRange(education: string): { start: number; end: number } {
  switch (education) {
    case 'below_bachelor': return { start: 0, end: 0 }  // 1个
    case 'bachelor': return { start: 0, end: 1 }          // 2个
    case 'master': return { start: 0, end: 3 }            // 4个
    case 'doctor': return { start: 0, end: 5 }            // 6个
    default: return { start: 0, end: -1 }                  // 0个（未选择学历）
  }
}

// 根据学历获取槽位标签
function getSlotLabel(slot: typeof EDU_CERT_SLOTS[0], education: string): string {
  if (education === 'below_bachelor' && slot.key === 'diploma') {
    return slot.labelBelowBachelor
  }
  return slot.labelDefault
}

// 所有文件类型的标签映射（用于HR后台兼容）
const FILE_TYPE_LABELS: Record<string, string> = {
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
  degree_cert_1: '学位证书1',
  degree_cert_2: '学位证书2',
  degree_cert_3: '学位证书3',
  degree_cert_4: '学位证书4',
}

const FILE_TYPE_GROUPS = [
  { label: '身份证', types: ['id_card_front', 'id_card_back'] },
  { label: '学历学位证书', types: ['diploma', 'degree', 'master_diploma', 'master_degree', 'doctor_diploma', 'doctor_degree'] },
  { label: '体检报告', types: ['medical_report'] },
  { label: '离职证明', types: ['resignation_proof'] },
  { label: '银行卡', types: ['bank_card_front', 'bank_card_back'] },
]

const IndexPage = () => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [education, setEducation] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<FileInfo[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [verificationResults, setVerificationResults] = useState<Map<string, VerificationResult>>(new Map())
  const [submittedData, setSubmittedData] = useState<{
    employee: any
    files: any[]
  } | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)

  // 页面加载时检查是否有已提交的资料
  useEffect(() => {
    const savedPhone = Taro.getStorageSync('employeePhone')
    console.log('检查已保存的手机号:', savedPhone)
    if (savedPhone) {
      loadSubmittedData(savedPhone)
    } else {
      setIsLoadingData(false)
    }
  }, [])

  // 通过手机号加载已提交的数据
  const loadSubmittedData = async (phoneNumber: string) => {
    try {
      setIsLoadingData(true)
      const res = await Network.request({
        url: `/api/hr/employees/lookup?phone=${phoneNumber}`,
        method: 'GET',
      })
      console.log('查找员工响应:', res.data)

      if (res.data.code === 200 && res.data.data) {
        const emp = res.data.data.employee
        setSubmittedData(res.data.data)
        setName(emp.name || '')
        setPhone(emp.phone || '')
        setEducation(emp.education || '')
        setJoinDate(emp.join_date || '')
        const files: FileInfo[] = (res.data.data.files || []).map(f => ({
          fileType: f.file_type,
          fileName: f.file_name,
          filePath: f.url,
          fileSize: f.file_size,
          fileKey: f.file_key,
          fileMimetype: f.file_type_ext,
        }))
        setUploadedFiles(files)
      }
    } catch (error: any) {
      console.error('加载已提交数据失败:', error)
    } finally {
      setIsLoadingData(false)
    }
  }

  // 学历变更时，清空已上传的学历学位证书
  const handleEducationChange = (e) => {
    const newEdu = EDUCATION_OPTIONS[e.detail.value]?.value || ''
    setEducation(newEdu)
    // 清空学历学位证书相关文件
    const eduKeys = EDU_CERT_SLOTS.map(s => s.key)
    setUploadedFiles(prev => prev.filter(f => !eduKeys.includes(f.fileType)))
    setVerificationResults(prev => {
      const next = new Map(prev)
      for (const key of eduKeys) {
        // 删除相关校验结果
        for (const [k] of next) {
          const file = uploadedFiles.find(f => f.fileKey === k && f.fileType === key)
          if (file) next.delete(k)
        }
      }
      return next
    })
  }

  // 选择并上传文件
  const handleChooseFile = async (fileType: string) => {
    if (submittedData) return

    const isEduCert = EDU_CERT_SLOTS.some(s => s.key === fileType)
    const config = isEduCert
      ? { name: FILE_TYPE_LABELS[fileType] || fileType, required: true, maxCount: 1, accept: 'image' as const }
      : FILE_TYPE_CONFIG[fileType]

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
          console.log('上传文件:', file.name, '大小:', file.size, '路径:', file.path, '类型:', fileType)

          // 上传时传递 fileType 和 education 参数
          const uploadRes = await Network.uploadFile({
            url: `/api/hr/files/upload?fileType=${encodeURIComponent(fileType)}&education=${encodeURIComponent(education)}`,
            filePath: file.path,
            name: 'file',
          })
          const data = JSON.parse(uploadRes.data as string)
          console.log('上传响应:', data)

          if (data.code === 200) {
            const fileKey = data.data.fileKey
            const verification: VerificationResult | null = data.data.verification

            if (verification && !verification.verified) {
              console.log('证件校验未通过:', verification.reason)
              Taro.showModal({
                title: '资料校验未通过',
                content: verification.reason || '上传的图片不符合要求，请重新上传',
                showCancel: false,
                confirmText: '我知道了',
              })
            } else {
              setUploadedFiles(prev => [...prev, {
                fileType,
                fileName: data.data.fileName,
                filePath: data.data.url,
                fileSize: data.data.fileSize,
                fileKey,
                fileMimetype: data.data.fileMimetype,
              }])

              if (verification) {
                setVerificationResults(prev => new Map(prev).set(fileKey, verification))
              }

              if (verification) {
                Taro.showToast({ title: '校验通过', icon: 'success' })
              } else {
                Taro.showToast({ title: '上传成功', icon: 'success' })
              }
            }
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
    if (submittedData) return
    setUploadedFiles(prev => prev.filter(f => f.fileKey !== fileKey))
    setVerificationResults(prev => {
      const next = new Map(prev)
      next.delete(fileKey)
      return next
    })
  }

  const handleSubmit = async () => {
    if (!name.trim()) { Taro.showToast({ title: '请输入姓名', icon: 'none' }); return }
    if (!phone.trim()) { Taro.showToast({ title: '请输入手机号', icon: 'none' }); return }
    if (!education) { Taro.showToast({ title: '请选择学历', icon: 'none' }); return }
    if (!joinDate) { Taro.showToast({ title: '请选择入职日期', icon: 'none' }); return }

    // 校验身份证和离职证明
    const missingFiles: string[] = []
    for (const [type, config] of Object.entries(FILE_TYPE_CONFIG)) {
      if (!config.required) continue
      const count = uploadedFiles.filter(f => f.fileType === type).length
      if (count === 0) missingFiles.push(config.name)
    }

    // 校验学历学位证书
    if (education) {
      const range = getEduSlotRange(education)
      for (let i = range.start; i <= range.end; i++) {
        const slot = EDU_CERT_SLOTS[i]
        const count = uploadedFiles.filter(f => f.fileType === slot.key).length
        if (count === 0) {
          missingFiles.push(getSlotLabel(slot, education))
        }
      }
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
          name, phone, education, join_date: joinDate,
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
        Taro.setStorageSync('employeePhone', phone)
        setSubmittedData({
          employee: { name, phone, education, join_date: joinDate, status: 'submitted' },
          files: uploadedFiles.map(f => ({
            file_type: f.fileType,
            file_name: f.fileName,
            url: f.filePath,
            file_size: f.fileSize,
            file_type_ext: f.fileMimetype,
          })),
        })
        Taro.showToast({ title: '提交成功', icon: 'success' })
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

  // 预览图片
  const previewImage = (url: string) => {
    const allImageUrls = uploadedFiles
      .filter(f => f.fileMimetype?.startsWith('image/') || f.filePath)
      .map(f => f.filePath)
    Taro.previewImage({ current: url, urls: allImageUrls })
  }

  const getCount = (fileType: string) => uploadedFiles.filter(f => f.fileType === fileType).length

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + 'B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
  }

  // 获取学历显示文本
  const getEducationLabel = (value: string) => {
    return EDUCATION_OPTIONS.find(o => o.value === value)?.label || ''
  }

  // 渲染单个上传槽位
  const renderSlot = (fileType: string, label: string) => {
    const isUploaded = getCount(fileType) > 0
    const file = uploadedFiles.find(f => f.fileType === fileType)
    const isImage = file?.fileMimetype?.startsWith('image/')
    const verifyResult = file ? verificationResults.get(file.fileKey) : undefined

    if (submittedData && isUploaded && file) {
      // 已提交状态 - 只读展示
      return (
        <View
          className="border border-gray-200 rounded-lg overflow-hidden relative"
          onClick={() => isImage && file.filePath && previewImage(file.filePath)}
        >
          {isImage && file.filePath ? (
            <Image src={file.filePath} mode="aspectFill" style={{ width: '100%', height: '200rpx' }} />
          ) : (
            <View className="p-3 flex flex-col items-center justify-center" style={{ minHeight: '160rpx' }}>
              <FileText size={24} color="#6b7280" />
              <Text className="block text-xs text-gray-500 mt-1">{file.fileName}</Text>
            </View>
          )}
          <View className="p-2 bg-green-50">
            <Text className="block text-xs text-green-700 text-center">{label}</Text>
          </View>
        </View>
      )
    }

    // 编辑状态
    return (
      <View
        className="border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center relative"
        style={{ borderColor: isUploaded ? '#16a34a' : '#d1d5db', minHeight: '128rpx' }}
        onClick={() => handleChooseFile(fileType)}
      >
        {isUploaded ? (
          <View className="text-center">
            {verifyResult?.verified ? (
              <>
                <CircleCheck size={24} color="#16a34a" className="mx-auto mb-1" />
                <Text className="block text-xs text-green-600">{label}</Text>
              </>
            ) : (
              <>
                <Camera size={24} color="#16a34a" className="mx-auto mb-1" />
                <Text className="block text-xs text-green-600">{label}</Text>
              </>
            )}
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

  // 渲染学历学位证书区域
  const renderEduCertSection = () => {
    if (!education) {
      return (
        <View className="mb-6">
          <Text className="block text-base font-medium text-gray-900 mb-3">学历学位证书（必传）</Text>
          <View className="border border-gray-200 rounded-lg p-4">
            <Text className="block text-sm text-gray-400 text-center">请先选择学历</Text>
          </View>
        </View>
      )
    }

    const range = getEduSlotRange(education)
    const visibleSlots = EDU_CERT_SLOTS.slice(range.start, range.end + 1)

    return (
      <View className="mb-6">
        <View className="flex justify-between items-center mb-3">
          <Text className="block text-base font-medium text-gray-900">学历学位证书（必传）</Text>
          <Text className="block text-xs text-gray-500">需上传 {visibleSlots.length} 份</Text>
        </View>
        <View className="grid grid-cols-2 gap-3">
          {visibleSlots.map(slot => renderSlot(slot.key, getSlotLabel(slot, education)))}
        </View>
      </View>
    )
  }

  // 加载中
  if (isLoadingData) {
    return (
      <View className="bg-gray-50 min-h-screen flex items-center justify-center p-4">
        <Text className="block text-gray-500">加载中...</Text>
      </View>
    )
  }

  // =============== 已提交视图（只读） ===============
  if (submittedData) {
    const allImageUrls = uploadedFiles
      .filter(f => f.fileMimetype?.startsWith('image/') || f.filePath)
      .map(f => f.filePath)

    return (
      <View className="bg-gray-50 p-4 pb-8">
        <View className="mb-4 flex justify-between items-center">
          <View>
            <Text className="block text-xl font-bold text-gray-900 mb-1">我的入职资料</Text>
            <Text className="block text-sm text-gray-600">您已成功提交入职资料</Text>
          </View>
          <Button size="sm" variant="outline" onClick={() => Taro.navigateTo({ url: '/pages/hr-admin/index' })}>
            <Settings size={14} color="#6b7280" className="mr-1" />
            HR管理
          </Button>
        </View>

        <Card className="mb-4 border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CircleCheck size={24} color="#16a34a" />
            <View className="flex-1">
              <Text className="block text-base font-semibold text-green-800">资料已提交</Text>
              <Text className="block text-sm text-green-600">请耐心等待HR审核，提交后不可修改</Text>
            </View>
            <Badge variant="secondary">已提交</Badge>
          </CardContent>
        </Card>

        {/* 基本信息 */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <Text className="block text-lg font-semibold text-gray-900 mb-3">基本信息</Text>
            <Separator className="mb-3" />
            <View className="flex flex-col gap-3">
              <View className="flex items-center gap-2">
                <User size={16} color="#6b7280" />
                <Text className="block text-sm text-gray-500 w-16">姓名</Text>
                <Text className="block text-sm text-gray-900 font-medium">{name}</Text>
              </View>
              <View className="flex items-center gap-2">
                <Phone size={16} color="#6b7280" />
                <Text className="block text-sm text-gray-500 w-16">手机号</Text>
                <Text className="block text-sm text-gray-900 font-medium">{phone}</Text>
              </View>
              <View className="flex items-center gap-2">
                <GraduationCap size={16} color="#6b7280" />
                <Text className="block text-sm text-gray-500 w-16">学历</Text>
                <Text className="block text-sm text-gray-900 font-medium">{getEducationLabel(education)}</Text>
              </View>
              <View className="flex items-center gap-2">
                <Calendar size={16} color="#6b7280" />
                <Text className="block text-sm text-gray-500 w-16">入职日期</Text>
                <Text className="block text-sm text-gray-900 font-medium">{joinDate}</Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* 资料列表 */}
        {FILE_TYPE_GROUPS.map(group => {
          const groupFiles = uploadedFiles.filter(f => group.types.includes(f.fileType))
          if (groupFiles.length === 0 && group.label !== '学历学位证书') return null

          return (
            <Card key={group.label} className="mb-4">
              <CardContent className="p-4">
                <View className="flex justify-between items-center mb-3">
                  <Text className="block text-base font-semibold text-gray-900">{group.label}</Text>
                  <Text className="block text-xs text-gray-500">{groupFiles.length} 份</Text>
                </View>
                <Separator className="mb-3" />

                {group.label === '学历学位证书' ? (
                  // 学历学位证书 - 动态槽位
                  renderEduCertSection()
                ) : group.label !== '体检报告' ? (
                  // 身份证/离职证明 - 网格展示
                  <View className="grid grid-cols-2 gap-3">
                    {group.types.map(type => renderSlot(type, FILE_TYPE_LABELS[type] || type))}
                  </View>
                ) : (
                  // 体检报告 - 列表展示
                  <View className="flex flex-col gap-2">
                    {groupFiles.map(file => {
                      const isImage = file.fileMimetype?.startsWith('image/')
                      return (
                        <View key={file.fileKey} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          {isImage ? (
                            <View
                              className="border border-gray-200 rounded overflow-hidden flex-shrink-0"
                              onClick={() => file.filePath && Taro.previewImage({ current: file.filePath, urls: allImageUrls })}
                            >
                              <Image src={file.filePath} mode="aspectFill" style={{ width: '120rpx', height: '120rpx' }} />
                            </View>
                          ) : (
                            <View className="flex-shrink-0 p-2 bg-white rounded border border-gray-200">
                              <FileText size={24} color="#dc2626" />
                            </View>
                          )}
                          <View className="flex-1 min-w-0">
                            <Text className="block text-sm text-gray-900 truncate">{file.fileName}</Text>
                            <Text className="block text-xs text-gray-500 mt-1">{formatFileSize(file.fileSize)}</Text>
                          </View>
                          <View className="flex-shrink-0">
                            <Eye size={18} color="#2563eb" />
                          </View>
                        </View>
                      )
                    })}
                  </View>
                )}
              </CardContent>
            </Card>
          )
        })}
      </View>
    )
  }

  // =============== 编辑视图（未提交） ===============
  return (
    <View className="bg-gray-50 p-4 pb-8">
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
        <Text className="block text-sm ml-2">上传的证件照将由AI自动校验，请确保资料清晰可见</Text>
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

          <View className="mb-4">
            <Label className="mb-2"><Text className="block text-sm font-medium text-gray-700">学历 *</Text></Label>
            <Picker mode="selector" range={EDUCATION_OPTIONS.map(o => o.label)} onChange={handleEducationChange} value={EDUCATION_OPTIONS.findIndex(o => o.value === education)}>
              <View className="bg-gray-50 rounded-lg px-4 py-3 flex justify-between items-center">
                <Text className={education ? 'text-gray-900' : 'text-gray-400'}>{education ? getEducationLabel(education) : '请选择学历'}</Text>
              </View>
            </Picker>
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

          {/* 学历学位证书 */}
          {renderEduCertSection()}

          {/* 体检报告 */}
          <View className="mb-6">
            <View className="flex justify-between items-center mb-3">
              <Text className="block text-base font-medium text-gray-900">体检报告（必传）</Text>
              <Text className="block text-xs text-gray-500">{getCount('medical_report')} 份</Text>
            </View>
            <Button className="w-full" variant="outline" onClick={() => handleChooseFile('medical_report')} disabled={isUploading}>
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
          <View className="mb-6">
            <Text className="block text-base font-medium text-gray-900 mb-3">离职证明（必传）</Text>
            {renderSlot('resignation_proof', '离职证明')}
          </View>

          {/* 银行卡 */}
          <View className="mb-2">
            <Text className="block text-base font-medium text-gray-900 mb-3">银行卡（必传）</Text>
            <View className="grid grid-cols-2 gap-3">
              {renderSlot('bank_card_front', '银行卡正面')}
              {renderSlot('bank_card_back', '银行卡反面')}
            </View>
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
