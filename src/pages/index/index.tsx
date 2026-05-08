import { useState, useEffect, useRef } from 'react'
import { View, Text, Picker, Image, Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Upload, Settings, ImagePlus, FileText, Trash2, CircleCheck, Eye, Phone, Calendar, User, GraduationCap, LoaderCircle } from 'lucide-react-taro'

interface FileInfo {
  fileType: string
  fileName: string
  filePath: string
  fileSize: number
  fileKey: string
  fileMimetype: string
  uploadToken: string
  verificationOverride?: boolean
}

interface VerificationResult {
  verified: boolean
  documentTypeMatch: boolean
  isComplete: boolean
  isTextLegible: boolean
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

// 不需要AI校验的文件类型
const SKIP_VERIFY_TYPES = ['medical_report', 'signature']

// 文件类型配置（身份证、体检报告、离职证明、银行卡）
// 最大文件大小：10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

const FILE_TYPE_CONFIG: Record<string, { name: string; required: boolean; maxCount: number; accept: 'image' | 'file' | 'mixed' }> = {
  id_card_front: { name: '身份证正面', required: true, maxCount: 1, accept: 'image' },
  id_card_back: { name: '身份证背面', required: true, maxCount: 1, accept: 'image' },
  medical_report: { name: '体检报告', required: true, maxCount: 5, accept: 'mixed' },
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

// 判断文件类型是否为图片（兼容 MIME 类型和扩展名两种格式）
const isImageByMimetype = (mimetype?: string): boolean => {
  if (!mimetype) return false
  if (mimetype.startsWith('image/')) return true
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
  return imageExts.includes(mimetype.toLowerCase())
}

const IndexPage = () => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [education, setEducation] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<FileInfo[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [verifyingType, setVerifyingType] = useState<string | null>(null)
  const [verificationResults, setVerificationResults] = useState<Map<string, VerificationResult>>(new Map())
  const [showVerifyFailModal, setShowVerifyFailModal] = useState(false)
  const [verifyFailInfo, setVerifyFailInfo] = useState<{ reason: string; fileType: string; fileData: any } | null>(null)
  const [submittedData, setSubmittedData] = useState<{
    employee: any
    files: any[]
  } | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)

  // 签字确认相关状态
  const [agreed, setAgreed] = useState(false)
  const [showSignDialog, setShowSignDialog] = useState(false)
  const [signatureFile, setSignatureFile] = useState<FileInfo | null>(null)
  const [isSigning, setIsSigning] = useState(false)

  // 草稿缓存 Key
  const DRAFT_KEY = 'hrDraft'
  const SUBMITTED_KEY = 'hrSubmittedData'

  // 保存草稿到 localStorage（仅保存表单数据，不保存文件信息）
  // 文件上传后会话有时效性，重新打开需重新上传
  const saveDraft = (draftName: string, draftPhone: string, draftEducation: string, draftJoinDate: string, _draftFiles?: FileInfo[]) => {
    try {
      Taro.setStorageSync(DRAFT_KEY, JSON.stringify({
        name: draftName,
        phone: draftPhone,
        education: draftEducation,
        joinDate: draftJoinDate,
        updatedAt: Date.now(),
      }))
    } catch (e) {
      console.error('保存草稿失败:', e)
    }
  }

  // 清除草稿
  const clearDraft = () => {
    try {
      Taro.removeStorageSync(DRAFT_KEY)
      console.log('草稿已清除')
    } catch (e) {
      console.error('清除草稿失败:', e)
    }
  }

  // 保存已提交数据到 localStorage（移除敏感的 fileKey）
  const saveSubmittedData = (emp: any, files: FileInfo[]) => {
    try {
      const safeFiles = files.map(f => ({
        fileType: f.fileType,
        fileName: f.fileName,
        fileSize: f.fileSize,
        fileMimetype: f.fileMimetype,
        verificationOverride: f.verificationOverride,
      }))
      Taro.setStorageSync(SUBMITTED_KEY, JSON.stringify({
        employee: emp,
        files: safeFiles,
        submittedAt: Date.now(),
      }))
    } catch (e) {
      console.error('保存已提交数据失败:', e)
    }
  }

  // 页面加载时恢复数据
  useEffect(() => {
    // 1. 优先检查已提交的资料
    const submittedStr = Taro.getStorageSync(SUBMITTED_KEY)
    if (submittedStr) {
      try {
        const submitted = JSON.parse(submittedStr)
        if (submitted && submitted.employee) {
          const emp = submitted.employee
          setSubmittedData(submitted)
          setName(emp.name || '')
          setPhone(emp.phone || '')
          setEducation(emp.education || '')
          setJoinDate(emp.join_date || emp.joinDate || '')
          // 已提交的资料不恢复文件列表（文件信息无本地预览路径）
          setUploadedFiles([])
          setIsLoadingData(false)
          return
        }
      } catch (e) {
        console.error('恢复已提交数据失败:', e)
      }
    }

    // 2. 没有已提交资料，尝试恢复草稿
    loadDraft()
    setIsLoadingData(false)
  }, [])

  // 从 localStorage 恢复草稿（仅恢复表单数据，文件需重新上传）
  const loadDraft = () => {    try {
      const draftStr = Taro.getStorageSync(DRAFT_KEY)
      if (!draftStr) return
      const draft = JSON.parse(draftStr)
      if (draft && draft.name) {
        setName(draft.name || '')
        setPhone(draft.phone || '')
        setEducation(draft.education || '')
        setJoinDate(draft.joinDate || '')
        Taro.showToast({ title: '已恢复表单信息，请重新上传文件', icon: 'none', duration: 3000 })
      }
    } catch (e) {
      console.error('恢复草稿失败:', e)
    }
  }

  // 学历变更时，清空已上传的学历学位证书
  const handleEducationChange = (e) => {
    const newEdu = EDUCATION_OPTIONS[e.detail.value]?.value || ''
    setEducation(newEdu)

    // 只删除不属于新学历槽位范围的文件，保留仍有效的证书
    const newRange = getEduSlotRange(newEdu)
    if (newRange.end >= newRange.start) {
      // 新学历可见的 slot keys
      const visibleSlotKeys = EDU_CERT_SLOTS.slice(newRange.start, newRange.end + 1).map(s => s.key)
      // 只移除不再属于新学历范围的文件
      const remainingFiles = uploadedFiles.filter(f => {
        const isEduFile = EDU_CERT_SLOTS.some(s => s.key === f.fileType)
        if (!isEduFile) return true  // 非学历文件保留
        return visibleSlotKeys.includes(f.fileType)  // 新学历范围内的文件保留
      })
      setUploadedFiles(remainingFiles)
      saveDraft(name, phone, newEdu, joinDate, remainingFiles)
    } else {
      // 未选择学历，清除所有学历文件
      const eduKeys = EDU_CERT_SLOTS.map(s => s.key)
      const remainingFiles = uploadedFiles.filter(f => !eduKeys.includes(f.fileType))
      setUploadedFiles(remainingFiles)
      saveDraft(name, phone, newEdu, joinDate, remainingFiles)
    }
  }

  // 选择并上传文件
  const handleChooseFile = async (fileType: string, skipVerify = false) => {
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

      if (config.accept === 'mixed') {
        // 混合模式：弹出选择菜单，让用户选"拍照/相册"或"选择PDF文件"
        const { tapIndex } = await Taro.showActionSheet({
          itemList: ['拍照或从相册选择', '选择PDF文件'],
        })
        if (tapIndex === 0) {
          // 拍照/相册
          const res = await Taro.chooseImage({
            count: config.maxCount - currentCount,
            sizeType: ['compressed'],
            sourceType: ['album', 'camera'],
          })
          files = res.tempFiles
        } else {
          // 选择PDF文件
          const res = await Taro.chooseMessageFile({
            count: config.maxCount - currentCount,
            type: 'file',
            extension: ['pdf'],
          })
          files = res.tempFiles
        }
      } else if (config.accept === 'image') {
        const res = await Taro.chooseImage({
          count: config.maxCount - currentCount,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
        })
        files = res.tempFiles
      } else {
        // accept === 'file'：选择文件
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
          // 前端文件大小校验
          if (file.size > MAX_FILE_SIZE) {
            Taro.showToast({ title: `文件${file.name || ''}超过10MB限制`, icon: 'none' })
            continue
          }

          console.log('上传文件:', file.name, '大小:', file.size, '类型:', fileType)

          // 判断是否需要AI校验（图片类型都需要，除非 skipVerify=true）
          const needsVerify = !skipVerify && config.accept === 'image' && !SKIP_VERIFY_TYPES.includes(fileType)
          if (needsVerify) {
            setVerifyingType(fileType)
            Taro.showToast({ title: 'AI校验中，请稍候...', icon: 'none', duration: 10000 })
          }

          // 上传时传递 fileType、education 和 skipVerify 参数
          const uploadRes = await Network.uploadFile({
            url: `/api/hr/files/upload?fileType=${encodeURIComponent(fileType)}&education=${encodeURIComponent(education)}${skipVerify ? '&skipVerify=1' : ''}`,
            filePath: file.path,
            name: 'file',
          })
          const data = JSON.parse(uploadRes.data as string)
          console.log('上传响应: code=', data.code)

          // 隐藏校验中的toast
          Taro.hideToast()
          setVerifyingType(null)

          if (data.code === 200) {
            const fileKey = data.data.fileKey
            const verification: VerificationResult | null = data.data.verification

            if (verification && !verification.verified) {
              console.log('证件校验未通过:', verification.reason)
              // 弹出选择弹窗：重新上传 或 仍然提交
              // 同时保存本地临时路径供预览
              setVerifyFailInfo({ reason: verification.reason || '上传的图片不符合要求', fileType, fileData: { ...data.data, localPath: file.path } })
              setShowVerifyFailModal(true)
            } else {
              const newFiles = [...uploadedFiles, {
                fileType,
                fileName: data.data.fileName,
                filePath: file.path,  // 使用本地临时文件路径预览，不依赖服务端URL
                fileSize: data.data.fileSize,
                fileKey,
                fileMimetype: data.data.fileMimetype,
                uploadToken: data.data.uploadToken,  // 提交时需要此 token 验证文件归属
                verificationOverride: skipVerify ? true : undefined,
              }]
              setUploadedFiles(newFiles)
              saveDraft(name, phone, education, joinDate, newFiles)

              if (verification) {
                setVerificationResults(prev => new Map(prev).set(fileKey, verification))
              }

              if (skipVerify) {
                Taro.showToast({ title: '已添加（待HR确认）', icon: 'none' })
              } else if (verification) {
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
          Taro.hideToast()
          setVerifyingType(null)
          Taro.showToast({ title: error?.data?.message || error?.message || '上传失败', icon: 'none' })
        }
      }
      setIsUploading(false)
    } catch (error: any) {
      setIsUploading(false)
      setVerifyingType(null)
      if (error.errMsg && !error.errMsg.includes('cancel')) {
        console.error('选择文件失败:', error)
        Taro.showToast({ title: '选择文件失败', icon: 'none' })
      }
    }
  }

  const handleDeleteFile = (fileKey: string) => {
    if (submittedData) return
    const remainingFiles = uploadedFiles.filter(f => f.fileKey !== fileKey)
    setUploadedFiles(remainingFiles)
    setVerificationResults(prev => {
      const next = new Map(prev)
      next.delete(fileKey)
      return next
    })
    saveDraft(name, phone, education, joinDate, remainingFiles)
  }

  // 处理校验未通过 - 仍然提交（申诉覆盖）
  // 后端校验失败时保留了文件，直接用返回的 fileData 标记 override 加入列表
  const handleVerifyOverride = () => {
    if (verifyFailInfo && verifyFailInfo.fileData) {
      const data = verifyFailInfo.fileData
      const newFiles = [...uploadedFiles, {
        fileType: verifyFailInfo.fileType,
        fileName: data.fileName,
        filePath: data.localPath || '',  // 使用本地临时路径预览
        fileSize: data.fileSize,
        fileKey: data.fileKey,
        fileMimetype: data.fileMimetype,
        uploadToken: data.uploadToken,  // 提交时需要此 token
        verificationOverride: true,
      }]
      setUploadedFiles(newFiles)
      saveDraft(name, phone, education, joinDate, newFiles)
      Taro.showToast({ title: '已添加（待HR确认）', icon: 'none' })
    }
    setShowVerifyFailModal(false)
    setVerifyFailInfo(null)
  }

  // 处理校验未通过 - 重新上传
  const handleVerifyReject = () => {
    // 删除服务端保留的校验失败文件
    if (verifyFailInfo?.fileData?.fileKey && verifyFailInfo?.fileData?.uploadToken) {
      Network.request({
        url: '/api/hr/files/cleanup',
        method: 'POST',
        data: {
          key: verifyFailInfo.fileData.fileKey,
          uploadToken: verifyFailInfo.fileData.uploadToken,
        },
      }).catch(() => {})  // 静默处理，不影响用户体验
    }
    setShowVerifyFailModal(false)
    setVerifyFailInfo(null)
  }

  // ===== 签字确认功能 =====
  const SIGNATURE_CANVAS_ID = 'signatureCanvas'
  const canvasNodeRef = useRef<any>(null)

  const handleOpenSignDialog = () => {
    if (!agreed) {
      Taro.showToast({ title: '请先勾选同意声明', icon: 'none' })
      return
    }
    setShowSignDialog(true)
    // 延迟初始化画布，确保DOM已渲染
    setTimeout(() => {
      try {
        const query = Taro.createSelectorQuery()
        query.select(`#${SIGNATURE_CANVAS_ID}`).fields({ node: true, size: true }).exec((res) => {
          if (res && res[0]) {
            const canvas = res[0].node
            if (canvas) {
              canvasNodeRef.current = canvas
              const ctx = canvas.getContext('2d')
              const dpr = Taro.getSystemInfoSync().pixelRatio
              canvas.width = res[0].width * dpr
              canvas.height = res[0].height * dpr
              ctx.scale(dpr, dpr)
              ctx.strokeStyle = '#000000'
              ctx.lineWidth = 3
              ctx.lineCap = 'round'
              ctx.lineJoin = 'round'
            }
          }
        })
      } catch (e) {
        // Canvas 初始化失败降级处理
        console.log('Canvas初始化异常')
      }
    }, 300)
  }

  const handleCanvasTouchStart = (e: any) => {
    try {
      const query = Taro.createSelectorQuery()
      query.select(`#${SIGNATURE_CANVAS_ID}`).fields({ node: true, size: true }).exec((res) => {
        if (res && res[0] && res[0].node) {
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const touch = e.touches[0]
          ctx.beginPath()
          ctx.moveTo(touch.x, touch.y)
        }
      })
    } catch (_) {}
  }

  const handleCanvasTouchMove = (e: any) => {
    try {
      const query = Taro.createSelectorQuery()
      query.select(`#${SIGNATURE_CANVAS_ID}`).fields({ node: true, size: true }).exec((res) => {
        if (res && res[0] && res[0].node) {
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const touch = e.touches[0]
          ctx.lineTo(touch.x, touch.y)
          ctx.stroke()
        }
      })
    } catch (_) {}
  }

  const handleClearSign = () => {
    try {
      const canvas = canvasNodeRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        const dpr = Taro.getSystemInfoSync().pixelRatio
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      }
    } catch (_) {}
  }

  const handleConfirmSign = async () => {
    try {
      setIsSigning(true)
      // 将 Canvas 导出为临时图片（Canvas 2D 模式需传入 canvas 节点）
      const tempFilePath = await new Promise<string>((resolve, reject) => {
        const options: any = {
          fileType: 'png',
          quality: 1,
          success: (res: any) => resolve(res.tempFilePath),
          fail: (err: any) => reject(err),
        }
        // Canvas 2D 模式优先使用 canvas 节点
        if (canvasNodeRef.current) {
          options.canvas = canvasNodeRef.current
        } else {
          options.canvasId = SIGNATURE_CANVAS_ID
        }
        Taro.canvasToTempFilePath(options as any)
      })

      // 上传签字图片
      const uploadRes = await Network.uploadFile({
        url: '/api/hr/files/upload?fileType=signature&education=bachelor&skipVerify=1',
        filePath: tempFilePath,
        name: 'file',
      })

      const data = uploadRes.data
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      if (parsed.code === 200) {
        const sigFile: FileInfo = {
          fileType: 'signature',
          fileName: '签字确认.png',
          filePath: tempFilePath,
          fileSize: 0,
          fileKey: parsed.data.fileKey,
          fileMimetype: 'image/png',
          uploadToken: parsed.data.uploadToken,
        }
        setSignatureFile(sigFile)
        setShowSignDialog(false)
        Taro.showToast({ title: '签字成功', icon: 'success' })
      } else {
        Taro.showToast({ title: parsed.msg || '签字上传失败', icon: 'none' })
      }
    } catch (err: any) {
      Taro.showToast({ title: '签字保存失败，请重试', icon: 'none' })
    } finally {
      setIsSigning(false)
    }
  }

  const handleResign = () => {
    setSignatureFile(null)
    // 延迟打开签字面板
    setTimeout(() => handleOpenSignDialog(), 100)
  }

  const handleSubmit = async () => {
    if (!name.trim()) { Taro.showToast({ title: '请输入姓名', icon: 'none' }); return }
    if (!phone.trim()) { Taro.showToast({ title: '请输入手机号', icon: 'none' }); return }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) { Taro.showToast({ title: '请输入正确的11位手机号', icon: 'none' }); return }
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

    // 校验签字确认
    if (!agreed) {
      Taro.showToast({ title: '请先勾选同意声明', icon: 'none' })
      return
    }
    if (!signatureFile) {
      Taro.showToast({ title: '请完成手写签字', icon: 'none' })
      return
    }

    try {
      setIsUploading(true)
      const res = await Network.request({
        url: '/api/hr/employees',
        method: 'POST',
        data: {
          name, phone, education, join_date: joinDate,
          files: [
            ...uploadedFiles.map(f => ({
              fileType: f.fileType,
              fileKey: f.fileKey,
              fileName: f.fileName,
              fileSize: f.fileSize,
              fileMimetype: f.fileMimetype,
              uploadToken: f.uploadToken,
              verificationOverride: f.verificationOverride || false,
            })),
            {
              fileType: signatureFile.fileType,
              fileKey: signatureFile.fileKey,
              fileName: signatureFile.fileName,
              fileSize: signatureFile.fileSize,
              fileMimetype: signatureFile.fileMimetype,
              uploadToken: signatureFile.uploadToken,
              verificationOverride: false,
            },
          ],
        },
      })
      console.log('提交响应: code=', res.data?.code)
      if (res.data.code === 200) {
        clearDraft()
        const submittedEmployee = { name, phone, education, join_date: joinDate, status: 'submitted' }
        const submittedFiles = [
          ...uploadedFiles.map(f => ({
            file_type: f.fileType,
            file_name: f.fileName,
            url: f.filePath,
            file_size: f.fileSize,
            file_type_ext: f.fileMimetype,
          })),
          {
            file_type: signatureFile.fileType,
            file_name: signatureFile.fileName,
            url: signatureFile.filePath,
            file_size: signatureFile.fileSize,
            file_type_ext: signatureFile.fileMimetype,
          },
        ]
        saveSubmittedData(submittedEmployee, uploadedFiles)
        setSubmittedData({
          employee: submittedEmployee,
          files: submittedFiles,
        })
        Taro.showToast({ title: '提交成功', icon: 'success' })
      } else {
        throw new Error(res.data.msg || '提交失败')
      }
    } catch (error: any) {
      console.error('提交失败:', error)
      // 从 Taro 错误对象中提取后端返回的业务错误消息
      const errMsg = error?.data?.message || error?.message || error?.errMsg || '提交失败'
      Taro.showToast({ title: errMsg, icon: 'none', duration: 3000 })
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
    const isImage = isImageByMimetype(file?.fileMimetype)
    const verifyResult = file ? verificationResults.get(file.fileKey) : undefined
    const isVerifying = verifyingType === fileType

    if (isVerifying) {
      // AI校验中
      return (
        <View className="border-2 border-blue-300 rounded-lg overflow-hidden relative" style={{ minHeight: '200rpx' }}>
          <View className="absolute inset-0 bg-blue-50 bg-opacity-80 flex flex-col items-center justify-center">
            <View className="animate-spin">
              <LoaderCircle size={28} color="#2563eb" />
            </View>
            <Text className="block text-xs text-blue-600 mt-2">AI校验中...</Text>
          </View>
        </View>
      )
    }

    if (isUploaded && file) {
      // 已上传 - 展示预览
      return (
        <View className="border border-green-200 rounded-lg overflow-hidden relative">
          {isImage && file.filePath ? (
            <View
              className="relative"
              onClick={() => previewImage(file.filePath!)}
            >
              <Image src={file.filePath} mode="aspectFill" style={{ width: '100%', height: '200rpx' }} />
              {verifyResult?.verified && (
                <View className="absolute top-1 left-1">
                  <CircleCheck size={16} color="#16a34a" />
                </View>
              )}
              {file.verificationOverride && (
                <View className="absolute top-1 right-7 bg-yellow-100 rounded-full px-1">
                  <Text className="block text-yellow-700" style={{ fontSize: '8px' }}>待复核</Text>
                </View>
              )}
            </View>
          ) : (
            <View className="p-3 flex flex-col items-center justify-center" style={{ minHeight: '160rpx' }}>
              <FileText size={24} color="#6b7280" />
              <Text className="block text-xs text-gray-500 mt-1 truncate w-full text-center">{file.fileName}</Text>
            </View>
          )}
          <View className="p-2 bg-green-50 flex items-center justify-center">
            <Text className="block text-xs text-green-700">{label}</Text>
          </View>
          {!submittedData && (
            <View
              className="absolute top-1 right-1 bg-black bg-opacity-50 rounded-full p-1"
              onClick={(e) => { e.stopPropagation && e.stopPropagation(); handleDeleteFile(file.fileKey) }}
            >
              <Trash2 size={12} color="#ffffff" />
            </View>
          )}
        </View>
      )
    }

    // 未上传 - 占位
    return (
      <View
        className="border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center relative"
        style={{ borderColor: '#d1d5db', minHeight: '128rpx' }}
        onClick={() => handleChooseFile(fileType)}
      >
        <View className="text-center">
          <ImagePlus size={24} color="#9ca3af" className="mx-auto mb-1" />
          <Text className="block text-xs text-gray-400">{label}</Text>
        </View>
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
                      const isImage = isImageByMimetype(file.fileMimetype)
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
              <View className="mt-3 flex flex-col gap-2">
                {uploadedFiles.filter(f => f.fileType === 'medical_report').map(file => {
                  const isImg = file.fileMimetype?.startsWith('image/')
                  return (
                    <View key={file.fileKey} className="bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-3">
                      {isImg && file.filePath ? (
                        <View
                          className="border border-gray-200 rounded overflow-hidden flex-shrink-0"
                          onClick={() => previewImage(file.filePath!)}
                        >
                          <Image src={file.filePath} mode="aspectFill" style={{ width: '96rpx', height: '96rpx' }} />
                        </View>
                      ) : (
                        <View className="flex-shrink-0 p-2 bg-white rounded border border-gray-200">
                          <FileText size={20} color="#dc2626" />
                        </View>
                      )}
                      <View className="flex-1 min-w-0 flex items-center gap-1">
                        <Text className="block text-sm text-gray-700 truncate">{file.fileName}</Text>
                        {file.verificationOverride && (
                          <Text className="block text-xs text-yellow-600 flex-shrink-0">待复核</Text>
                        )}
                      </View>
                      <View onClick={() => handleDeleteFile(file.fileKey)}>
                        <Trash2 size={16} color="#dc2626" />
                      </View>
                    </View>
                  )
                })}
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

      {/* 签字确认 */}
      <Card>
        <CardContent className="p-4">
          <Text className="block text-base font-medium text-gray-900 mb-3">签字确认</Text>

          <View className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <Text className="block text-sm text-gray-800 leading-6">
              本人郑重声明：以上材料全部属实，并愿意接受相关背景核查。若填报事项与事实不符，本人愿意承担由此引起的责任及后果（包括并不限于无条件解除劳动合同）。
            </Text>
          </View>

          <View className="flex items-start mb-4" onClick={() => setAgreed(!agreed)}>
            <View className={`flex-shrink-0 w-5 h-5 rounded border-2 mt-1 flex items-center justify-center ${agreed ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'}`}>
              {agreed && <Text className="text-white text-xs">✓</Text>}
            </View>
            <Text className="block text-sm text-gray-700 ml-2">本人已阅读并同意以上声明</Text>
          </View>

          {signatureFile ? (
            <View className="border border-gray-200 rounded-lg p-3">
              <Text className="block text-sm text-gray-500 mb-2">已签字：</Text>
              <Image src={signatureFile.filePath} mode="widthFix" className="w-full" style={{ maxHeight: '120px' }} />
              <View className="mt-2">
                <Button size="sm" variant="outline" onClick={handleResign}>重新签字</Button>
              </View>
            </View>
          ) : (
            <Button className="w-full" onClick={handleOpenSignDialog} disabled={!agreed}>
              手写签字
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 提交按钮 */}
      <Button className="w-full" onClick={handleSubmit} disabled={isUploading || !agreed || !signatureFile}>
        {isUploading ? '提交中...' : '提交资料'}
      </Button>

      {/* AI校验未通过弹窗 */}
      {showVerifyFailModal && verifyFailInfo && (
        <View className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={handleVerifyReject}>
          <View className="bg-white rounded-xl mx-8 p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation && e.stopPropagation()}>
            <Text className="block text-lg font-semibold text-gray-900 mb-2">资料校验未通过</Text>
            <Text className="block text-sm text-gray-600 mb-4">{verifyFailInfo.reason}</Text>
            <View className="flex flex-col gap-3">
              <Button className="w-full" onClick={handleVerifyReject}>
                重新上传
              </Button>
              <Button className="w-full" variant="outline" onClick={handleVerifyOverride}>
                仍然提交
              </Button>
              <Text className="block text-xs text-gray-400 text-center">选择&ldquo;仍然提交&rdquo;后，HR将会人工复核此文件</Text>
            </View>
          </View>
        </View>
      )}

      {/* 签字面板弹窗 */}
      {showSignDialog && (
        <View className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <View className="bg-white rounded-xl mx-4 p-4 w-full max-w-sm">
            <Text className="block text-lg font-semibold text-gray-900 mb-3 text-center">手写签字</Text>
            <View className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white mb-4">
              <Canvas
                id={SIGNATURE_CANVAS_ID}
                canvasId={SIGNATURE_CANVAS_ID}
                type="2d"
                style={{ width: '100%', height: '200px' }}
                onTouchStart={handleCanvasTouchStart}
                onTouchMove={handleCanvasTouchMove}
              />
            </View>
            <Text className="block text-xs text-gray-400 text-center mb-4">请在上方区域手写签名</Text>
            <View style={{ display: 'flex', flexDirection: 'row', gap: '12px' }}>
              <View style={{ flex: 1 }}>
                <Button variant="outline" onClick={handleClearSign} className="w-full">清除</Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button onClick={handleConfirmSign} disabled={isSigning} className="w-full">
                  {isSigning ? '保存中...' : '确认签字'}
                </Button>
              </View>
            </View>
            <View className="mt-3">
              <Button variant="ghost" onClick={() => setShowSignDialog(false)} className="w-full">取消</Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

export default IndexPage
