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
import { Download, Search, LogIn, User, Calendar, Phone, ArrowLeft, FileImage, FileText, Eye, GraduationCap } from 'lucide-react-taro'

interface EmployeeDetail {
  employee: {
    id: number
    name: string
    phone: string
    education: string | null
    join_date: string | null
    status: string
    created_at: string
  }
  files: Array<{
    id: number
    file_type: string
    file_key: string
    file_name: string
    file_size: number
    file_type_ext: string
    url: string
  }>
}

const EDUCATION_LABELS: Record<string, string> = {
  below_bachelor: '本科以下',
  bachelor: '本科',
  master: '研究生',
  doctor: '博士生',
}

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
  // 兼容旧命名
  degree_cert_1: '学位证书1',
  degree_cert_2: '学位证书2',
  degree_cert_3: '学位证书3',
  degree_cert_4: '学位证书4',
}

const FILE_TYPE_GROUPS = [
  { label: '身份证', types: ['id_card_front', 'id_card_back'] },
  { label: '学历学位证书', types: ['diploma', 'degree', 'master_diploma', 'master_degree', 'doctor_diploma', 'doctor_degree', 'degree_cert_1', 'degree_cert_2', 'degree_cert_3', 'degree_cert_4'] },
  { label: '体检报告', types: ['medical_report'] },
  { label: '离职证明', types: ['resignation_proof'] },
]

const HrAdminPage = () => {
  const [token, setToken] = useState<string>('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<EmployeeDetail | null>(null)
  const [searchName, setSearchName] = useState('')

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
      console.log('登录响应:', res.data)

      if (res.data.code === 200) {
        setToken(res.data.data.token)
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
      console.log('员工列表响应:', res.data)

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
      console.log('员工详情响应:', res.data)

      if (res.data.code === 200) {
        setDetail(res.data.data)
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
              console.log('下载结果:', downloadRes)

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
            } else {
              // H5 环境：通过 fetch 获取 blob 再下载
              Taro.showLoading({ title: '打包下载中...' })
              const downloadUrl = `/api/hr/employees/${employeeId}/download?token=${encodeURIComponent(token)}`

              const res = await fetch(downloadUrl)
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

  // =============== 详情视图 ===============
  if (detail) {
    const allImageUrls = detail.files
      .filter(f => f.file_type_ext?.startsWith('image/'))
      .map(f => f.url)

    return (
      <View className="bg-gray-50 min-h-screen">
        {/* 顶部栏 */}
        <View className="bg-white border-b border-gray-200 p-4">
          <View className="flex items-center gap-3">
            <View onClick={() => setDetail(null)}>
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
                  <Text className="block text-sm text-gray-500 w-16">状态</Text>
                  {getStatusBadge(detail.employee.status)}
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
                        const isImage = file.file_type_ext?.startsWith('image/')
                        return (
                          <View
                            key={type}
                            className="border border-gray-200 rounded-lg overflow-hidden"
                            onClick={() => isImage && previewImage(file.url, allImageUrls)}
                          >
                            {isImage ? (
                              <Image src={file.url} mode="aspectFill" style={{ width: '100%', height: '200rpx' }} />
                            ) : (
                              <View className="p-3 flex flex-col items-center justify-center" style={{ minHeight: '160rpx' }}>
                                <FileText size={24} color="#6b7280" />
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
                        const isImage = file.file_type_ext?.startsWith('image/')
                        return (
                          <View key={file.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            {isImage ? (
                              <View
                                className="border border-gray-200 rounded overflow-hidden flex-shrink-0"
                                onClick={() => previewImage(file.url, allImageUrls)}
                              >
                                <Image src={file.url} mode="aspectFill" style={{ width: '120rpx', height: '120rpx' }} />
                              </View>
                            ) : (
                              <View className="flex-shrink-0 p-2 bg-white rounded border border-gray-200">
                                <FileText size={24} color="#dc2626" />
                              </View>
                            )}
                            <View className="flex-1 min-w-0">
                              <Text className="block text-sm text-gray-900 truncate">{file.file_name}</Text>
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

          {/* 下载按钮 */}
          <Button
            className="w-full"
            onClick={() => downloadEmployeeFiles(detail.employee.id, detail.employee.name)}
          >
            <Download size={16} color="#ffffff" className="mr-2" />
            打包下载全部资料
          </Button>
        </View>
      </View>
    )
  }

  // =============== 登录视图 ===============
  if (!isLoggedIn) {
    return (
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

              <View className="mt-4 p-3 bg-blue-50 rounded-lg">
                <Text className="block text-xs text-gray-600">
                  默认账号：admin / admin123
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>
    )
  }

  // =============== 员工列表视图 ===============
  return (
    <View className="min-h-screen bg-gray-50">
      <View className="bg-white border-b border-gray-200 p-4">
        <Text className="block text-lg font-bold text-gray-900 mb-3">
          HR 管理系统
        </Text>

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
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => downloadEmployeeFiles(employee.id, employee.name)}
                    >
                      <Download size={14} color="#6b7280" className="mr-1" />
                      打包下载
                    </Button>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}

export default HrAdminPage
