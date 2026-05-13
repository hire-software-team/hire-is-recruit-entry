import { useState, useEffect, useRef } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useUnload, useDidHide } from '@tarojs/taro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Network } from '@/network'
import { ArrowLeft, Lock, LockOpen, Download, Trash2, CircleCheck, TriangleAlert, Eye } from 'lucide-react-taro'

const FILE_TYPE_GROUPS = [
  { label: '个人照片', types: ['photo'] },
  { label: '身份证', types: ['id_card_front', 'id_card_back'] },
  { label: '学历学位证书', types: ['diploma', 'degree', 'master_diploma', 'master_degree', 'doctor_diploma', 'doctor_degree'] },
  { label: '体检报告', types: ['medical_report'] },
  { label: '离职证明', types: ['resignation_proof'] },
  { label: '银行卡', types: ['bank_card_front', 'bank_card_back'] },
  { label: '签字确认', types: ['signature'] },
]

const FILE_TYPE_LABELS: Record<string, string> = {
  photo: '个人照片',
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
  signature: '签字确认',
}

interface EmployeeFile {
  id: number
  file_type: string
  file_name: string
  file_key: string
  file_type_ext: string
  file_size: number
  verification_override?: boolean
  signed_url?: string
  url?: string
}

interface Employee {
  id: number
  name: string
  phone: string
  status: string
  lock_source?: string
  locked_by?: number
  locked_at?: string
  viewing_count?: number
  hr_contact?: string
  join_date?: string
  education?: string
  created_at: string
}

interface EmployeeDetail {
  employee: Employee
  files: EmployeeFile[]
}

export default function HrAdminDetail() {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLockConfirm, setShowLockConfirm] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'lock' | 'unlock'>('lock')
  const [previewFile, setPreviewFile] = useState<EmployeeFile | null>(null)
  const detailRef = useRef<EmployeeDetail | null>(null)
  const exitCalledRef = useRef(false)

  const router = Taro.getCurrentInstance()
  const employeeId = router.router?.params?.employeeId
  const token = router.router?.params?.token || Taro.getStorageSync('hr_token')
  const adminRole = router.router?.params?.adminRole || Taro.getStorageSync('hr_role')

  const isLevel3 = adminRole === 'level3'

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  const callExitView = async () => {
    if (exitCalledRef.current) return
    const empId = detailRef.current?.employee?.id || employeeId
    if (!empId || !token) return
    exitCalledRef.current = true
    try {
      await Network.request({
        url: `/api/hr/employees/${empId}/exit-view`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
      })
      console.log('exit-view success')
    } catch (e) {
      console.log('exit-view error:', e)
    }
  }

  // Load employee detail
  useEffect(() => {
    if (!employeeId || !token) {
      Taro.showToast({ title: '参数错误', icon: 'none' })
      setLoading(false)
      return
    }
    loadDetail()
  }, [])

  const loadDetail = async () => {
    try {
      setLoading(true)
      const res = await Network.request({
        url: `/api/hr/employees/${employeeId}`,
        header: { Authorization: `Bearer ${token}` },
      })
      if (res.data.code === 200) {
        setDetail(res.data.data)
        // Enter view
        try {
          await Network.request({
            url: `/api/hr/employees/${employeeId}/enter-view`,
            method: 'POST',
            header: { Authorization: `Bearer ${token}` },
          })
        } catch (e) {
          console.log('enter-view error:', e)
        }
      } else {
        const msg = res.data.message || res.data.msg
        if (res.data.statusCode === 404 || (msg && msg.includes('不存在'))) {
          Taro.showToast({ title: '资料已被其他管理员删除', icon: 'none', duration: 2000 })
          setTimeout(() => Taro.navigateBack(), 1500)
        } else {
          Taro.showToast({ title: msg || '获取详情失败', icon: 'none' })
        }
      }
    } catch (error: any) {
      const msg = error?.data?.message || error?.data?.msg || error?.message
      if (error?.data?.statusCode === 404 || (msg && msg.includes('不存在'))) {
        Taro.showToast({ title: '资料已被其他管理员删除', icon: 'none', duration: 2000 })
        setTimeout(() => Taro.navigateBack(), 1500)
      } else {
        Taro.showToast({ title: msg || '获取详情失败', icon: 'none' })
      }
    } finally {
      setLoading(false)
    }
  }

  // Exit view on page hide/unload
  useDidHide(() => {
    callExitView()
  })

  useUnload(() => {
    callExitView()
  })

  // Also handle H5 beforeunload
  useEffect(() => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP || Taro.getEnv() === Taro.ENV_TYPE.TT) return
    const handleBeforeUnload = () => {
      const empId = detailRef.current?.employee?.id || employeeId
      const t = Taro.getStorageSync('hr_token')
      if (empId && t) {
        const url = `/api/hr/employees/${empId}/exit-view`
        navigator?.sendBeacon?.(url)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [employeeId])

  const handleBack = () => {
    callExitView()
    Taro.navigateBack()
  }

  const handleLockToggle = () => {
    if (!detail) return
    const isManualLock = detail.employee.lock_source === 'manual'
    setConfirmAction(isManualLock ? 'unlock' : 'lock')
    setShowLockConfirm(true)
  }

  const confirmLockAction = async () => {
    if (!detail) return
    try {
      const action = confirmAction
      const res = await Network.request({
        url: `/api/hr/employees/${detail.employee.id}/lock`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
        data: { action },
      })
      if (res.data.code === 200) {
        Taro.showToast({ title: action === 'lock' ? '已手动锁定' : '已解锁', icon: 'success' })
        setDetail({
          ...detail,
          employee: {
            ...detail.employee,
            lock_source: res.data.data.lockSource,
          },
        })
      } else {
        Taro.showToast({ title: res.data.message || res.data.msg || '操作失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error?.data?.message || error?.data?.msg || error?.message || '操作失败', icon: 'none' })
    }
    setShowLockConfirm(false)
  }

  const handleDelete = async () => {
    if (!detail) return
    const res = await Taro.showModal({
      title: '确认删除',
      content: `确定要删除${detail.employee.name}的所有资料吗？此操作不可撤销`,
    })
    if (!res.confirm) return

    try {
      const result = await Network.request({
        url: `/api/hr/employees/${detail.employee.id}/delete`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
      })
      if (result.data.code === 200) {
        Taro.showToast({ title: '删除成功', icon: 'success' })
        callExitView()
        setTimeout(() => Taro.navigateBack(), 1000)
      } else {
        Taro.showToast({ title: result.data.message || result.data.msg || '删除失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error?.data?.message || error?.data?.msg || error?.message || '删除失败', icon: 'none' })
    }
  }

  const handleDownload = async () => {
    if (!detail) return
    try {
      Taro.showLoading({ title: '打包下载中...' })
      const res = await Network.request({
        url: `/api/hr/employees/${detail.employee.id}/download`,
        header: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
      })
      Taro.hideLoading()
      // @ts-ignore
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${detail.employee.name}_资料.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({ title: '下载失败', icon: 'none' })
    }
  }

  const handleVerifyFile = async (file: EmployeeFile, override: boolean) => {
    try {
      const res = await Network.request({
        url: `/api/hr/employees/${detail!.employee.id}/files/${file.id}/verify`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
        data: { verification_override: override },
      })
      if (res.data.code === 200) {
        setDetail({
          ...detail!,
          files: detail!.files.map(f =>
            f.id === file.id ? { ...f, verification_override: override } : f
          ),
        })
        Taro.showToast({ title: override ? '标记待复核' : '标记已通过', icon: 'success' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error?.data?.message || error?.data?.msg || '操作失败', icon: 'none' })
    }
  }

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = { submitted: '已提交', locked: '已锁定', draft: '草稿' }
    return map[status] || status
  }

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = { submitted: 'bg-blue-100 text-blue-700', locked: 'bg-red-100 text-red-700', draft: 'bg-gray-100 text-gray-700' }
    return map[status] || 'bg-gray-100 text-gray-700'
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}:${s}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + 'B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
  }

  if (loading) {
    return (
      <View className="flex items-center justify-center h-screen">
        <Text className="block text-gray-500">加载中...</Text>
      </View>
    )
  }

  if (!detail) {
    return (
      <View className="flex items-center justify-center h-screen">
        <Text className="block text-gray-500">加载失败</Text>
      </View>
    )
  }

  const { employee, files } = detail

  return (
    <View className="min-h-screen bg-gray-50 pb-20">
      {/* Sticky header */}
      <View className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
        <View onClick={handleBack} style={{ padding: '4px', marginRight: '8px' }}>
          <ArrowLeft size={20} color="#333" />
        </View>
        <Text className="block text-lg font-semibold flex-1">{employee.name}的资料</Text>
        <Badge className={getStatusColor(employee.status)}>{getStatusLabel(employee.status)}</Badge>
      </View>

      {/* Lock source indicator */}
      {employee.status === 'locked' && employee.lock_source && (
        <View className="mx-4 mt-3 p-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <Eye size={14} color="#d97706" className="mr-2" />
          <Text className="block text-xs text-amber-700">
            {employee.lock_source === 'auto' ? '查看中自动锁定' : '手动锁定'}
          </Text>
        </View>
      )}

      {/* Basic info */}
      <View className="px-4 mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <View className="flex justify-between">
              <Text className="block text-sm text-gray-500">姓名</Text>
              <Text className="block text-sm font-medium">{employee.name}</Text>
            </View>
            <View className="flex justify-between">
              <Text className="block text-sm text-gray-500">手机号</Text>
              <Text className="block text-sm font-medium">{employee.phone}</Text>
            </View>
            {employee.hr_contact && (
              <View className="flex justify-between">
                <Text className="block text-sm text-gray-500">对接HR</Text>
                <Text className="block text-sm font-medium">{employee.hr_contact}</Text>
              </View>
            )}
            {employee.education && (
              <View className="flex justify-between">
                <Text className="block text-sm text-gray-500">学历</Text>
                <Text className="block text-sm font-medium">
                  {{ below_bachelor: '本科以下', bachelor: '本科', master: '硕士', doctor: '博士' }[employee.education] || employee.education}
                </Text>
              </View>
            )}
            {employee.join_date && (
              <View className="flex justify-between">
                <Text className="block text-sm text-gray-500">入职时间</Text>
                <Text className="block text-sm font-medium">{employee.join_date}</Text>
              </View>
            )}
            <View className="flex justify-between">
              <Text className="block text-sm text-gray-500">提交时间</Text>
              <Text className="block text-sm font-medium">{formatTime(employee.created_at)}</Text>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* File groups */}
      {FILE_TYPE_GROUPS.map((group) => {
        const groupFiles = files.filter(f => group.types.includes(f.file_type))
        if (groupFiles.length === 0) return null
        return (
          <View key={group.label} className="px-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{group.label}</CardTitle>
              </CardHeader>
              <CardContent>
                {groupFiles.map(file => {
                  const isPdf = file.file_type_ext?.includes('pdf') || file.file_name?.toLowerCase().endsWith('.pdf')
                  const isSignature = file.file_type === 'signature'
                  const isImage = !isPdf && !isSignature
                  return (
                    <View key={file.id} className="mb-3 last:mb-0">
                      <View className="flex items-center justify-between mb-1">
                        <Text className="block text-sm text-gray-600">
                          {FILE_TYPE_LABELS[file.file_type] || file.file_type}
                        </Text>
                        {!isLevel3 && (
                          <View className="flex items-center" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                            {file.verification_override ? (
                              <View
                                onClick={() => handleVerifyFile(file, false)}
                                className="flex items-center px-2 py-1 bg-green-50 rounded-full"
                              >
                                <CircleCheck size={12} color="#16a34a" />
                                <Text className="block text-xs text-green-700 ml-1">已通过</Text>
                              </View>
                            ) : (
                              <View
                                onClick={() => handleVerifyFile(file, true)}
                                className="flex items-center px-2 py-1 bg-amber-50 rounded-full"
                              >
                                <TriangleAlert size={12} color="#d97706" />
                                <Text className="block text-xs text-amber-700 ml-1">待复核</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                      {isImage ? (
                        <View className="rounded-lg overflow-hidden bg-gray-100" onClick={() => setPreviewFile(file)}>
                          <Image
                            src={file.signed_url || file.url || ''}
                            mode="aspectFill"
                            className="w-full h-32"
                            onError={() => {}}
                          />
                        </View>
                      ) : isSignature ? (
                        <View className="rounded-lg overflow-hidden bg-gray-100" onClick={() => setPreviewFile(file)}>
                          <Image
                            src={file.signed_url || file.url || ''}
                            mode="widthFix"
                            className="w-full"
                            onError={() => {}}
                          />
                        </View>
                      ) : (
                        <View
                          className="h-16 bg-gray-100 rounded-lg flex items-center justify-center px-3"
                          onClick={() => setPreviewFile(file)}
                        >
                          <Text className="block text-sm text-gray-500 truncate" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            PDF文件: {file.file_name}
                          </Text>
                        </View>
                      )}
                    </View>
                  )
                })}
              </CardContent>
            </Card>
          </View>
        )
      })}

      {/* Action buttons */}
      {!isLevel3 && (
        <View className="px-4 mt-6 space-y-3">
          <View className="flex gap-3" style={{ display: 'flex', flexDirection: 'row', gap: '12px' }}>
            <View style={{ flex: 1 }}>
              <Button
                onClick={handleLockToggle}
                variant="outline"
                className="w-full"
              >
                {employee.lock_source === 'manual' ? (
                  <View className="flex items-center" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <LockOpen size={16} color="#16a34a" className="mr-1" />
                    <Text>解锁资料</Text>
                  </View>
                ) : (
                  <View className="flex items-center" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <Lock size={16} color="#dc2626" className="mr-1" />
                    <Text>锁定资料</Text>
                  </View>
                )}
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button onClick={handleDownload} variant="outline" className="w-full">
                <View className="flex items-center" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                  <Download size={16} color="#2563eb" className="mr-1" />
                  <Text>下载</Text>
                </View>
              </Button>
            </View>
          </View>
          <Button onClick={handleDelete} variant="outline" className="w-full border-red-300 text-red-600">
            <View className="flex items-center" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
              <Trash2 size={16} color="#dc2626" className="mr-1" />
              <Text>删除资料</Text>
            </View>
          </Button>
        </View>
      )}

      {/* File preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => { if (!open) setPreviewFile(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{FILE_TYPE_LABELS[previewFile?.file_type || ''] || '文件详情'}</DialogTitle>
          </DialogHeader>
          {previewFile && (
            <View className="space-y-3">
              {(() => {
                const isPdf = previewFile.file_type_ext?.includes('pdf') || previewFile.file_name?.toLowerCase().endsWith('.pdf')
                const isSignature = previewFile.file_type === 'signature'
                if (!isPdf && !isSignature) {
                  return (
                    <View className="rounded-lg overflow-hidden bg-gray-50">
                      <Image
                        src={previewFile.signed_url || previewFile.url || ''}
                        mode="widthFix"
                        className="w-full"
                        onError={() => {}}
                      />
                    </View>
                  )
                }
                if (isSignature) {
                  return (
                    <View className="rounded-lg overflow-hidden bg-gray-50">
                      <Image
                        src={previewFile.signed_url || previewFile.url || ''}
                        mode="widthFix"
                        className="w-full"
                        onError={() => {}}
                      />
                    </View>
                  )
                }
                return (
                  <View className="p-4 bg-gray-50 rounded-lg">
                    <Text className="block text-sm text-gray-600">
                      PDF文件，请在下载后查看完整内容
                    </Text>
                  </View>
                )
              })()}
              <View className="space-y-2">
                <View className="flex justify-between">
                  <Text className="block text-sm text-gray-500">文件名</Text>
                  <Text className="block text-sm font-medium text-right" style={{ maxWidth: '60%' }}>{previewFile.file_name}</Text>
                </View>
                {previewFile.file_size > 0 && (
                  <View className="flex justify-between">
                    <Text className="block text-sm text-gray-500">文件大小</Text>
                    <Text className="block text-sm font-medium">{formatFileSize(previewFile.file_size)}</Text>
                  </View>
                )}
                <View className="flex justify-between">
                  <Text className="block text-sm text-gray-500">文件类型</Text>
                  <Text className="block text-sm font-medium">{previewFile.file_type_ext || '未知'}</Text>
                </View>
                <View className="flex justify-between items-center">
                  <Text className="block text-sm text-gray-500">审核状态</Text>
                  {previewFile.verification_override ? (
                    <View className="flex items-center px-2 py-1 bg-green-50 rounded-full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                      <CircleCheck size={12} color="#16a34a" />
                      <Text className="block text-xs text-green-700 ml-1">已通过</Text>
                    </View>
                  ) : (
                    <View className="flex items-center px-2 py-1 bg-amber-50 rounded-full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                      <TriangleAlert size={12} color="#d97706" />
                      <Text className="block text-xs text-amber-700 ml-1">待复核</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </DialogContent>
      </Dialog>

      {/* Lock confirm dialog */}
      {showLockConfirm && (
        <View className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View className="bg-white rounded-xl p-6 mx-8 w-80" style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '300px' }}>
            <Text className="block text-lg font-semibold text-center mb-3">
              {confirmAction === 'lock' ? '确认锁定' : '确认解锁'}
            </Text>
            <Text className="block text-sm text-gray-600 text-center mb-5">
              {confirmAction === 'lock'
                ? '手动锁定后，即使退出详情页资料也将保持锁定状态，直到您手动解锁'
                : '解锁后，退出详情页时资料将自动解锁（当前查看锁定会保持）'}
            </Text>
            <View className="flex gap-3" style={{ display: 'flex', flexDirection: 'row', gap: '12px' }}>
              <View style={{ flex: 1 }}>
                <Button variant="outline" onClick={() => setShowLockConfirm(false)} className="w-full">取消</Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button onClick={confirmLockAction} className="w-full">确认</Button>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
