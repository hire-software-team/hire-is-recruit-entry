import { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Download, Search, LogIn, User, Calendar, Phone, ArrowLeft, FileImage, FileText, Eye, GraduationCap, Settings, Trash2, TriangleAlert, Lock, LockOpen, Users, UserPlus, Shield, KeyRound } from 'lucide-react-taro'

interface EmployeeDetail {
  employee: {
    id: number
    name: string
    phone: string
    education: string | null
    join_date: string | null
    hr_contact: string | null
    status: string
    lock_source: string | null
    created_at: string
  }
  files: Array<{
    id: number
    file_type: string
    file_key: string
    file_name: string
    file_size: number
    file_type_ext: string
    verification_override: boolean
    url: string
    signed_url: string
  }>
}

const EDUCATION_LABELS: Record<string, string> = {
  below_bachelor: '本科以下',
  bachelor: '本科',
  master: '研究生',
  doctor: '博士生',
}

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
  // 兼容旧命名
  degree_cert_1: '学位证书1',
  degree_cert_2: '学位证书2',
  degree_cert_3: '学位证书3',
  degree_cert_4: '学位证书4',
}

const FILE_TYPE_GROUPS = [
  { label: '个人照片', types: ['photo'] },
  { label: '身份证', types: ['id_card_front', 'id_card_back'] },
  { label: '学历学位证书', types: ['diploma', 'degree', 'master_diploma', 'master_degree', 'doctor_diploma', 'doctor_degree', 'degree_cert_1', 'degree_cert_2', 'degree_cert_3', 'degree_cert_4'] },
  { label: '体检报告', types: ['medical_report'] },
  { label: '离职证明', types: ['resignation_proof'] },
  { label: '银行卡', types: ['bank_card_front', 'bank_card_back'] },
  { label: '签字确认', types: ['signature'] },
]

// 判断文件类型是否为图片（兼容 MIME 类型和扩展名两种格式）
const isImageFile = (fileTypeExt?: string): boolean => {
  if (!fileTypeExt) return false
  if (fileTypeExt.startsWith('image/')) return true
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
  return imageExts.includes(fileTypeExt.toLowerCase())
}

const HrAdminPage = () => {
  const [token, setToken] = useState<string>('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [adminRole, setAdminRole] = useState<string>('level1')  // level1 / level2 / level3
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<EmployeeDetail | null>(null)
  const [searchName, setSearchName] = useState('')

  // 修改密码相关状态
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')

  // 删除确认相关状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null)

  // 锁定相关状态
  const [showLockConfirm, setShowLockConfirm] = useState(false)
  const [lockingEmployeeId, setLockingEmployeeId] = useState<number | null>(null)
  const [lockingAction, setLockingAction] = useState<'lock' | 'unlock'>('lock')

  // 管理员管理相关状态
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [adminList, setAdminList] = useState<any[]>([])
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)
  const [newAdminUsername, setNewAdminUsername] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [newAdminRole, setNewAdminRole] = useState<string>('level2')
  const [newAdminHrContacts, setNewAdminHrContacts] = useState<string[]>([])
  const [editingAdmin, setEditingAdmin] = useState<any>(null)
  const [editAdminPassword, setEditAdminPassword] = useState('')
  const [editAdminHrContacts, setEditAdminHrContacts] = useState<string[]>([])
  const [deleteAdminId, setDeleteAdminId] = useState<number | null>(null)

  // 角色标签
  const ROLE_LABELS: Record<string, string> = {
    level1: '一级管理员',
    level2: '二级管理员',
    level3: '三级管理员',
  }

  // 登录
  const handleLogin = async () => {
    if (!username || !password) {
      Taro.showToast({ title: '请输入用户名和密码', icon: 'none' })
      return
    }

    try {
      setLoading(true)
      const res = await Network.request({
        url: '/api/hr/auth/login',
        method: 'POST',
        data: { username, password },
      })
      console.log('登录成功')

      if (res.data.code === 200) {
        setToken(res.data.data.token)
        setAdminRole(res.data.data.role || 'level1')
        setIsLoggedIn(true)
        Taro.showToast({ title: '登录成功', icon: 'success' })
        loadEmployeeList(res.data.data.token)
      } else {
        Taro.showToast({ title: res.data.msg || '登录失败', icon: 'none' })
      }
    } catch (error: any) {
      console.error('登录失败:', error)
      Taro.showToast({ title: '登录失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 修改密码
  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      Taro.showToast({ title: '请填写完整', icon: 'none' })
      return
    }
    if (newPwd.length < 6) {
      Taro.showToast({ title: '新密码至少6位', icon: 'none' })
      return
    }
    if (newPwd !== confirmPwd) {
      Taro.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }
    try {
      const res = await Network.request({
        url: '/api/hr/auth/change-password',
        method: 'POST',
        data: { currentPassword: currentPwd, newPassword: newPwd },
        header: { Authorization: `Bearer ${token}` },
      })
      console.log('修改密码成功')
      if (res.data.code === 200) {
        Taro.showToast({ title: '密码修改成功', icon: 'success' })
        setShowChangePwd(false)
        setCurrentPwd('')
        setNewPwd('')
        setConfirmPwd('')
      } else {
        Taro.showToast({ title: res.data.msg || '修改失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error.message || '修改失败', icon: 'none' })
    }
  }

  // 删除员工
  const handleDeleteEmployee = async () => {
    if (!deletingEmployeeId) return
    try {
      setLoading(true)
      const res = await Network.request({
        url: `/api/hr/employees/${deletingEmployeeId}/delete`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
      })
      console.log('删除员工成功')
      if (res.data.code === 200) {
        Taro.showToast({ title: '删除成功', icon: 'success' })
        setShowDeleteConfirm(false)
        setDeletingEmployeeId(null)
        setDetail(null)
        loadEmployeeList()
      } else {
        Taro.showToast({ title: res.data.msg || '删除失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error.message || '删除失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 锁定/解锁员工资料
  const handleLockEmployee = async () => {
    if (!lockingEmployeeId) return
    try {
      setLoading(true)
      const res = await Network.request({
        url: `/api/hr/employees/${lockingEmployeeId}/lock`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
        data: { action: lockingAction },
      })
      if (res.data.code === 200) {
        Taro.showToast({ title: lockingAction === 'lock' ? '锁定成功' : '解锁成功', icon: 'success' })
        setShowLockConfirm(false)
        setLockingEmployeeId(null)
        // 刷新详情
        if (detail) {
          const detailRes = await Network.request({
            url: `/api/hr/employees/${detail.employee.id}`,
            header: { Authorization: `Bearer ${token}` },
          })
          if (detailRes.data.code === 200) {
            setDetail(detailRes.data.data)
          }
        }
        loadEmployeeList()
      } else {
        Taro.showToast({ title: res.data.msg || '操作失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: error.message || '操作失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 加载员工列表
  const loadEmployeeList = async (authToken?: string) => {
    try {
      setLoading(true)
      const res = await Network.request({
        url: '/api/hr/employees',
        method: 'GET',
        header: {
          Authorization: `Bearer ${authToken || token}`,
        },
      })
      console.log('员工列表加载成功')

      if (res.data.code === 200) {
        setEmployees(res.data.data.employees || [])
      } else {
        Taro.showToast({ title: res.data.msg || '加载失败', icon: 'none' })
      }
    } catch (error: any) {
      console.error('加载员工列表失败:', error)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 查看员工详情
  const viewEmployeeDetail = async (employeeId: number) => {
    try {
      setLoading(true)
      const res = await Network.request({
        url: `/api/hr/employees/${employeeId}`,
        method: 'GET',
        header: {
          Authorization: `Bearer ${token}`,
        },
      })
      console.log('员工详情加载成功')

      if (res.data.code === 200) {
        setDetail(res.data.data)
        // 进入查看模式，自动锁定
        try {
          await Network.request({
            url: `/api/hr/employees/${employeeId}/enter-view`,
            method: 'POST',
            header: { Authorization: `Bearer ${token}` },
          })
          console.log('进入查看模式成功')
        } catch (e) {
          console.error('进入查看模式失败:', e)
        }
      } else {
        Taro.showToast({ title: res.data.msg || '获取详情失败', icon: 'none' })
      }
    } catch (error: any) {
      console.error('获取员工详情失败:', error)
      Taro.showToast({ title: '获取详情失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 退出员工详情页（退出查看模式，自动解锁）
  const exitDetailView = async () => {
    if (detail) {
      try {
        await Network.request({
          url: `/api/hr/employees/${detail.employee.id}/exit-view`,
          method: 'POST',
          header: { Authorization: `Bearer ${token}` },
        })
        console.log('退出查看模式成功')
      } catch (e) {
        console.error('退出查看模式失败:', e)
      }
    }
    setDetail(null)
  }

  // 下载员工资料
  const downloadEmployeeFiles = async (employeeId: number, employeeName: string) => {
    Taro.showModal({
      title: '下载确认',
      content: `是否下载 ${employeeName} 的所有资料？`,
      success: async (modalRes) => {
        if (modalRes.confirm) {
          try {
            const isMiniApp = [Taro.ENV_TYPE.WEAPP as string, Taro.ENV_TYPE.TT as string].includes(Taro.getEnv() as string)

            if (isMiniApp) {
              // 小程序环境：使用 downloadFile + saveFile + openDocument
              Taro.showLoading({ title: '打包下载中...' })
              const downloadRes = await Network.downloadFile({
                url: `/api/hr/employees/${employeeId}/download`,
                header: {
                  Authorization: `Bearer ${token}`,
                },
              })
              console.log('下载完成')

              if (downloadRes.statusCode === 200) {
                const tempFilePath = downloadRes.tempFilePath
                Taro.hideLoading()
                try {
                  const saveRes: any = await Taro.saveFile({ tempFilePath })
                  Taro.openDocument({
                    filePath: saveRes.savedFilePath || tempFilePath,
                    fileType: 'zip' as any,
                    fail: () => Taro.showToast({ title: '文件已保存', icon: 'success' }),
                  })
                } catch {
                  Taro.openDocument({
                    filePath: tempFilePath,
                    fileType: 'zip' as any,
                    fail: () => Taro.showToast({ title: '下载完成', icon: 'success' }),
                  })
                }
              } else {
                Taro.hideLoading()
                Taro.showToast({ title: '下载失败', icon: 'none' })
              }
            } else if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
              // H5 环境：通过 fetch 获取 blob 再下载
              Taro.showLoading({ title: '打包下载中...' })
              const downloadUrl = `/api/hr/employees/${employeeId}/download`

              const res = await fetch(downloadUrl, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              })
              Taro.hideLoading()

              if (res.ok) {
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${employeeName}-资料.zip`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                Taro.showToast({ title: '下载成功', icon: 'success' })
              } else {
                Taro.showToast({ title: '下载失败', icon: 'none' })
              }
            } else {
              Taro.showToast({ title: '当前环境暂不支持下载', icon: 'none' })
            }
          } catch (error) {
            Taro.hideLoading()
            console.error('下载失败:', error)
            Taro.showToast({ title: '下载失败', icon: 'none' })
          }
        }
      },
    })
  }

  // 预览图片
  const previewImage = (url: string, allImageUrls: string[]) => {
    Taro.previewImage({
      current: url,
      urls: allImageUrls,
    })
  }

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + 'B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
  }

  // 获取状态标签
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Badge variant="secondary">已提交</Badge>
      case 'locked':
        return <Badge variant="destructive">已锁定</Badge>
      case 'completed':
        return <Badge variant="default">已完成</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // 过滤员工列表
  const filteredEmployees = searchName
    ? employees.filter((e) => e.name.includes(searchName) || e.phone.includes(searchName))
    : employees

  // ==================== 管理员管理 ====================

  // 加载管理员列表
  const loadAdminList = async () => {
    try {
      setLoading(true)
      const res = await Network.request({
        url: '/api/hr/admins',
        method: 'GET',
        header: { Authorization: `Bearer ${token}` },
      })
      if (res.data.code === 200) {
        setAdminList(res.data.data || [])
      } else {
        Taro.showToast({ title: res.data.msg || '加载失败', icon: 'none' })
      }
    } catch (error: any) {
      Taro.showToast({ title: '加载管理员列表失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 创建管理员
  const handleCreateAdmin = async () => {
    if (!newAdminUsername || !newAdminPassword) {
      Taro.showToast({ title: '请填写用户名和密码', icon: 'none' })
      return
    }
    if (newAdminPassword.length < 6) {
      Taro.showToast({ title: '密码至少6位', icon: 'none' })
      return
    }
    if (newAdminHrContacts.length === 0) {
      Taro.showToast({ title: '请选择可查看的对接HR范围', icon: 'none' })
      return
    }
    try {
      const res = await Network.request({
        url: '/api/hr/admins',
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
        data: {
          username: newAdminUsername,
          password: newAdminPassword,
          role: newAdminRole,
          hrContacts: newAdminHrContacts,
        },
      })
      if (res.data.code === 200) {
        Taro.showToast({ title: '创建成功', icon: 'success' })
        setShowCreateAdmin(false)
        setNewAdminUsername('')
        setNewAdminPassword('')
        setNewAdminRole('level2')
        setNewAdminHrContacts([])
        loadAdminList()
      } else {
        Taro.showToast({ title: res.data.msg || '创建失败', icon: 'none' })
      }
    } catch (error: any) {
      const msg = error?.data?.message || error?.data?.msg || '创建失败'
      Taro.showToast({ title: msg, icon: 'none' })
    }
  }

  // 删除管理员
  const handleDeleteAdmin = async () => {
    if (!deleteAdminId) return
    try {
      const res = await Network.request({
        url: `/api/hr/admins/${deleteAdminId}/delete`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
      })
      if (res.data.code === 200) {
        Taro.showToast({ title: '删除成功', icon: 'success' })
        setDeleteAdminId(null)
        loadAdminList()
      } else {
        Taro.showToast({ title: res.data.msg || '删除失败', icon: 'none' })
      }
    } catch (error: any) {
      const msg = error?.data?.message || error?.data?.msg || '删除失败'
      Taro.showToast({ title: msg, icon: 'none' })
    }
  }

  // 修改管理员
  const handleUpdateAdmin = async () => {
    if (!editingAdmin) return
    if (editAdminHrContacts.length === 0 && !editAdminPassword) {
      Taro.showToast({ title: '请至少修改一项', icon: 'none' })
      return
    }
    try {
      const data: Record<string, any> = {}
      if (editAdminPassword) data.password = editAdminPassword
      if (editAdminHrContacts.length > 0) data.hrContacts = editAdminHrContacts

      const res = await Network.request({
        url: `/api/hr/admins/${editingAdmin.id}/update`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
        data,
      })
      if (res.data.code === 200) {
        Taro.showToast({ title: '修改成功', icon: 'success' })
        setEditingAdmin(null)
        setEditAdminPassword('')
        setEditAdminHrContacts([])
        loadAdminList()
      } else {
        Taro.showToast({ title: res.data.msg || '修改失败', icon: 'none' })
      }
    } catch (error: any) {
      const msg = error?.data?.message || error?.data?.msg || '修改失败'
      Taro.showToast({ title: msg, icon: 'none' })
    }
  }

  return (
    <View className="min-h-screen bg-gray-50">
      {/* =============== 详情视图 =============== */}
      {detail && (() => {
        const allImageUrls = detail.files
          .filter(f => isImageFile(f.file_type_ext))
          .map(f => f.signed_url || f.url)

        return (
          <View className="bg-gray-50 min-h-screen">
            {/* 顶部栏 */}
            <View className="bg-white border-b border-gray-200 p-4">
              <View className="flex items-center gap-3">
                <View onClick={() => exitDetailView()}>
                  <ArrowLeft size={20} color="#374151" />
                </View>
                <Text className="block text-lg font-bold text-gray-900">{detail.employee.name} 的资料</Text>
              </View>
            </View>

            <View className="p-4">
              {/* 员工基本信息 */}
              <Card className="mb-4">
                <CardContent className="p-4">
                  <Text className="block text-lg font-semibold text-gray-900 mb-3">基本信息</Text>
                  <Separator className="mb-3" />
                  <View className="flex flex-col gap-3">
                    <View className="flex items-center gap-2">
                      <User size={16} color="#6b7280" />
                      <Text className="block text-sm text-gray-500 w-16">姓名</Text>
                      <Text className="block text-sm text-gray-900 font-medium">{detail.employee.name}</Text>
                    </View>
                    <View className="flex items-center gap-2">
                      <Phone size={16} color="#6b7280" />
                      <Text className="block text-sm text-gray-500 w-16">手机号</Text>
                      <Text className="block text-sm text-gray-900 font-medium">{detail.employee.phone}</Text>
                    </View>
                    <View className="flex items-center gap-2">
                      <GraduationCap size={16} color="#6b7280" />
                      <Text className="block text-sm text-gray-500 w-16">学历</Text>
                      <Text className="block text-sm text-gray-900 font-medium">{EDUCATION_LABELS[detail.employee.education || ''] || detail.employee.education || '未填写'}</Text>
                    </View>
                    <View className="flex items-center gap-2">
                      <Calendar size={16} color="#6b7280" />
                      <Text className="block text-sm text-gray-500 w-16">入职日期</Text>
                      <Text className="block text-sm text-gray-900 font-medium">{detail.employee.join_date || '未填写'}</Text>
                    </View>
                    <View className="flex items-center gap-2">
                      <Users size={16} color="#6b7280" />
                      <Text className="block text-sm text-gray-500 w-16">对接HR</Text>
                      <Text className="block text-sm text-gray-900 font-medium">{detail.employee.hr_contact || '未填写'}</Text>
                    </View>
                    <View className="flex items-center gap-2">
                      <Text className="block text-sm text-gray-500 w-16">状态</Text>
                      {getStatusBadge(detail.employee.status)}
                      {detail.employee.status === 'locked' && detail.employee.lock_source === 'auto' && (
                        <Text className="block text-xs text-amber-600">查看中自动锁定</Text>
                      )}
                      {detail.employee.status === 'locked' && detail.employee.lock_source === 'manual' && (
                        <Text className="block text-xs text-red-600">手动锁定</Text>
                      )}
                    </View>
                  </View>
                </CardContent>
              </Card>

              {/* 资料列表 - 按类型分组 */}
              {FILE_TYPE_GROUPS.map(group => {
                const groupFiles = detail.files.filter(f => group.types.includes(f.file_type))
                if (groupFiles.length === 0) return null

                return (
                  <Card key={group.label} className="mb-4">
                    <CardContent className="p-4">
                      <View className="flex justify-between items-center mb-3">
                        <Text className="block text-base font-semibold text-gray-900">{group.label}</Text>
                        <Text className="block text-xs text-gray-500">{groupFiles.length} 份</Text>
                      </View>
                      <Separator className="mb-3" />

                      {/* 图片类型 - 网格展示 */}
                      {group.label !== '体检报告' && (
                        <View className="grid grid-cols-2 gap-3">
                          {group.types.map(type => {
                            const file = groupFiles.find(f => f.file_type === type)
                            if (!file) {
                              return (
                                <View key={type} className="border-2 border-dashed border-gray-200 rounded-lg p-3 flex flex-col items-center justify-center" style={{ minHeight: '160rpx' }}>
                                  <Text className="block text-xs text-gray-400">{FILE_TYPE_LABELS[type] || type}</Text>
                                  <Text className="block text-xs text-gray-300 mt-1">未上传</Text>
                                </View>
                              )
                            }
                            const isImage = isImageFile(file.file_type_ext)
                            return (
                              <View
                                key={type}
                                className="border border-gray-200 rounded-lg overflow-hidden relative"
                                onClick={() => isImage && previewImage(file.signed_url || file.url, allImageUrls)}
                              >
                                {isImage ? (
                                  <Image src={file.signed_url || file.url} mode="aspectFill" style={{ width: '100%', height: '200rpx' }} />
                                ) : (
                                  <View className="p-3 flex flex-col items-center justify-center" style={{ minHeight: '160rpx' }}>
                                    <FileText size={24} color="#6b7280" />
                                  </View>
                                )}
                                {file.verification_override && (
                                  <View className="absolute top-1 right-1">
                                    <Badge variant="outline" className="bg-yellow-100 text-yellow-700 text-xs border-yellow-300">
                                      待复核
                                    </Badge>
                                  </View>
                                )}
                                <View className="p-2">
                                  <Text className="block text-xs text-gray-700 truncate">{FILE_TYPE_LABELS[type] || type}</Text>
                                  <Text className="block text-xs text-gray-400">{formatFileSize(file.file_size)}</Text>
                                </View>
                              </View>
                            )
                          })}
                        </View>
                      )}

                      {/* 体检报告 - 列表展示 */}
                      {group.label === '体检报告' && (
                        <View className="flex flex-col gap-2">
                          {groupFiles.map(file => {
                            const isImage = isImageFile(file.file_type_ext)
                            return (
                              <View key={file.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                {isImage ? (
                                  <View
                                    className="border border-gray-200 rounded overflow-hidden flex-shrink-0"
                                    onClick={() => previewImage(file.signed_url || file.url, allImageUrls)}
                                  >
                                    <Image src={file.signed_url || file.url} mode="aspectFill" style={{ width: '120rpx', height: '120rpx' }} />
                                  </View>
                                ) : (
                                  <View className="flex-shrink-0 p-2 bg-white rounded border border-gray-200">
                                    <FileText size={24} color="#dc2626" />
                                  </View>
                                )}
                                <View className="flex-1 min-w-0">
                                  <View className="flex items-center gap-1">
                                    <Text className="block text-sm text-gray-900 truncate">{file.file_name}</Text>
                                    {file.verification_override && (
                                      <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300" style={{ fontSize: '10px' }}>
                                        待复核
                                      </Badge>
                                    )}
                                  </View>
                                  <Text className="block text-xs text-gray-500 mt-1">{formatFileSize(file.file_size)}</Text>
                                </View>
                                <View className="flex-shrink-0">
                                  {isImage ? (
                                    <Eye size={18} color="#2563eb" />
                                  ) : (
                                    <FileImage size={18} color="#2563eb" />
                                  )}
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

              {/* 下载按钮 - level3 不可见 */}
              {adminRole !== 'level3' && (
                <Button
                  className="w-full mb-3"
                  onClick={() => downloadEmployeeFiles(detail.employee.id, detail.employee.name)}
                >
                  <Download size={16} color="#ffffff" className="mr-2" />
                  打包下载全部资料
                </Button>
              )}

              {/* 锁定/解锁按钮 - level3 不可见 */}
              {adminRole !== 'level3' && (
                <Button
                  className="w-full mb-3"
                  variant="outline"
                  onClick={() => {
                    setLockingEmployeeId(detail.employee.id)
                    // manual锁定 -> 解锁(恢复auto); auto锁定或未锁定 -> 手动锁定
                    setLockingAction(detail.employee.lock_source === 'manual' ? 'unlock' : 'lock')
                    setShowLockConfirm(true)
                  }}
                >
                  {detail.employee.lock_source === 'manual' ? (
                    <>
                      <LockOpen size={16} color="#2563eb" className="mr-2" />
                      解锁资料
                    </>
                  ) : (
                    <>
                      <Lock size={16} color="#f59e0b" className="mr-2" />
                      锁定资料
                    </>
                  )}
                </Button>
              )}

              {/* 删除按钮 - level3 不可见 */}
              {adminRole !== 'level3' && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    setDeletingEmployeeId(detail.employee.id)
                    setShowDeleteConfirm(true)
                  }}
                >
                  <Trash2 size={16} color="#dc2626" className="mr-2" />
                  删除员工资料
                </Button>
              )}
            </View>
          </View>
        )
      })()}

      {/* =============== 登录视图 =============== */}
      {!isLoggedIn && (
        <View className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <View className="mb-6">
                <Text className="block text-2xl font-bold text-center text-gray-900 mb-2">
                  HR 管理系统
                </Text>
                <Text className="block text-sm text-center text-gray-600">
                  请登录以查看员工资料
                </Text>
              </View>

              <View className="space-y-4">
                <View>
                  <Label className="mb-2">用户名</Label>
                  <View className="bg-gray-50 rounded-lg px-4 py-3">
                    <Input
                      className="w-full bg-transparent"
                      placeholder="请输入用户名"
                      value={username}
                      onInput={(e) => setUsername(e.detail.value)}
                    />
                  </View>
                </View>

                <View>
                  <Label className="mb-2">密码</Label>
                  <View className="bg-gray-50 rounded-lg px-4 py-3">
                    <Input
                      className="w-full bg-transparent"
                      type="text"
                      password
                      placeholder="请输入密码"
                      value={password}
                      onInput={(e) => setPassword(e.detail.value)}
                    />
                  </View>
                </View>

                <Button
                  className="w-full"
                  onClick={handleLogin}
                  disabled={loading}
                >
                  {loading ? '登录中...' : '登录'}
                </Button>


              </View>
            </CardContent>
          </Card>
        </View>
      )}

      {/* =============== 员工列表视图 =============== */}
      {isLoggedIn && !detail && !showAdminPanel && (
        <View>
          <View className="bg-white border-b border-gray-200 p-4">
            <View className="flex justify-between items-center mb-3">
              <View className="flex items-center gap-2">
                <Text className="block text-lg font-bold text-gray-900">
                  HR 管理系统
                </Text>
                <Badge variant={adminRole === 'level1' ? 'default' : adminRole === 'level2' ? 'secondary' : 'outline'}>
                  {ROLE_LABELS[adminRole]}
                </Badge>
              </View>
              <View className="flex items-center gap-3">
                {adminRole === 'level1' && (
                  <View onClick={() => { loadAdminList(); setShowAdminPanel(true) }}>
                    <Shield size={20} color="#2563eb" />
                  </View>
                )}
                <View onClick={() => setShowChangePwd(true)}>
                  <Settings size={20} color="#6b7280" />
                </View>
              </View>
            </View>

            {/* 搜索栏 */}
            <View className="flex gap-2 mb-3">
              <View className="flex-1 bg-gray-50 rounded-lg px-4 py-2">
                <Input
                  className="w-full bg-transparent"
                  placeholder="搜索姓名或手机号"
                  value={searchName}
                  onInput={(e) => setSearchName(e.detail.value)}
                />
              </View>
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadEmployeeList()}
              >
                <Search size={14} color="#6b7280" className="mr-1" />
                刷新
              </Button>
            </View>

            <View className="flex justify-between items-center">
              <Text className="block text-sm text-gray-500">共 {filteredEmployees.length} 名员工</Text>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsLoggedIn(false)}
              >
                <LogIn size={14} color="#6b7280" className="mr-1" />
                退出
              </Button>
            </View>
          </View>

          <View className="p-4">
            {filteredEmployees.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Text className="block text-gray-500">
                    {searchName ? '未找到匹配的员工' : '暂无员工数据'}
                  </Text>
                </CardContent>
              </Card>
            ) : (
              <View className="flex flex-col gap-3">
                {filteredEmployees.map((employee) => (
                  <Card key={employee.id}>
                    <CardContent className="p-4">
                      <View className="flex justify-between items-start mb-3">
                        <View className="flex items-center gap-2">
                          <User size={18} color="#2563eb" />
                          <Text className="block text-base font-semibold text-gray-900">{employee.name}</Text>
                          {getStatusBadge(employee.status)}
                        </View>
                        <Text className="block text-xs text-gray-400">
                          {new Date(employee.created_at).toLocaleDateString()}
                        </Text>
                      </View>

                      <View className="flex items-center gap-4 mb-3">
                        <View className="flex items-center gap-1">
                          <Phone size={14} color="#9ca3af" />
                          <Text className="block text-sm text-gray-600">{employee.phone}</Text>
                        </View>
                        {employee.education && (
                          <View className="flex items-center gap-1">
                            <GraduationCap size={14} color="#9ca3af" />
                            <Text className="block text-sm text-gray-600">{EDUCATION_LABELS[employee.education] || employee.education}</Text>
                          </View>
                        )}
                        {employee.join_date && (
                          <View className="flex items-center gap-1">
                            <Calendar size={14} color="#9ca3af" />
                            <Text className="block text-sm text-gray-600">{employee.join_date}</Text>
                          </View>
                        )}
                        {employee.hr_contact && (
                          <View className="flex items-center gap-1">
                            <Users size={14} color="#9ca3af" />
                            <Text className="block text-sm text-gray-600">{employee.hr_contact}</Text>
                          </View>
                        )}
                      </View>

                      <Separator className="mb-3" />

                      <View className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => viewEmployeeDetail(employee.id)}
                        >
                          <Eye size={14} color="#ffffff" className="mr-1" />
                          查看资料
                        </Button>
                        {adminRole !== 'level3' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => downloadEmployeeFiles(employee.id, employee.name)}
                          >
                            <Download size={14} color="#6b7280" className="mr-1" />
                            打包下载
                          </Button>
                        )}
                      </View>
                    </CardContent>
                  </Card>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* =============== 全局弹窗（不受视图切换影响） =============== */}

      {/* 修改密码弹窗 */}
      {showChangePwd && (
        <View className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setShowChangePwd(false)}>
          <View className="bg-white rounded-xl mx-8 p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation && e.stopPropagation()}>
            <Text className="block text-lg font-semibold text-gray-900 mb-4">修改密码</Text>
            <View className="flex flex-col gap-3">
              <View>
                <Text className="block text-sm text-gray-600 mb-1">当前密码</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input
                    className="w-full bg-transparent"
                    password
                    placeholder="请输入当前密码"
                    value={currentPwd}
                    onInput={(e) => setCurrentPwd(e.detail.value)}
                  />
                </View>
              </View>
              <View>
                <Text className="block text-sm text-gray-600 mb-1">新密码</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input
                    className="w-full bg-transparent"
                    password
                    placeholder="至少6位"
                    value={newPwd}
                    onInput={(e) => setNewPwd(e.detail.value)}
                  />
                </View>
              </View>
              <View>
                <Text className="block text-sm text-gray-600 mb-1">确认新密码</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input
                    className="w-full bg-transparent"
                    password
                    placeholder="再次输入新密码"
                    value={confirmPwd}
                    onInput={(e) => setConfirmPwd(e.detail.value)}
                  />
                </View>
              </View>
              <Button className="w-full mt-2" onClick={handleChangePassword}>
                确认修改
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <View className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => { setShowDeleteConfirm(false); setDeletingEmployeeId(null) }}>
          <View className="bg-white rounded-xl mx-8 p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation && e.stopPropagation()}>
            <View className="flex items-center gap-2 mb-3">
              <TriangleAlert size={20} color="#dc2626" />
              <Text className="block text-lg font-semibold text-gray-900">确认删除</Text>
            </View>
            <Text className="block text-sm text-gray-600 mb-4">确定删除该员工的所有资料？此操作不可恢复，包括所有已上传的证件文件。</Text>
            <View className="flex gap-3">
              <Button className="flex-1" variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeletingEmployeeId(null) }}>
                取消
              </Button>
              <Button className="flex-1" onClick={handleDeleteEmployee}>
                确认删除
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* 锁定确认弹窗 */}
      {showLockConfirm && detail && (
        <View className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setShowLockConfirm(false)}>
          <View className="bg-white rounded-xl mx-8 p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation && e.stopPropagation()}>
            <View className="flex items-center gap-2 mb-3">
              {detail.employee.lock_source === 'manual' ? <LockOpen size={20} color="#16a34a" /> : <Lock size={20} color="#f59e0b" />}
              <Text className="block text-lg font-semibold text-gray-900">
                {detail.employee.lock_source === 'manual' ? '解锁资料' : '锁定资料'}
              </Text>
            </View>
            <Text className="block text-sm text-gray-600 mb-4">
              {detail.employee.lock_source === 'manual'
                ? '解锁后，退出查看时将自动解除锁定，该员工可继续修改资料。确认解锁？'
                : '手动锁定后，即使退出查看，资料仍保持锁定状态，员工无法修改。确认锁定？'}
            </Text>
            <View className="flex gap-3">
              <Button className="flex-1" variant="outline" onClick={() => setShowLockConfirm(false)}>取消</Button>
              <Button className="flex-1" onClick={handleLockEmployee}>
                {detail.employee.lock_source === 'manual' ? '确认解锁' : '确认锁定'}
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* =============== 管理员管理面板（level1 专属） =============== */}
      {showAdminPanel && adminRole === 'level1' && (
        <View className="min-h-screen bg-gray-50">
          <View className="bg-white border-b border-gray-200 p-4">
            <View className="flex items-center gap-3">
              <View onClick={() => setShowAdminPanel(false)}>
                <ArrowLeft size={20} color="#374151" />
              </View>
              <Text className="block text-lg font-bold text-gray-900">管理员管理</Text>
            </View>
          </View>

          <View className="p-4">
            <Button
              className="w-full mb-4"
              onClick={() => {
                setNewAdminUsername('')
                setNewAdminPassword('')
                setNewAdminRole('level2')
                setNewAdminHrContacts([])
                setShowCreateAdmin(true)
              }}
            >
              <UserPlus size={16} color="#ffffff" className="mr-2" />
              创建管理员
            </Button>

            {adminList.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Text className="block text-gray-500">暂无管理员数据</Text>
                </CardContent>
              </Card>
            ) : (
              <View className="flex flex-col gap-3">
                {adminList.map((admin: any) => (
                  <Card key={admin.id}>
                    <CardContent className="p-4">
                      <View className="flex justify-between items-start mb-2">
                        <View className="flex items-center gap-2">
                          <Shield size={16} color={admin.role === 'level1' ? '#2563eb' : '#6b7280'} />
                          <Text className="block text-base font-semibold text-gray-900">{admin.username}</Text>
                          <Badge variant={admin.role === 'level1' ? 'default' : admin.role === 'level2' ? 'secondary' : 'outline'}>
                            {ROLE_LABELS[admin.role]}
                          </Badge>
                        </View>
                      </View>
                      <View className="mb-3">
                        <Text className="block text-sm text-gray-500">
                          查看范围：{admin.role === 'level1' ? '全部员工' : (admin.hrContacts || []).join('、') || '未设置'}
                        </Text>
                      </View>
                      {admin.role !== 'level1' && (
                        <View className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setEditingAdmin(admin)
                              setEditAdminPassword('')
                              setEditAdminHrContacts(admin.hrContacts || [])
                            }}
                          >
                            <Settings size={14} color="#6b7280" className="mr-1" />
                            修改
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setDeleteAdminId(admin.id)}
                          >
                            <Trash2 size={14} color="#dc2626" className="mr-1" />
                            删除
                          </Button>
                        </View>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* 创建管理员弹窗 */}
      {showCreateAdmin && (
        <View className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setShowCreateAdmin(false)}>
          <View className="bg-white rounded-xl mx-6 p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation && e.stopPropagation()}>
            <Text className="block text-lg font-semibold text-gray-900 mb-4">创建管理员</Text>
            <View className="flex flex-col gap-3">
              <View>
                <Text className="block text-sm text-gray-600 mb-1">用户名</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input className="w-full bg-transparent" placeholder="请输入用户名" value={newAdminUsername} onInput={(e) => setNewAdminUsername(e.detail.value)} />
                </View>
              </View>
              <View>
                <Text className="block text-sm text-gray-600 mb-1">密码</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input className="w-full bg-transparent" password placeholder="至少6位" value={newAdminPassword} onInput={(e) => setNewAdminPassword(e.detail.value)} />
                </View>
              </View>
              <View>
                <Text className="block text-sm text-gray-600 mb-1">管理员级别</Text>
                <View className="flex gap-2">
                  {['level2', 'level3'].map((r) => (
                    <Button key={r} size="sm" variant={newAdminRole === r ? 'default' : 'outline'} onClick={() => setNewAdminRole(r)}>
                      {ROLE_LABELS[r]}
                    </Button>
                  ))}
                </View>
              </View>
              <View>
                <Text className="block text-sm text-gray-600 mb-1">可查看的对接HR范围</Text>
                <View className="flex gap-2">
                  {['魏经理', '孙经理'].map((c) => (
                    <Button
                      key={c}
                      size="sm"
                      variant={newAdminHrContacts.includes(c) ? 'default' : 'outline'}
                      onClick={() => {
                        setNewAdminHrContacts(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
                      }}
                    >
                      {c}
                    </Button>
                  ))}
                </View>
              </View>
              <Button className="w-full mt-2" onClick={handleCreateAdmin}>确认创建</Button>
            </View>
          </View>
        </View>
      )}

      {/* 修改管理员弹窗 */}
      {editingAdmin && (
        <View className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => { setEditingAdmin(null); setEditAdminPassword(''); setEditAdminHrContacts([]) }}>
          <View className="bg-white rounded-xl mx-6 p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation && e.stopPropagation()}>
            <View className="flex items-center gap-2 mb-4">
              <KeyRound size={18} color="#2563eb" />
              <Text className="block text-lg font-semibold text-gray-900">修改管理员</Text>
            </View>
            <View className="mb-3">
              <Text className="block text-sm text-gray-500">用户名：{editingAdmin.username}</Text>
              <Text className="block text-sm text-gray-500">级别：{ROLE_LABELS[editingAdmin.role]}</Text>
            </View>
            <View className="flex flex-col gap-3">
              <View>
                <Text className="block text-sm text-gray-600 mb-1">重置密码（留空不修改）</Text>
                <View className="bg-gray-50 rounded-lg px-3 py-2">
                  <Input className="w-full bg-transparent" password placeholder="输入新密码" value={editAdminPassword} onInput={(e) => setEditAdminPassword(e.detail.value)} />
                </View>
              </View>
              <View>
                <Text className="block text-sm text-gray-600 mb-1">可查看的对接HR范围</Text>
                <View className="flex gap-2">
                  {['魏经理', '孙经理'].map((c) => (
                    <Button
                      key={c}
                      size="sm"
                      variant={editAdminHrContacts.includes(c) ? 'default' : 'outline'}
                      onClick={() => {
                        setEditAdminHrContacts(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
                      }}
                    >
                      {c}
                    </Button>
                  ))}
                </View>
              </View>
              <Button className="w-full mt-2" onClick={handleUpdateAdmin}>确认修改</Button>
            </View>
          </View>
        </View>
      )}

      {/* 删除管理员确认弹窗 */}
      {deleteAdminId && (
        <View className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setDeleteAdminId(null)}>
          <View className="bg-white rounded-xl mx-8 p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation && e.stopPropagation()}>
            <View className="flex items-center gap-2 mb-3">
              <TriangleAlert size={20} color="#dc2626" />
              <Text className="block text-lg font-semibold text-gray-900">确认删除</Text>
            </View>
            <Text className="block text-sm text-gray-600 mb-4">确定删除该管理员？此操作不可恢复。</Text>
            <View className="flex gap-3">
              <Button className="flex-1" variant="outline" onClick={() => setDeleteAdminId(null)}>取消</Button>
              <Button className="flex-1" onClick={handleDeleteAdmin}>确认删除</Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

export default HrAdminPage
